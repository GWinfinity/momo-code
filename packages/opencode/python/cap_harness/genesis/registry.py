# Vendored from NVlabs/ASPIRE (Apache-2.0) and extended with the genesis adapter port.
"""Task registry for the Genesis pick-cube smoke suite.

V1 ships a single task family: ``genesis:pick_cube`` -- a Franka Panda on a
table in front of a 4 cm cube. The registry owns the deterministic
seed-to-layout map so ``reset(task, seed)`` reproduces the same scene every
run without depending on simulator-internal RNG.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import numpy as np

SUITE_NAME = "genesis"
TASK_ID = 0
TASK_NAME = "pick_cube"
FAMILY = "manipulation"
LANGUAGE = "pick up the cube"
HORIZON = 300

#: Cube spawn region on the table (world == robot base frame, table top at z).
#: Kept inside the workspace the position-controlled franka reliably reaches
#: and grips at 20 Hz (measured envelope; the far corner near x=0.52, y=0.14
#: times out converging and slips during lift).
CUBE_X_RANGE = (0.40, 0.50)
CUBE_Y_RANGE = (-0.10, 0.12)
CUBE_SIZE_M = 0.04

#: Distinct probe layouts used when seeds are not mapped explicitly. All sit
#: inside the reliable grasp envelope measured for the 20 Hz position-
#: controlled franka (seeds 1-2 are the acceptance-tested smoke positions);
#: layouts past ~0.48 m in x still reach but the pinch slips during lift.
_PROBE_LAYOUTS: tuple[tuple[float, float], ...] = (
    (0.45, 0.05),
    (0.42, -0.08),
    (0.47, 0.01),
    (0.43, 0.07),
    (0.46, -0.04),
)


@dataclass(frozen=True, slots=True)
class GenesisTaskMetadata:
    """Resolved metadata for one Genesis task."""

    suite_name: str = SUITE_NAME
    task_id: int = TASK_ID
    task_name: str = TASK_NAME
    family: str = FAMILY
    language: str = LANGUAGE
    horizon: int = HORIZON
    cube_size_m: float = CUBE_SIZE_M
    extra: Mapping[str, Any] = field(default_factory=dict)

    @property
    def task_ref(self) -> str:
        return f"{self.suite_name}:{self.task_name}"

    def to_manifest_record(self) -> dict[str, Any]:
        return {
            "suite_name": self.suite_name,
            "task_id": self.task_id,
            "task_name": self.task_name,
            "family": self.family,
            "language": self.language,
            "horizon": self.horizon,
            "task_ref": self.task_ref,
        }


class GenesisTaskRegistry:
    """Resolve Genesis tasks and map seeds to deterministic cube layouts."""

    def __init__(self, metadata: GenesisTaskMetadata | None = None) -> None:
        self._metadata = metadata or GenesisTaskMetadata()

    @property
    def available_suites(self) -> tuple[str, ...]:
        return (SUITE_NAME,)

    def resolve(self, task_ref: object = None, task_id: int | None = None) -> GenesisTaskMetadata:
        """Accept a metadata object, ``suite``, ``suite:task``, ``(suite, id)`` or mapping."""
        if isinstance(task_ref, GenesisTaskMetadata):
            return task_ref
        if task_ref is None:
            return self._metadata
        suite: Any = None
        name: Any = None
        if isinstance(task_ref, Mapping):
            suite = task_ref.get("suite_name", task_ref.get("suite"))
            name = task_ref.get("task_name", task_ref.get("task"))
        elif isinstance(task_ref, tuple | list) and len(task_ref) == 2:
            suite, name = task_ref
        elif isinstance(task_ref, str):
            separator = ":" if ":" in task_ref else "/"
            if separator in task_ref:
                suite, _, name = task_ref.partition(separator)
            else:
                suite, name = task_ref, TASK_NAME
        else:
            suite = getattr(task_ref, "suite_name", SUITE_NAME)
            name = getattr(task_ref, "task_name", TASK_NAME)
        suite = SUITE_NAME if suite in (None, "") else str(suite)
        name = TASK_NAME if name in (None, "") else str(name)
        if suite != SUITE_NAME:
            raise ValueError(f"unknown Genesis suite {suite!r}; available: {SUITE_NAME}")
        if name != TASK_NAME:
            raise ValueError(f"unknown Genesis task {name!r}; available: {TASK_NAME}")
        return self._metadata

    def layout_for_seed(self, seed: int) -> tuple[float, float]:
        """Return the deterministic ``(x, y)`` cube position for one seed.

        Seeds 1..5 use hand-verified distinct layouts inside the spawn region;
        other seeds derive from a :class:`numpy.random.RandomState` so the map
        is stable across processes.
        """
        if isinstance(seed, bool) or not isinstance(seed, int | np.integer):
            raise ValueError("seed must be an integer")
        seed = int(seed)
        if 1 <= seed <= len(_PROBE_LAYOUTS):
            return _PROBE_LAYOUTS[seed - 1]
        rng = np.random.RandomState(seed)
        x = CUBE_X_RANGE[0] + (CUBE_X_RANGE[1] - CUBE_X_RANGE[0]) * float(rng.rand())
        y = CUBE_Y_RANGE[0] + (CUBE_Y_RANGE[1] - CUBE_Y_RANGE[0]) * float(rng.rand())
        return (x, y)

    def enumerate_tasks(self) -> tuple[GenesisTaskMetadata, ...]:
        return (self._metadata,)

    discover = enumerate_tasks


__all__ = [
    "CUBE_SIZE_M",
    "FAMILY",
    "HORIZON",
    "LANGUAGE",
    "SUITE_NAME",
    "TASK_ID",
    "TASK_NAME",
    "GenesisTaskMetadata",
    "GenesisTaskRegistry",
]
