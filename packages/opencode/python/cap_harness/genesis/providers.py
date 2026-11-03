# Vendored from NVlabs/ASPIRE (Apache-2.0) and extended with the genesis adapter port.
"""In-process perception and kinematics providers for the Genesis adapter.

Both providers run inside the episode process against the live
:class:`~cap_harness.genesis.adapter.GenesisAdapter` scene -- no network
services on the path, which is what lets the Genesis smoke run offline.

Segmentation uses Genesis' native instance segmentation
(``camera.render(segmentation=True)``). The rasterizer stores, per pixel,
the index of the colliding rigid-solver link; the adapter resolves each link
to a scene role (``cube``/``table``/``robot``/``ground``), and
``segment_text`` matches the query against role aliases. That is name->entity
binding by construction for the v1 single-cube scene; the upgrade path to
open-vocabulary masks (e.g. a CLIP-based open-set segmenter over the RGB
frame) slots into the same :class:`SegmentationProvider` seam without
touching the API layer.

IK is registered under the legal in-process ``MotionStrategy`` slot
``"mink"`` (the same slot the real-robot YAM station uses for its local
solver). It composes Genesis' position-only IK with the adapter's
finite-difference DLS orientation refinement and verifies the achieved pose
before returning success, so an unreachable pose comes back typed as
``IK_UNREACHABLE`` instead of a best-effort configuration.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from cap_harness.contracts import (
    CameraObservation,
    IKResult,
    Segmentation,
    SegmentationSet,
)
from cap_harness.errors import ApiError, ErrorCode

#: Text aliases per scene role. v1 matching is case-insensitive substring in
#: either direction; keep aliases unambiguous within the single-cube scene.
ROLE_ALIASES: dict[str, frozenset[str]] = {
    "cube": frozenset({"cube", "red cube", "block", "box", "the cube", "sugar box"}),
    "table": frozenset({"table", "desk", "bench", "the table"}),
    "robot": frozenset({"robot", "arm", "franka", "panda", "gripper", "hand"}),
    "ground": frozenset({"ground", "floor", "plane"}),
}

#: Segmentations scoring for exact entity-index matches.
_SCORE = 1.0


def _camera_name_from_frame(frame: str) -> str:
    return frame.rsplit("/", 1)[-1] if "/" in frame else frame


class GenesisSegmentationProvider:
    """Text/point prompted segmentation over Genesis link-index masks."""

    def __init__(self, adapter: Any) -> None:
        self._adapter = adapter

    def _match_roles(self, query: str) -> list[str]:
        text = str(query).strip().lower()
        if not text:
            return []
        roles: list[str] = []
        for role, aliases in ROLE_ALIASES.items():
            for alias in aliases:
                if alias in text or (len(text) >= 3 and text in alias):
                    roles.append(role)
                    break
        return roles

    def _segmentation_for_role(
        self, observation: CameraObservation, role: str, mask: np.ndarray
    ) -> Segmentation:
        rows, columns = np.nonzero(mask)
        if rows.size == 0:
            box = None
        else:
            box = np.array(
                [float(columns.min()), float(rows.min()),
                 float(columns.max()), float(rows.max())],
                dtype=np.float64,
            )
        return Segmentation(
            mask=mask,
            label=role,
            score=_SCORE,
            camera_name=_camera_name_from_frame(observation.frame),
            frame=observation.frame,
            box_xyxy=box,
        )

    def _resolve(self, observation: CameraObservation, query: str) -> SegmentationSet:
        camera_name = _camera_name_from_frame(observation.frame)
        seg = self._adapter.last_segmentation(camera_name)
        if seg is None:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.UNSUPPORTED,
                    message=(
                        f"no segmentation frame has been rendered for camera {camera_name!r}"
                    ),
                ),
            )
        roles = self._match_roles(query)
        if not roles:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.NOT_FOUND,
                    message=f"query {query!r} matches no Genesis scene role",
                    details={"roles": sorted(ROLE_ALIASES)},
                ),
            )
        link_roles = self._adapter.link_roles()
        if seg.shape != observation.depth_m.shape:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.ADAPTER_FAILED,
                    message="cached segmentation shape does not match the observation",
                ),
            )
        segmentations: list[Segmentation] = []
        for role in roles:
            # Genesis rasterizer seg values are 1-based solver link indices
            # (0 is background), despite the camera docstring saying link_idx.
            indices = [i + 1 for i, r in enumerate(link_roles) if r == role]
            if not indices:
                continue
            mask = np.isin(seg, indices)
            if not bool(np.any(mask)):
                continue
            segmentations.append(self._segmentation_for_role(observation, role, mask))
        if not segmentations:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.NOT_FOUND,
                    message=(
                        f"query {query!r} matched roles {roles} but none are visible "
                        f"in camera {camera_name!r}"
                    ),
                ),
            )
        return SegmentationSet(
            ok=True,
            segmentations=tuple(segmentations),
            diagnostics={
                "provider": "genesis-instance-segmentation",
                # CLIP/open-vocabulary masks would upgrade this provider in place.
                "matching": "role-alias",
                "roles": roles,
            },
        )

    def segment_text(
        self,
        observation: CameraObservation,
        query: str,
    ) -> SegmentationSet:
        return self._resolve(observation, query)

    def segment_points(
        self,
        observation: CameraObservation,
        points_px: np.ndarray,
        *,
        point_labels: np.ndarray | None = None,
    ) -> SegmentationSet:
        del point_labels  # entity-index masks need no foreground/background label
        camera_name = _camera_name_from_frame(observation.frame)
        seg = self._adapter.last_segmentation(camera_name)
        if seg is None:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.UNSUPPORTED,
                    message=f"no segmentation frame for camera {camera_name!r}",
                ),
            )
        try:
            points = np.asarray(points_px, dtype=np.int64).reshape(-1, 2)
        except (TypeError, ValueError) as exc:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.INVALID_REQUEST,
                    message=f"points_px must be an Nx2 array: {exc}",
                ),
            )
        if points.shape[0] == 0 or points.ndim != 2 or points.shape[1] != 2:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.INVALID_REQUEST,
                    message="points_px must be a non-empty Nx2 array",
                ),
            )
        height, width = seg.shape
        roles: list[str] = []
        link_roles = self._adapter.link_roles()
        for u, v in points:
            if not (0 <= v < height and 0 <= u < width):
                continue
            link_index = int(seg[int(v), int(u)]) - 1  # seg values are 1-based
            if 0 <= link_index < len(link_roles):
                role = link_roles[link_index]
                if role not in roles:
                    roles.append(role)
        if not roles:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.NOT_FOUND,
                    message="no prompt point lands on a known Genesis entity",
                ),
            )
        segmentations = []
        for role in roles:
            indices = [i + 1 for i, r in enumerate(link_roles) if r == role]
            mask = np.isin(seg, indices)
            if bool(np.any(mask)):
                segmentations.append(self._segmentation_for_role(observation, role, mask))
        if not segmentations:
            return SegmentationSet(
                ok=False,
                error=ApiError(
                    code=ErrorCode.NOT_FOUND,
                    message="prompt points matched no visible entity pixels",
                ),
            )
        return SegmentationSet(
            ok=True,
            segmentations=tuple(segmentations),
            diagnostics={"provider": "genesis-instance-segmentation", "roles": roles},
        )


class GenesisIKProvider:
    """Local full-pose IK behind the harness ``IKProvider`` seam (name: mink)."""

    def __init__(
        self,
        adapter: Any,
        *,
        tolerance_m: float = 0.01,
        orientation_tolerance_rad: float = 0.17,
    ) -> None:
        self._adapter = adapter
        self._tolerance_m = float(tolerance_m)
        self._orientation_tolerance_rad = float(orientation_tolerance_rad)

    def solve_ik(
        self,
        target_pose: Any,
        robot_state: Any,
        *,
        arm: str = "primary",
    ) -> IKResult:
        if arm != "primary":
            return IKResult(
                ok=False,
                arm=arm,
                embodiment="genesis",
                error=ApiError(code=ErrorCode.NOT_FOUND, message=f"unknown arm {arm!r}"),
            )
        if getattr(target_pose, "frame", None) != "robot_base":
            return IKResult(
                ok=False,
                arm=arm,
                embodiment="genesis",
                error=ApiError(
                    code=ErrorCode.INVALID_REQUEST,
                    message=(
                        f"target pose is in frame {getattr(target_pose, 'frame', None)!r}, "
                        "expected 'robot_base'"
                    ),
                ),
            )
        try:
            seed = np.asarray(
                robot_state.joint_positions[arm], dtype=np.float64
            ).reshape(-1)[:7]
        except (KeyError, TypeError, ValueError) as exc:
            return IKResult(
                ok=False,
                arm=arm,
                embodiment="genesis",
                error=ApiError(
                    code=ErrorCode.INVALID_REQUEST,
                    message=f"robot state does not carry the primary arm: {exc}",
                ),
            )
        try:
            joints, pos_err, orient_err_deg = self._adapter.solve_ik_full(
                np.asarray(target_pose.position, dtype=np.float64),
                np.asarray(target_pose.quaternion_wxyz, dtype=np.float64),
                seed=seed,
                position_tolerance_m=self._tolerance_m,
                orientation_tolerance_rad=self._orientation_tolerance_rad,
            )
        except Exception as exc:
            return IKResult(
                ok=False,
                arm=arm,
                embodiment="genesis",
                error=ApiError(
                    code=ErrorCode.IK_FAILED,
                    message=f"genesis IK failed: {exc}",
                    details={"exception_type": type(exc).__name__},
                ),
            )
        orient_err_rad = float(np.deg2rad(orient_err_deg))
        if pos_err > self._tolerance_m:
            return IKResult(
                ok=False,
                arm=arm,
                embodiment="genesis",
                error=ApiError(
                    code=ErrorCode.IK_UNREACHABLE,
                    message=(
                        f"genesis IK did not converge: {pos_err:.3f} m from the target "
                        f"(tolerance {self._tolerance_m:.3f} m)"
                    ),
                    details={"position_error_m": pos_err, "arm": arm},
                ),
            )
        if orient_err_rad > self._orientation_tolerance_rad:
            return IKResult(
                ok=False,
                arm=arm,
                embodiment="genesis",
                error=ApiError(
                    code=ErrorCode.IK_UNREACHABLE,
                    message=(
                        f"genesis IK orientation error {orient_err_deg:.1f} deg exceeds "
                        f"the {np.degrees(self._orientation_tolerance_rad):.1f} deg tolerance"
                    ),
                    details={"orientation_error_rad": orient_err_rad, "arm": arm},
                ),
            )
        return IKResult(
            ok=True,
            embodiment="genesis",
            joint_positions=np.asarray(joints, dtype=np.float64).reshape(-1),
            arm=arm,
            diagnostics={
                "solver": "mink",
                "backend": "genesis-dls+fd-refine",
                "position_error_m": pos_err,
                "orientation_error_deg": orient_err_deg,
            },
        )


__all__ = [
    "ROLE_ALIASES",
    "GenesisIKProvider",
    "GenesisSegmentationProvider",
]
