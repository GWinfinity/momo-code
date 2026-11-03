"""Run one genesis episode for a candidate robot program and grade it.

Resolution order for the simulation interpreter:

1. If ``genesis`` imports in the current interpreter, run in-process.
2. Else, if ``MOMO_SIM_PYTHON`` is set and differs from ``sys.executable``,
   re-exec into it, carrying a PYTHONPATH that prepends ``--extra-pythonpath``
   and always includes the vendored package's parent directory
   (``packages/opencode/python``).
3. If ``cloud_robotics_sim`` is not importable, exit 2 with fix instructions.

The episode itself is delegated to ``cap_harness.run.run_program`` with
``benchmark="genesis"`` -- the GenesisTaskRegistry, GenesisAdapter, and the
in-process providers (``MotionStrategy(ik_solver="mink")``) are wired by the
real run machinery exactly as in ASPIRE's ``scripts/run_genesis_pick_cube.py``.

Final line on stdout::

    SIM_EVAL_RESULT task=<task> seed=<seed> success=<true|false> steps=<n> wall=<s> outcome=<abs path>

Exit status is 0 iff the harness reports task success, 1 otherwise (including
harness errors), and 2 when the simulation environment is missing.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
from pathlib import Path
import shutil
import sys
import time

#: Directory that makes both ``cap_harness`` and ``sim_eval`` importable.
VENDORED_PARENT = Path(__file__).resolve().parent.parent

#: Known sim tasks: task name -> (suite, task_id).
TASKS: dict[str, tuple[str, int]] = {"pick_cube": ("genesis", 0)}

#: Camera resolution, matching the proven ASPIRE genesis smoke runner.
_CAMERA_WIDTH = 320
_CAMERA_HEIGHT = 240

_SIM_MODULES = ("genesis", "cloud_robotics_sim")


def _import_error(modules: tuple[str, ...]) -> str | None:
    for name in modules:
        try:
            importlib.import_module(name)
        except Exception as exc:  # missing dep, wrong interpreter, anything
            return f"{name}: {type(exc).__name__}: {exc}"
    return None


def _extra_pythonpath_from_argv(argv: list[str]) -> list[str]:
    """Pull ``--extra-pythonpath`` values out of raw argv without argparse."""
    paths: list[str] = []
    for i, token in enumerate(argv):
        if token == "--extra-pythonpath" and i + 1 < len(argv):
            paths.extend(p for p in argv[i + 1].split(os.pathsep) if p)
        elif token.startswith("--extra-pythonpath="):
            paths.extend(p for p in token.split("=", 1)[1].split(os.pathsep) if p)
    return paths


def _ensure_sim_interpreter(argv: list[str]) -> None:
    """Re-exec into MOMO_SIM_PYTHON when genesis is not importable here."""
    if _import_error(("genesis",)) is None:
        return
    sim_python = os.environ.get("MOMO_SIM_PYTHON")
    if not sim_python:
        return
    if Path(sim_python).resolve() == Path(sys.executable).resolve():
        # Already the sim interpreter and genesis still does not import: fall
        # through to the exit-2 diagnostics instead of re-exec looping.
        return
    pythonpath = _extra_pythonpath_from_argv(argv)
    pythonpath.append(str(VENDORED_PARENT))
    pythonpath.extend(p for p in os.environ.get("PYTHONPATH", "").split(os.pathsep) if p)
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join(dict.fromkeys(pythonpath))
    print(f"sim_eval: genesis not importable here; re-exec into {sim_python}", file=sys.stderr)
    os.execve(sim_python, [sim_python, "-m", "sim_eval", *argv], env)


def _diagnose_sim_environment() -> int:
    missing = _import_error(_SIM_MODULES)
    if missing is None:
        return 0
    print(
        "sim_eval: the genesis simulation stack is not importable "
        f"({missing}).\n"
        "Fix: run under the genesis-cloud-sim venv (set MOMO_SIM_PYTHON to its "
        "python.exe), or install it (`pip install -e <path-to>/genesis-cloud-sim`) "
        "and put its src on PYTHONPATH. sim_eval adds the vendored cap_harness "
        "parent dir to PYTHONPATH automatically.",
        file=sys.stderr,
    )
    return 2


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="sim_eval", description=__doc__)
    parser.add_argument("--task", required=True, choices=sorted(TASKS))
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument(
        "--band",
        default="dev",
        choices=["dev", "heldout"],
        help="metadata only: recorded into the outcome sidecar, no behavior change",
    )
    parser.add_argument("--program", type=Path, required=True)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="output root for the run directory (default: <cwd>/outputs/sim_eval)",
    )
    parser.add_argument("--no-videos", action="store_true")
    parser.add_argument(
        "--extra-pythonpath",
        default="",
        help="extra PYTHONPATH entries (os.pathsep-separated) carried on re-exec",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    args = _parse_args(argv)

    _ensure_sim_interpreter(argv)
    diagnosed = _diagnose_sim_environment()
    if diagnosed:
        return diagnosed

    # Deferred: cap_harness needs the simulation interpreter's site-packages.
    from cap_harness.run import run_program  # noqa: E402

    suite, task_id = TASKS[args.task]
    program = args.program.expanduser().resolve()
    if not program.is_file():
        print(f"sim_eval: program not found: {program}", file=sys.stderr)
        return 2
    output_root = (
        args.out_dir.expanduser().resolve()
        if args.out_dir is not None
        else Path.cwd() / "outputs" / "sim_eval"
    )

    started = time.monotonic()
    run_dir: Path | None = None
    outcome_path: Path | None = None
    success = False
    steps = 0
    try:
        outcome = run_program(
            benchmark="genesis",
            suite=suite,
            task_id=task_id,
            seed=args.seed,
            program_path=program,
            output_root=output_root,
            camera_width=_CAMERA_WIDTH,
            camera_height=_CAMERA_HEIGHT,
            capture_videos=not args.no_videos,
        )
        run_dir = outcome.run_dir
        recorded = run_dir / "outcome.json"
        payload = json.loads(recorded.read_text(encoding="utf-8"))
        success = bool(payload["task_success"])
        steps = int(payload["steps_executed"])
        outcome_path = recorded
        if args.out_dir is not None:
            # --out-dir promises outcome.json directly inside it.
            target = output_root / "outcome.json"
            shutil.copyfile(recorded, target)
            outcome_path = target
    except Exception as exc:
        print(f"sim_eval: run failed: {type(exc).__name__}: {exc}", file=sys.stderr)
    wall = time.monotonic() - started

    if outcome_path is not None:
        sidecar = {
            "task": args.task,
            "suite": suite,
            "task_id": task_id,
            "seed": args.seed,
            "band": args.band,
            "program": str(program),
            "run_dir": str(run_dir) if run_dir is not None else None,
            "success": success,
        }
        outcome_path.parent.mkdir(parents=True, exist_ok=True)
        (outcome_path.parent / "sim_eval.json").write_text(
            json.dumps(sidecar, indent=2), encoding="utf-8"
        )

    print(
        f"SIM_EVAL_RESULT task={args.task} seed={args.seed} "
        f"success={'true' if success else 'false'} steps={steps} "
        f"wall={round(wall, 2)} "
        f"outcome={outcome_path.resolve() if outcome_path is not None else ''}"
    )
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
