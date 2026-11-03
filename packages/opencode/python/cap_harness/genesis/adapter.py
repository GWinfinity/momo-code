# Vendored from NVlabs/ASPIRE (Apache-2.0) and extended with the genesis adapter port.
"""Genesis 1.4 environment adapter for the CaP harness (Franka pick-cube).

Runtime-only adapter over a single Genesis ``gs.Scene`` running the
``xml/franka_emika_panda/panda.xml`` built-in MJCF asset on the CPU backend.
Design facts established by probing genesis-world 1.4.0 (see the port notes
in the repo docs and the smoke runner):

- The panda MJCF exposes 9 DoFs (7 arm revolute + 2 prismatic finger joints,
  range 0..0.04 m each) and a separate ``hand`` link usable as the EE.
- Genesis' orientation-constrained IK is unreliable, so ``solve_ik`` on the
  adapter seeds with Genesis' position-only IK and refines with an
  in-process finite-difference DLS pass (pure FK reads, robot state
  restored afterwards -- the FD probes must never leak into the episode).
- High-gain PD (kp=5000) is stable here only because ``step`` slews the
  internal target (0.15 rad per control period); without the slew, far
  setpoints oscillate.
- Contact friction on CPU needs ``noslip_iterations=2``; with the default
  0 the pinch holds ~0 tangential force and lifted objects slip out.
- Entities are unbuilt at spawn time, so PD gains are applied on the first
  ``reset()``; the asset-default qpos is all-zeros, which violates joint 4's
  limits, so the adapter drives an explicit HOME configuration.
"""

from __future__ import annotations

from collections.abc import Mapping
import os
from typing import Any

import numpy as np

from cap_harness.contracts import (
    ArmCommand,
    CameraObservation,
    ExecutionResult,
    Observation,
    Pose,
    RobotAction,
    RobotPlanningContext,
    RobotState,
    StepResult,
    TaskContext,
    Trajectory,
)
from cap_harness.errors import ApiError, ErrorCode

from .registry import GenesisTaskMetadata, GenesisTaskRegistry

CAMERA_NAMES: tuple[str, str] = ("third_person", "wrist")
BASE_FRAME = "robot_base"
PRIMARY_ARM = "primary"
FRANKA_JOINT_NAMES: tuple[str, ...] = tuple(f"joint{i}" for i in range(1, 8))
EE_LINK_NAME = "hand"
ARM_DOF_INDEX = list(range(7))
FINGER_DOF_INDEX = (7, 8)

#: Home configuration (7 arm joints + 2 open fingers). Joint 4 must stay
#: below -0.0698 rad, so an all-zeros pose is not a legal home.
HOME_QPOS = np.array(
    [0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785, 0.04, 0.04], dtype=np.float64
)
ARM_HOME = HOME_QPOS[:7]

#: Absolute joint-position PD gains (applied at first reset).
_P_GAIN = 5000.0
_D_GAIN = 500.0
#: Max internal target slew per control period (rad); stabilizes far setpoints.
_MAX_SLEW_RAD = 0.15
#: Newton contact solve: without noslip iterations the pinch friction that a
#: pick depends on collapses to ~0 on the CPU backend.
_NOSLIP_ITERATIONS = 2

_CONTROL_FREQUENCY_HZ = 20.0
_CONTROL_PERIOD_S = 1.0 / _CONTROL_FREQUENCY_HZ
_SIM_SUBSTEPS = 5

TABLE_SIZE = (0.8, 0.6, 0.04)
TABLE_POS = (0.5, 0.0, 0.48)  # top surface at z=0.50
CUBE_RHO = 800.0
CUBE_FRICTION = 1.0

#: Where the wrist camera sits relative to the hand link (hand frame).
_WRIST_OFFSET_POS = (-0.12, 0.0, 0.05)

#: OpenGL->OpenCV camera-frame conversion (Genesis ``render_pointcloud``).
_OPENCV_FROM_OPENGL = np.diag((1.0, -1.0, -1.0, 1.0))

_TRAJECTORY_JOINT_TOLERANCE_RAD = 0.02
_TRAJECTORY_HOLD_STEPS = 100
_GRIPPER_MAX_STEPS = 40
_GRIPPER_TOLERANCE = 0.05

#: Cube must rise this far above its reset height for task success.
SUCCESS_LIFT_M = 0.05


def _quat_wxyz_to_matrix(quat_wxyz: np.ndarray) -> np.ndarray:
    w, x, y, z = (float(v) for v in quat_wxyz)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ],
        dtype=np.float64,
    )


