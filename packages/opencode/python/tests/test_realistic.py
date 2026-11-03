"""Realistic-eval guarantees for the cap_harness.

The agent under test must never see verifier ground truth: task-context
metadata in realistic mode withholds it, and the public tool layer strips
privileged keys as defense-in-depth.

Runs under pytest or directly: ``python tests/test_realistic.py``.
"""

from __future__ import annotations

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cap_harness.contracts import TaskContext
from cap_harness.runtime import _SENSITIVE_KEYS, sanitize_task_context
from cap_harness.genesis import adapter as genesis_adapter


def _metadata(metadata, seed=7, horizon=100, backend="cpu", ground_truth=None, realistic=True):
    return genesis_adapter.task_context_metadata(
        metadata=metadata,
        seed=seed,
        horizon=horizon,
        backend=backend,
        ground_truth=ground_truth if ground_truth is not None else {"cube_xy_m": (0.1, 0.2), "initial_cube_z_m": 0.4},
        realistic=realistic,
    )


def _fake_task_metadata():
    return genesis_adapter.GenesisTaskMetadata()


def test_realistic_metadata_withholds_ground_truth():
    meta = _metadata(_fake_task_metadata(), realistic=True)
    for key in genesis_adapter.GROUND_TRUTH_METADATA_KEYS:
        assert key not in meta, f"ground truth {key} leaked in realistic mode"
    assert meta["task_ref"] == "genesis:pick_cube"
    assert meta["seed"] == 7
    assert meta["horizon"] == 100
    assert meta["backend"] == "cpu"
    assert "cube_size_m" in meta  # static task geometry stays visible


def test_debug_metadata_includes_ground_truth():
    meta = _metadata(_fake_task_metadata(), realistic=False)
    for key in genesis_adapter.GROUND_TRUTH_METADATA_KEYS:
        assert key in meta


def test_realistic_enabled_env_default_and_override():
    original = os.environ.get(genesis_adapter.REALISTIC_ENV_VAR)
    try:
        os.environ.pop(genesis_adapter.REALISTIC_ENV_VAR, None)
        assert genesis_adapter.realistic_enabled() is True
        os.environ[genesis_adapter.REALISTIC_ENV_VAR] = "0"
        assert genesis_adapter.realistic_enabled() is False
        os.environ[genesis_adapter.REALISTIC_ENV_VAR] = "1"
        assert genesis_adapter.realistic_enabled() is True
    finally:
        if original is None:
            os.environ.pop(genesis_adapter.REALISTIC_ENV_VAR, None)
        else:
            os.environ[genesis_adapter.REALISTIC_ENV_VAR] = original


def test_sanitize_task_context_strips_privileged_keys():
    context = TaskContext(
        suite="genesis",
        task_id=0,
        task_name="pick_cube",
        language="en",
        family="manipulation",
        metadata={
            "task_ref": "genesis:pick_cube",
            "seed": 7,
            "object_pose": (1.0, 2.0, 3.0),  # privileged
            "reward": 1.25,  # privileged
            "raw_state": {"q": [1, 2]},  # privileged
            "ground_truth_spawn": (0.1, 0.2),  # privileged
        },
    )
    sanitized = sanitize_task_context(context)
    assert sanitized.metadata["task_ref"] == "genesis:pick_cube"
    assert sanitized.metadata["seed"] == 7
    for key in sanitized.metadata:
        assert not any(term in key.lower() for term in _SENSITIVE_KEYS), f"{key} survived sanitization"


def test_sanitize_task_context_keeps_clean_context_intact():
    context = TaskContext(
        suite="genesis",
        task_id=0,
        task_name="pick_cube",
        language="en",
        family="manipulation",
        metadata={"task_ref": "genesis:pick_cube", "seed": 7},
    )
    assert sanitize_task_context(context) is context  # no copy when nothing to strip


def test_sanitize_ignores_non_mapping_metadata():
    context = TaskContext(
        suite="genesis",
        task_id=0,
        task_name="pick_cube",
        language="en",
        family="manipulation",
    )
    # Simulate a lenient adapter bypassing __post_init__ with a non-mapping.
    object.__setattr__(context, "metadata", None)
    assert sanitize_task_context(context) is context


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"  FAIL {name}: {exc}")
    print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'}")
    sys.exit(1 if failures else 0)