def _matrix_to_quat_wxyz(matrix: np.ndarray) -> np.ndarray:
    trace = float(np.trace(matrix))
    if trace > 0.0:
        scale = 2.0 * np.sqrt(trace + 1.0)
        quat = np.array(
            [
                0.25 * scale,
                (matrix[2, 1] - matrix[1, 2]) / scale,
                (matrix[0, 2] - matrix[2, 0]) / scale,
                (matrix[1, 0] - matrix[0, 1]) / scale,
            ]
        )
    else:
        index = int(np.argmax(np.diag(matrix)))
        if index == 0:
            scale = 2.0 * np.sqrt(1.0 + matrix[0, 0] - matrix[1, 1] - matrix[2, 2])
            quat = np.array(
                [
                    (matrix[2, 1] - matrix[1, 2]) / scale,
                    0.25 * scale,
                    (matrix[0, 1] + matrix[1, 0]) / scale,
                    (matrix[0, 2] + matrix[2, 0]) / scale,
                ]
            )
        elif index == 1:
            scale = 2.0 * np.sqrt(1.0 + matrix[1, 1] - matrix[0, 0] - matrix[2, 2])
            quat = np.array(
                [
                    (matrix[0, 2] - matrix[2, 0]) / scale,
                    (matrix[0, 1] + matrix[1, 0]) / scale,
                    0.25 * scale,
                    (matrix[1, 2] + matrix[2, 1]) / scale,
                ]
            )
        else:
            scale = 2.0 * np.sqrt(1.0 + matrix[2, 2] - matrix[0, 0] - matrix[1, 1])
            quat = np.array(
                [
                    (matrix[1, 0] - matrix[0, 1]) / scale,
                    (matrix[0, 2] + matrix[2, 0]) / scale,
                    (matrix[1, 2] + matrix[2, 1]) / scale,
                    0.25 * scale,
                ]
            )
    quat = quat / np.linalg.norm(quat)
    if quat[0] < 0.0:
        quat = -quat
    return quat


def _pose_matrix(position: np.ndarray, quat_wxyz: np.ndarray) -> np.ndarray:
    transform = np.eye(4, dtype=np.float64)
    transform[:3, :3] = _quat_wxyz_to_matrix(quat_wxyz)
    transform[:3, 3] = position
    return transform


def _quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array(
        [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        ],
        dtype=np.float64,
    )


class GenesisAdapter:
    """Normalize one Genesis Franka pick-cube scene behind the adapter seam."""

    #: The franka fingers hold any commanded width until contact stalls them.
    gripper_holds_intermediate = True

    def __init__(
        self,
        *,
        registry: GenesisTaskRegistry | None = None,
        camera_width: int = 320,
        camera_height: int = 240,
        horizon: int | None = None,
        control_frequency: float = _CONTROL_FREQUENCY_HZ,
        backend: str = "cpu",
        run_observer: Any | None = None,
        settle_steps: int = 30,
    ) -> None:
        if camera_width <= 0 or camera_height <= 0:
            raise ValueError("camera dimensions must be positive")
        if control_frequency != _CONTROL_FREQUENCY_HZ:
            raise ValueError(
                f"GenesisAdapter runs at {_CONTROL_FREQUENCY_HZ} Hz control; "
                f"got {control_frequency}"
            )
        self.registry = registry if registry is not None else GenesisTaskRegistry()
        self.camera_width = int(camera_width)
        self.camera_height = int(camera_height)
        self.horizon = int(horizon) if horizon else 300
        self.backend = str(backend)
        self.control_frequency = float(control_frequency)
        self.control_period_s = _CONTROL_PERIOD_S
        self.settle_steps = int(settle_steps)
        self._run_observer = run_observer

        self._gs: Any | None = None
        self._scene: Any | None = None
        self._robot: Any | None = None
        self._cube: Any | None = None
        self._table: Any | None = None
        self._cameras: dict[str, Any] = {}
        self._link_roles: list[str] = []
        self._last_segmentation: dict[str, np.ndarray] = {}
        self._dof_limits: tuple[np.ndarray, np.ndarray] | None = None
        self._gains_applied = False

        self._commanded_target = HOME_QPOS.copy()
        self._elapsed_steps = 0
        self._task_metadata: GenesisTaskMetadata | None = None
        self._task_context: TaskContext | None = None
        self._seed: int | None = None
        self._episode_initial_cube_z: float | None = None
        self._closed = False

    # ------------------------------------------------------------------
    # Identity and metadata
    # ------------------------------------------------------------------

    @property
    def embodiment(self) -> str:
        return "genesis"

    @property
    def native_env(self) -> Any:
        return self._require_scene()

    @property
    def current_time_s(self) -> float:
        return self._elapsed_steps * self.control_period_s

    def get_current_time_s(self) -> float:
        return self.current_time_s

    @property
    def seed(self) -> int:
        if self._seed is None:
            raise RuntimeError("reset() must be called before seed metadata is available")
        return self._seed

    @property
    def task_metadata(self) -> GenesisTaskMetadata:
        if self._task_metadata is None:
            raise RuntimeError("reset() must be called before task metadata is available")
        return self._task_metadata

    def get_task_context(self) -> TaskContext:
        if self._task_context is None:
            raise RuntimeError("reset() must be called before reading task context")
        return self._task_context

    def get_controller_metadata(self) -> Mapping[str, Any]:
        """Nonprivileged controller description used by planning interpolators."""
        low, high = self._get_dof_limits()
        return {
            "control_frequency_hz": float(self.control_frequency),
            "control_period_s": float(self.control_period_s),
            "action_lower_bounds": low[:7].tolist(),
            "action_upper_bounds": high[:7].tolist(),
            "arm_names": (PRIMARY_ARM,),
            "gripper": {
                "holds_intermediate": True,
                "max_opening_m": 0.08,
                "closing_force_cap_n": 100.0,
            },
            "position_control": True,
            "slew_limit_rad_per_step": _MAX_SLEW_RAD,
        }

    def get_task_metadata(self) -> Mapping[str, Any]:
        metadata = self.task_metadata
        return {
            **metadata.to_manifest_record(),
            "seed": self._seed,
            "cube_size_m": metadata.cube_size_m,
            "table_top_z_m": TABLE_POS[2] + TABLE_SIZE[2] / 2.0,
            "base_frame": BASE_FRAME,
            "cameras": list(CAMERA_NAMES),
        }

    def get_planning_context(self) -> RobotPlanningContext:
        self._require_scene()
        return RobotPlanningContext(
            embodiment=self.embodiment,
            model="franka_panda",
            joint_names={PRIMARY_ARM: FRANKA_JOINT_NAMES},
            base_transforms={PRIMARY_ARM: np.eye(4, dtype=np.float64)},
            end_effector_links={PRIMARY_ARM: EE_LINK_NAME},
        )

    # ------------------------------------------------------------------
    # Genesis scene lifecycle
    # ------------------------------------------------------------------

    def _require_scene(self) -> Any:
        if self._scene is None:
            raise RuntimeError("reset() must be called before using the Genesis adapter")
        return self._scene

    def _get_dof_limits(self) -> tuple[np.ndarray, np.ndarray]:
        if self._dof_limits is None:
            robot = self._robot
            if robot is None:
                raise RuntimeError("reset() must be called before reading dof limits")
            low, high = robot.get_dofs_limit()
            self._dof_limits = (
                np.asarray(low, dtype=np.float64).reshape(-1),
                np.asarray(high, dtype=np.float64).reshape(-1),
            )
        return self._dof_limits

    def _build_scene(self, seed: int) -> None:
        try:
            import genesis as gs
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ModuleNotFoundError(
                "genesis-world is not installed; install genesis-world==1.4.0 "
                "to create a Genesis adapter"
            ) from exc

        self._gs = gs
        gs.init(backend=gs.cpu if self.backend == "cpu" else gs.gpu, seed=seed)
        scene = gs.Scene(
            sim_options=gs.options.SimOptions(
                dt=self.control_period_s, substeps=_SIM_SUBSTEPS
            ),
            rigid_options=gs.options.RigidOptions(noslip_iterations=_NOSLIP_ITERATIONS),
            vis_options=gs.options.VisOptions(segmentation_level="link"),
            show_viewer=False,
        )
        self._scene = scene
        scene.add_entity(gs.morphs.Plane())
        self._table = scene.add_entity(
            gs.morphs.Box(size=TABLE_SIZE, pos=TABLE_POS, fixed=True),
            gs.materials.Rigid(friction=1.0),
        )
        metadata = self.task_metadata
        cube_half = metadata.cube_size_m / 2.0
        self._cube = scene.add_entity(
            gs.morphs.Box(
                size=(metadata.cube_size_m,) * 3,
                pos=(0.45, 0.05, TABLE_POS[2] + TABLE_SIZE[2] / 2.0 + cube_half),
            ),
            gs.materials.Rigid(rho=CUBE_RHO, friction=CUBE_FRICTION),
        )
        self._robot = scene.add_entity(
            gs.morphs.MJCF(file="xml/franka_emika_panda/panda.xml", pos=(0, 0, 0)),
            gs.materials.Rigid(friction=1.0),
        )
        self._cameras["third_person"] = scene.add_camera(
            res=(self.camera_width, self.camera_height),
            pos=(0.9, -0.5, 0.75),
            lookat=(0.5, 0.0, 0.25),
            fov=45,
        )
        self._cameras["wrist"] = scene.add_camera(
            res=(self.camera_width, self.camera_height),
            pos=(0.0, 0.0, 0.3),
            lookat=(0.2, 0.0, 0.2),
            fov=70,
        )
        scene.build()
        self._repair_stdio()

        solver = scene.rigid_solver
        cube_entity = self._cube
        table_entity = self._table
        robot_entity = self._robot
        roles: list[str] = []
        for link in solver.links:
            entity = getattr(link, "entity", None) or getattr(link, "_entity", None)
            if entity is cube_entity:
                roles.append("cube")
            elif entity is table_entity:
                roles.append("table")
            elif entity is robot_entity:
                roles.append("robot")
            else:
                roles.append("ground")
        self._link_roles = roles

    @staticmethod
    def _repair_stdio() -> None:
        # genesis port: genesis/taichi can invalidate the inherited stderr
        # handle on Windows; any later subprocess spawn with inherited stdio
        # -- including the RunRecorder's imageio-ffmpeg video writers -- then
        # dies with WinError 6 (invalid handle). Re-bind fd 2 onto fd 1 to
        # repair inheritance for the rest of the process.
        try:
            os.dup2(1, 2)
        except OSError:
            pass

    def _apply_gains_once(self) -> None:
        if self._gains_applied:
            return
        robot = self._robot
        if robot is None:
            raise RuntimeError("robot is unavailable")
        robot.set_dofs_kp(np.full(9, _P_GAIN))
        robot.set_dofs_kv(np.full(9, _D_GAIN))
        self._get_dof_limits()
        self._gains_applied = True

    def reset(self, task_ref: object, seed: int) -> Observation:
        """(Re)initialize the task: rebuild on first call, reposition after."""
        if self._closed:
            raise RuntimeError("the Genesis adapter is closed")
        if isinstance(seed, bool | np.bool_) or not isinstance(seed, int | np.integer):
            raise ValueError("seed must be an integer")
        seed = int(seed)
        metadata = self.registry.resolve(task_ref)
        self._task_metadata = metadata
        self._seed = seed

        if self._scene is None:
            self._build_scene(seed)
        scene = self._require_scene()
        robot = self._robot
        cube = self._cube
        if robot is None or cube is None:
            raise RuntimeError("Genesis scene is missing robot or cube")
        self._apply_gains_once()

        # Robot back to the explicit home (asset-default zeros are invalid).
        robot.set_qpos(HOME_QPOS)
        robot.set_dofs_velocity(np.zeros(9, dtype=np.float64))
        self._commanded_target = HOME_QPOS.copy()

        # Deterministic per-seed cube layout.
        x, y = self.registry.layout_for_seed(seed)
        cube_half = metadata.cube_size_m / 2.0
        cube_z = TABLE_POS[2] + TABLE_SIZE[2] / 2.0 + cube_half
        cube.set_pos(np.array([x, y, cube_z], dtype=np.float64))
        cube.set_quat(np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64))
        set_vel = getattr(cube, "set_vel", None)
        if callable(set_vel):
            set_vel(np.zeros(3, dtype=np.float64))
        set_ang = getattr(cube, "set_ang", None)
        if callable(set_ang):
            set_ang(np.zeros(3, dtype=np.float64))

        # Settle: hold home so the scene reaches a static rest pose.
        for _ in range(self.settle_steps):
            robot.control_dofs_position(self._commanded_target)
            scene.step()
        # Early physics steps can re-break the stderr handle (see above).
        self._repair_stdio()

        self._elapsed_steps = 0
        self._episode_initial_cube_z = float(
            np.asarray(cube.get_pos(), dtype=np.float64).reshape(-1)[2]
        )
        self._task_context = TaskContext(
            suite=metadata.suite_name,
            task_id=metadata.task_id,
            task_name=metadata.task_name,
            language=metadata.language,
            family=metadata.family,
            metadata={
                "task_ref": metadata.task_ref,
                "seed": seed,
                "horizon": self.horizon,
                "cube_size_m": metadata.cube_size_m,
                "cube_xy_m": (float(x), float(y)),
                "initial_cube_z_m": self._episode_initial_cube_z,
                "backend": self.backend,
            },
        )
        observation = self.get_observation()
        if self._run_observer is not None:
            self._run_observer.on_reset(observation, metadata.to_manifest_record())
        return observation

    # ------------------------------------------------------------------
    # State and observations
    # ------------------------------------------------------------------

    def _base_from_world(self) -> np.ndarray:
        robot = self._robot
        if robot is None:
            raise RuntimeError("reset() must be called before reading state")
        base = robot.get_link("link0")
        base_pos = np.asarray(base.get_pos(), dtype=np.float64).reshape(3)
        base_quat = np.asarray(base.get_quat(), dtype=np.float64).reshape(4)
        return np.linalg.inv(_pose_matrix(base_pos, base_quat))

    def _eef_pose(self) -> Pose:
        robot = self._robot
        if robot is None:
            raise RuntimeError("reset() must be called before reading state")
        hand = robot.get_link(EE_LINK_NAME)
        world = _pose_matrix(
            np.asarray(hand.get_pos(), dtype=np.float64).reshape(3),
            np.asarray(hand.get_quat(), dtype=np.float64).reshape(4),
        )
        base_from_eef = self._base_from_world() @ world
        return Pose(
            position=base_from_eef[:3, 3],
            quaternion_wxyz=_matrix_to_quat_wxyz(base_from_eef[:3, :3]),
            frame=BASE_FRAME,
        )

    def _gripper_normalized(self) -> float:
        robot = self._robot
        if robot is None:
            raise RuntimeError("reset() must be called before reading state")
        qpos = np.asarray(robot.get_qpos(), dtype=np.float64).reshape(-1)
        opening_m = float(qpos[7] + qpos[8])
        return float(np.clip(opening_m / 0.08, 0.0, 1.0))

    def get_robot_state(self) -> RobotState:
        robot = self._robot
        if robot is None:
            raise RuntimeError("reset() must be called before reading robot state")
        qpos = np.asarray(robot.get_qpos(), dtype=np.float64).reshape(-1)
        qvel = np.asarray(robot.get_dofs_velocity(), dtype=np.float64).reshape(-1)
        return RobotState(
            joint_positions={PRIMARY_ARM: qpos[:7]},
            joint_velocities={PRIMARY_ARM: qvel[:7]},
            end_effector_poses={PRIMARY_ARM: self._eef_pose()},
            gripper_positions={PRIMARY_ARM: self._gripper_normalized()},
            base_frame=BASE_FRAME,
            joint_names={PRIMARY_ARM: FRANKA_JOINT_NAMES},
            timestamp_s=self.current_time_s,
            embodiment=self.embodiment,
        )

    def _update_wrist_camera(self) -> None:
        robot = self._robot
        camera = self._cameras.get("wrist")
        if robot is None or camera is None:
            return
        hand = robot.get_link(EE_LINK_NAME)
        hand_pos = np.asarray(hand.get_pos(), dtype=np.float64).reshape(3)
        hand_quat = np.asarray(hand.get_quat(), dtype=np.float64).reshape(4)
        world_from_hand = _pose_matrix(hand_pos, hand_quat)
        offset = np.eye(4, dtype=np.float64)
        offset[:3, 3] = np.array(_WRIST_OFFSET_POS, dtype=np.float64)
        camera.set_pose(transform=world_from_hand @ offset)

    def _camera_observation(self, name: str, timestamp_s: float) -> CameraObservation:
        self._require_scene()
        camera = self._cameras[name]
        rendered = camera.render(rgb=True, depth=True, segmentation=True)
        rgb = np.asarray(rendered[0])
        depth_m = np.asarray(rendered[1], dtype=np.float64)
        seg = np.asarray(rendered[2])
        self._last_segmentation[name] = seg

        intrinsics = np.asarray(camera.intrinsics, dtype=np.float64).reshape(3, 3)
        world_from_camera = np.asarray(camera.transform, dtype=np.float64).reshape(4, 4)
        # Publish the OpenCV optical frame (+x right, +y down, +z forward),
        # expressed in the robot base frame (see mask_to_point_cloud).
        base_from_camera = (
            self._base_from_world() @ world_from_camera @ _OPENCV_FROM_OPENGL
        )
        camera_pose = Pose(
            position=base_from_camera[:3, 3],
            quaternion_wxyz=_matrix_to_quat_wxyz(base_from_camera[:3, :3]),
            frame=BASE_FRAME,
        )
        return CameraObservation(
            rgb=rgb,
            depth_m=depth_m,
            intrinsics=intrinsics,
            frame=f"camera/{name}",
            camera_pose=camera_pose,
            timestamp_s=timestamp_s,
        )

    def get_observation(self) -> Observation:
        self._require_scene()
        self._update_wrist_camera()
        timestamp_s = self.current_time_s
        cameras = {
            name: self._camera_observation(name, timestamp_s) for name in CAMERA_NAMES
        }
        return Observation(
            cameras=cameras,
            robot_state=self.get_robot_state(),
            task_context=self.get_task_context(),
            timestamp_s=timestamp_s,
        )

    # ------------------------------------------------------------------
    # IK (used in-process by GenesisIKProvider)
    # ------------------------------------------------------------------

    def solve_ik_full(
        self,
        target_pos_base: np.ndarray,
        target_quat_base: np.ndarray | None,
        *,
        seed: np.ndarray | None = None,
        position_tolerance_m: float = 0.01,
        orientation_tolerance_rad: float = 0.15,
    ) -> tuple[np.ndarray, float, float]:
        """Return ``(q7, pos_err_m, orient_err_deg)`` for a base-frame EE target.

        Stage 1 is Genesis' position-only IK (accurate, well-seeded). Stage 2
        refines position and orientation with a finite-difference DLS pass over
        pure FK reads. The robot state is snapshotted and restored: an IK
        query must never move the episode.
        """
        robot = self._robot
        self._require_scene()
        if robot is None:
            raise RuntimeError("reset() must be called before solving IK")
        hand = robot.get_link(EE_LINK_NAME)
        snapshot = np.asarray(robot.get_qpos(), dtype=np.float64).reshape(-1).copy()
        base_from_world = self._base_from_world()
        target_pos_world = base_from_world[:3, :3] @ np.asarray(
            target_pos_base, dtype=np.float64
        ).reshape(3) + base_from_world[:3, 3]
        if seed is not None:
            seed_full = snapshot.copy()
            seed_full[:7] = np.asarray(seed, dtype=np.float64).reshape(-1)[:7]
        else:
            seed_full = snapshot

        sol = robot.inverse_kinematics(
            hand,
            pos=target_pos_world,
            quat=None,
            init_qpos=seed_full,
            dofs_idx_local=ARM_DOF_INDEX,
        )
        q = np.asarray(sol, dtype=np.float64).reshape(-1)[:7].copy()

        if target_quat_base is not None:
            rot_base = _quat_wxyz_to_matrix(np.asarray(target_quat_base, dtype=np.float64))
            rot_world = base_from_world[:3, :3] @ rot_base
            target_quat_world = _matrix_to_quat_wxyz(rot_world)
            q = self._refine_ik(
                hand, target_pos_world, target_quat_world, q, snapshot
            )

        # Verify against the solution's own FK before restoring the episode
        # state: reading after the restore would measure the snapshot pose.
        solution = snapshot.copy()
        solution[:7] = q
        robot.set_qpos(solution)
        achieved_pos = np.asarray(hand.get_pos(), dtype=np.float64).reshape(3)
        achieved_quat = np.asarray(hand.get_quat(), dtype=np.float64).reshape(4)
        base_from_world_now = self._base_from_world()
        pos_err = float(
            np.linalg.norm(
                (base_from_world_now[:3, :3] @ achieved_pos + base_from_world_now[:3, 3])
                - np.asarray(target_pos_base, dtype=np.float64).reshape(3)
            )
        )
        orient_err_deg = 0.0
        if target_quat_base is not None:
            quat_err = _quat_mul(
                np.asarray(target_quat_base, dtype=np.float64),
                np.array(
                    [
                        achieved_quat[0],
                        -achieved_quat[1],
                        -achieved_quat[2],
                        -achieved_quat[3],
                    ]
                ),
            )
            if quat_err[0] < 0:
                quat_err = -quat_err
            orient_err_deg = float(np.degrees(2.0 * np.arccos(np.clip(quat_err[0], 0.0, 1.0))))
        robot.set_qpos(snapshot)
        return q, pos_err, orient_err_deg

    def _refine_ik(
        self,
        hand: Any,
        target_pos_world: np.ndarray,
        target_quat_world: np.ndarray,
        seed7: np.ndarray,
        snapshot: np.ndarray,
        *,
        iters: int = 60,
        damping: float = 0.1,
        max_delta: float = 0.3,
    ) -> np.ndarray:
        robot = self._robot
        if robot is None:
            raise RuntimeError("robot unavailable")
        low, high = self._get_dof_limits()
        lo7, hi7 = low[:7], high[:7]
        e_w = np.array([1.0, 1.0, 1.0, 0.3, 0.3, 0.3], dtype=np.float64)

        def fk() -> tuple[np.ndarray, np.ndarray]:
            p = np.asarray(hand.get_pos(), dtype=np.float64).reshape(3)
            qq = np.asarray(hand.get_quat(), dtype=np.float64).reshape(4)
            return p, qq

        def set_arm(q7: np.ndarray) -> None:
            q = snapshot.copy()
            q[:7] = np.asarray(q7, dtype=np.float64).reshape(-1)[:7]
            robot.set_qpos(q)

        inv_achieved = lambda qq: np.array(
            [qq[0], -qq[1], -qq[2], -qq[3]], dtype=np.float64
        )

        q = np.asarray(seed7, dtype=np.float64).reshape(-1)[:7].copy()
        for _ in range(iters):
            set_arm(q)
            p, qq = fk()
            e_pos = target_pos_world - p
            q_err = _quat_mul(target_quat_world, inv_achieved(qq))
            if q_err[0] < 0:
                q_err = -q_err
            e_rot = 2.0 * q_err[1:]
            if np.linalg.norm(e_pos) < 5e-4 and np.linalg.norm(e_rot) < 0.01:
                break
            jacobian = np.zeros((6, 7), dtype=np.float64)
            h = 1e-4
            for j in range(7):
                dq = q.copy()
                dq[j] += h
                set_arm(dq)
                pj, qj = fk()
                jacobian[:3, j] = (pj - p) / h
                dq_err = _quat_mul(qj, inv_achieved(qq))
                if dq_err[0] < 0:
                    dq_err = -dq_err
                jacobian[3:, j] = 2.0 * dq_err[1:] / h
            jacobian = jacobian / e_w[:, None]
            system = jacobian.T @ jacobian + damping**2 * np.eye(7)
            delta = np.linalg.solve(
                system, jacobian.T @ np.concatenate([e_pos, 2.0 * e_rot])
            )
            norm = float(np.linalg.norm(delta))
            if norm > max_delta:
                delta = delta / norm * max_delta
            q = np.clip(q + delta, lo7, hi7)
        return q

    # ------------------------------------------------------------------
    # Control
    # ------------------------------------------------------------------

    def _slew_toward(self, target: np.ndarray) -> np.ndarray:
        delta = target - self._commanded_target
        norm = float(np.linalg.norm(delta))
        if norm > _MAX_SLEW_RAD:
            self._commanded_target = self._commanded_target + delta / norm * _MAX_SLEW_RAD
        else:
            self._commanded_target = target
        return self._commanded_target

    def _control_step(self, target9: np.ndarray) -> None:
        scene = self._require_scene()
        robot = self._robot
        if robot is None:
            raise RuntimeError("robot unavailable")
        applied = self._slew_toward(np.asarray(target9, dtype=np.float64).reshape(-1))
        robot.control_dofs_position(applied)
        scene.step()
        self._elapsed_steps += 1

    def native_step(self, action: RobotAction) -> StepResult:
        """Runtime-only step retaining native details for the run observer."""
        self._require_scene()
        if action.embodiment != self.embodiment:
            raise ValueError(
                f"action embodiment {action.embodiment!r} does not match {self.embodiment!r}"
            )
        if self._run_observer is not None:
            self._run_observer.before_step(action)
        command = action.arms[PRIMARY_ARM]
        target = self._commanded_target.copy()
        target[:7] = np.asarray(command.target, dtype=np.float64).reshape(-1)[:7]
        if command.gripper_position is not None:
            # q=0.04 per finger is fully open; normalized 1.0 means open.
            finger = float(command.gripper_position) * 0.04
            target[7] = finger
            target[8] = finger
        try:
            self._control_step(target)
            observation = self.get_observation()
        except Exception as exc:
            result = StepResult(
                ok=False,
                error=ApiError(
                    code=ErrorCode.ADAPTER_FAILED,
                    message=f"Genesis step failed: {exc}",
                    details={"exception_type": type(exc).__name__},
                ),
            )
            if self._run_observer is not None:
                self._run_observer.after_step(action, result)
            return result
        truncated = self._elapsed_steps >= self.horizon
        result = StepResult(
            ok=True,
            observation=observation,
            terminated=False,
            truncated=truncated,
            reward=None,
            diagnostics={
                "control_period_s": self.control_period_s,
                "step_index": self._elapsed_steps,
            },
        )
        if self._run_observer is not None:
            self._run_observer.after_step(action, result)
        return result

    def step(self, action: RobotAction) -> StepResult:
        runtime_result = self.native_step(action)
        return StepResult(
            ok=runtime_result.ok,
            observation=runtime_result.observation,
            terminated=runtime_result.terminated,
            truncated=runtime_result.truncated,
            reward=None,
            error=runtime_result.public_view().error,
            diagnostics={
                "control_period_s": self.control_period_s,
                "step_index": self._elapsed_steps,
            },
        )

    def execute_trajectory(self, trajectory: Trajectory) -> ExecutionResult:
        if not isinstance(trajectory, Trajectory):
            raise ValueError("trajectory must be a Trajectory")
        if trajectory.embodiment != self.embodiment:
            raise ValueError(
                f"trajectory embodiment {trajectory.embodiment!r} "
                f"does not match {self.embodiment!r}"
            )
        if trajectory.arm != PRIMARY_ARM:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(
                    ErrorCode.INVALID_REQUEST, "Genesis trajectories target the 'primary' arm"
                ),
            )
        if not np.isclose(trajectory.dt_s, self.control_period_s, rtol=0.0, atol=1e-9):
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(
                    ErrorCode.INVALID_REQUEST,
                    f"trajectory dt_s must equal the control period {self.control_period_s}",
                ),
            )
        state = self.get_robot_state()
        if tuple(trajectory.expected_start.joint_names[PRIMARY_ARM]) != tuple(
            state.joint_names[PRIMARY_ARM]
        ):
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(ErrorCode.STALE_PLAN, "trajectory joint names are stale"),
            )
        start_error = float(
            np.max(
                np.abs(
                    trajectory.expected_start.joint_positions[PRIMARY_ARM]
                    - state.joint_positions[PRIMARY_ARM]
                )
            )
        )
        if start_error > 0.15:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(
                    ErrorCode.STALE_PLAN,
                    "trajectory start no longer matches measured robot state",
                    details={"joint_error_rad": start_error, "tolerance": 0.15},
                ),
                final_errors={PRIMARY_ARM: start_error},
            )

        final_observation: Observation | None = None
        steps_executed = 0

        def apply_index(index: int) -> StepResult:
            joints = trajectory.joint_positions[index]
            gripper = (
                None
                if trajectory.gripper_positions is None
                else float(trajectory.gripper_positions[index])
            )
            return self.step(
                RobotAction(
                    arms={
                        PRIMARY_ARM: ArmCommand(
                            mode="joint_position",
                            target=joints,
                            gripper_position=gripper,
                            embodiment=self.embodiment,
                        )
                    }
                )
            )

        for index in range(len(trajectory.joint_positions)):
            result = apply_index(index)
            if not result.ok or result.observation is None:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps_executed,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=result.error
                    or ApiError(
                        code=ErrorCode.EXECUTION_FAILED,
                        message="trajectory step returned no observation",
                    ),
                    diagnostics={"failed_waypoint": index},
                )
            steps_executed += 1
            final_observation = result.observation
            if result.terminated or result.truncated:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps_executed,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=ApiError(
                        ErrorCode.TRUNCATED if result.truncated else ErrorCode.TERMINATED,
                        "episode ended before trajectory execution completed",
                    ),
                )

        final_joints = trajectory.joint_positions[-1]
        error_rad = float("inf")
        for _ in range(_TRAJECTORY_HOLD_STEPS):
            state_now = self.get_robot_state()
            error_rad = float(
                np.max(np.abs(state_now.joint_positions[PRIMARY_ARM] - final_joints))
            )
            if error_rad <= _TRAJECTORY_JOINT_TOLERANCE_RAD:
                break
            result = apply_index(len(trajectory.joint_positions) - 1)
            if not result.ok or result.observation is None:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps_executed,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=result.error
                    or ApiError(
                        code=ErrorCode.EXECUTION_FAILED,
                        message="trajectory settle returned no observation",
                    ),
                )
            steps_executed += 1
            final_observation = result.observation
            if result.terminated or result.truncated:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps_executed,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=ApiError(
                        ErrorCode.TRUNCATED if result.truncated else ErrorCode.TERMINATED,
                        "episode ended before the trajectory settled",
                    ),
                )
        if error_rad > _TRAJECTORY_JOINT_TOLERANCE_RAD:
            return ExecutionResult(
                ok=False,
                steps_executed=steps_executed,
                final_observation=final_observation,
                error=ApiError(
                    code=ErrorCode.TIMEOUT,
                    message="final trajectory waypoint did not converge",
                    details={
                        "joint_error_rad": error_rad,
                        "tolerance_rad": _TRAJECTORY_JOINT_TOLERANCE_RAD,
                    },
                ),
                final_errors={PRIMARY_ARM: error_rad},
            )
        return ExecutionResult(
            ok=True,
            steps_executed=steps_executed,
            final_observation=final_observation,
            final_errors={PRIMARY_ARM: error_rad},
            diagnostics={
                "control_period_s": self.control_period_s,
                "joint_error_rad": error_rad,
            },
        )

    # ------------------------------------------------------------------
    # Gripper and primitives
    # ------------------------------------------------------------------

    def set_grippers(self, positions: Mapping[str, float]) -> ExecutionResult:
        if not isinstance(positions, Mapping) or set(positions) != {PRIMARY_ARM}:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(
                    ErrorCode.INVALID_REQUEST,
                    "positions must contain only the 'primary' arm",
                ),
            )
        return self._drive_gripper(positions[PRIMARY_ARM])

    def set_gripper(self, position: float, *, arm: str = PRIMARY_ARM) -> ExecutionResult:
        if arm != PRIMARY_ARM:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(code=ErrorCode.NOT_FOUND, message=f"Genesis has no arm {arm!r}"),
            )
        return self._drive_gripper(position)

    def close_gripper(self, *, arm: str = PRIMARY_ARM) -> ExecutionResult:
        if arm != PRIMARY_ARM:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(code=ErrorCode.NOT_FOUND, message=f"Genesis has no arm {arm!r}"),
            )
        return self._drive_gripper(0.0, min_steps=25)

    def _drive_gripper(self, position: float, min_steps: int = 0) -> ExecutionResult:
        try:
            normalized = float(position)
        except (TypeError, ValueError):
            normalized = float("nan")
        if not np.isfinite(normalized) or not 0.0 <= normalized <= 1.0:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(
                    ErrorCode.INVALID_REQUEST,
                    "gripper position must be finite and in [0, 1]",
                ),
            )
        # q=0.04 per finger is fully open; normalized 1.0 means open.
        finger_target = normalized * 0.04
        target = self._commanded_target.copy()
        target[7] = finger_target
        target[8] = finger_target

        steps = 0
        final_observation: Observation | None = None
        for _ in range(max(min_steps, _GRIPPER_MAX_STEPS)):
            state = self.get_robot_state()
            if abs(state.gripper_positions[PRIMARY_ARM] - normalized) <= _GRIPPER_TOLERANCE:
                break
            result = self.step(
                RobotAction(
                    arms={
                        PRIMARY_ARM: ArmCommand(
                            mode="joint_position",
                            target=state.joint_positions[PRIMARY_ARM],
                            gripper_position=normalized,
                            embodiment=self.embodiment,
                        )
                    }
                )
            )
            if not result.ok or result.observation is None:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=result.error
                    or ApiError(
                        code=ErrorCode.EXECUTION_FAILED,
                        message="gripper step returned no observation",
                    ),
                )
            steps += 1
            final_observation = result.observation
            if result.terminated or result.truncated:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=ApiError(
                        ErrorCode.TRUNCATED if result.truncated else ErrorCode.TERMINATED,
                        "episode ended before the gripper reached its target",
                    ),
                )
        if final_observation is None:
            final_observation = self.get_observation()
        return ExecutionResult(
            ok=True,
            steps_executed=steps,
            final_observation=final_observation,
            diagnostics={
                "target_position": normalized,
                "final_position": self.get_robot_state().gripper_positions[PRIMARY_ARM],
                # Contact stall (holding an object) is expected and permissive.
                "permissive": True,
            },
        )

    def go_home(self, *, arm: str = PRIMARY_ARM) -> ExecutionResult:
        if arm != PRIMARY_ARM:
            return ExecutionResult(
                ok=False,
                steps_executed=0,
                error=ApiError(code=ErrorCode.NOT_FOUND, message=f"Genesis has no arm {arm!r}"),
            )
        steps = 0
        final_observation: Observation | None = None
        for _ in range(120):
            result = self.step(
                RobotAction(
                    arms={
                        PRIMARY_ARM: ArmCommand(
                            mode="joint_position",
                            target=ARM_HOME,
                            gripper_position=None,
                            embodiment=self.embodiment,
                        )
                    }
                )
            )
            if not result.ok or result.observation is None:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=result.error
                    or ApiError(
                        code=ErrorCode.EXECUTION_FAILED,
                        message="go_home step returned no observation",
                    ),
                )
            steps += 1
            final_observation = result.observation
            state = result.observation.robot_state
            error_rad = float(
                np.max(np.abs(state.joint_positions[PRIMARY_ARM] - ARM_HOME))
            )
            if error_rad <= 0.02:
                break
            if result.terminated or result.truncated:
                return ExecutionResult(
                    ok=False,
                    steps_executed=steps,
                    final_observation=final_observation,
                    terminated=result.terminated,
                    truncated=result.truncated,
                    error=ApiError(
                        ErrorCode.TRUNCATED if result.truncated else ErrorCode.TERMINATED,
                        "episode ended before go_home completed",
                    ),
                )
        return ExecutionResult(
            ok=True,
            steps_executed=steps,
            final_observation=final_observation,
            diagnostics={"home": "franka_ready_pose"},
        )

    # ------------------------------------------------------------------
    # Success predicate and teardown
    # ------------------------------------------------------------------

    def check_success(self) -> bool:
        """True when the cube has been lifted above its reset height."""
        cube = self._cube
        if cube is None or self._episode_initial_cube_z is None:
            raise RuntimeError("reset() must be called before check_success")
        cube_z = float(np.asarray(cube.get_pos(), dtype=np.float64).reshape(-1)[2])
        return bool(cube_z - self._episode_initial_cube_z > SUCCESS_LIFT_M)

    def cube_height_m(self) -> float:
        """Runtime-only cube height (used by diagnostics and the runner)."""
        cube = self._cube
        if cube is None:
            raise RuntimeError("reset() must be called before reading the cube")
        return float(np.asarray(cube.get_pos(), dtype=np.float64).reshape(-1)[2])

    def last_segmentation(self, camera_name: str) -> np.ndarray | None:
        return self._last_segmentation.get(camera_name)

    def link_roles(self) -> tuple[str, ...]:
        return tuple(self._link_roles)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        scene = self._scene
        self._scene = None
        self._robot = None
        self._cube = None
        self._table = None
        self._cameras = {}
        destroy = getattr(scene, "destroy", None) if scene is not None else None
        if callable(destroy):
            try:
                destroy()
            except Exception:
                pass

    def __enter__(self) -> GenesisAdapter:
        if self._closed:
            raise RuntimeError("the Genesis adapter is closed")
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        del exc_type, exc, traceback
        self.close()


__all__ = [
    "ARM_DOF_INDEX",
    "BASE_FRAME",
    "CAMERA_NAMES",
    "EE_LINK_NAME",
    "FRANKA_JOINT_NAMES",
    "HOME_QPOS",
    "PRIMARY_ARM",
    "GenesisAdapter",
]
