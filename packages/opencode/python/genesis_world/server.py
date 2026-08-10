#!/usr/bin/env python3
"""
genesis_world server — persistent world namespace over NDJSON JSON-RPC.

A long-running process that owns a persistent Python namespace (WORLD)
backed by a Genesis physics scene. The momo CLI talks to it over
stdin/stdout, one JSON object per line:

  request:  {"id": 1, "method": "exec", "params": {"code": "step(10)"}}
  response: {"id": 1, "ok": true, "result": {...}}

Methods:
  ping                          liveness check
  init    {viewer?, backend?}   create the Genesis scene (destroys any existing one)
  exec    {code}                execute code in WORLD, capture stdout/stderr
  eval    {expr}                evaluate an expression, return repr()
  observe {}                    call WORLD["observe"]() if defined, else scene info
  reset   {}                    clear WORLD back to the pristine namespace
  shutdown {}                   exit the process

The WORLD namespace persists across exec calls — the agent's context IS
its variables (RLM philosophy). At init, every *.py file in
~/.momo/sim/skills/ is exec'd into WORLD ("skills as code").

Only stdout lines that are complete JSON-RPC responses are protocol
traffic; everything else is prefixed with a log marker.
"""

import contextlib
import io
import json
import os
import sys
import traceback

# Make the bundled genesis_world runtime package importable from agent code:
#   from genesis_world import sensors, safety, perception
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MAX_OUTPUT_CHARS = 16384
PROTO_PREFIX = "@@RPC@@"

# ---------------------------------------------------------------------------
# Protocol plumbing
# ---------------------------------------------------------------------------


def send(obj):
    sys.stdout.write(PROTO_PREFIX + json.dumps(obj, default=repr) + "\n")
    sys.stdout.flush()


def log(msg):
    sys.stdout.write(f"@@LOG@@{msg}\n")
    sys.stdout.flush()


def truncate(s, limit=MAX_OUTPUT_CHARS):
    if s is None:
        return ""
    s = str(s)
    return s if len(s) <= limit else s[:limit] + f"\n…[truncated {len(s) - limit} chars]"


# ---------------------------------------------------------------------------
# World namespace
# ---------------------------------------------------------------------------

WORLD = {}
_INITIALIZED = {"ok": False, "backend": None, "viewer": False}


def _step(n=1):
    """Advance the physics scene by n steps."""
    scene = WORLD.get("scene")
    if scene is None:
        raise RuntimeError("scene not initialized — call init first")
    for _ in range(int(n)):
        scene.step()


def _skills_dir():
    home = os.environ.get("MOMO_CONFIG_DIR") or os.path.join(
        os.path.expanduser("~"), ".momo"
    )
    return os.path.join(home, "sim", "skills")


def _load_skills(namespace):
    """Exec every *.py in ~/.momo/sim/skills/ into the world namespace."""
    loaded = []
    skills_dir = _skills_dir()
    if not os.path.isdir(skills_dir):
        return loaded
    for fname in sorted(os.listdir(skills_dir)):
        if not fname.endswith(".py") or fname.startswith("_"):
            continue
        path = os.path.join(skills_dir, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                code = f.read()
            exec(compile(code, path, "exec"), namespace)
            fns = [
                k
                for k, v in namespace.items()
                if callable(v) and getattr(v, "__module__", None) is None
            ]
            loaded.append({"file": fname, "status": "ok"})
        except Exception:
            loaded.append(
                {"file": fname, "status": "error", "error": traceback.format_exc(limit=3)}
            )
    return loaded


def _pristine_namespace():
    ns = {"WORLD": WORLD, "step": _step, "ESTOP": False, "__name__": "__world__"}
    WORLD.clear()
    WORLD.update(ns)
    return WORLD


def _inject_world_into_runtime():
    """Bind runtime modules (sensors/safety/perception) to this WORLD."""
    for mod_name in ("sensors", "safety", "perception"):
        try:
            mod = __import__(f"genesis_world.{mod_name}", fromlist=[mod_name])
            mod.WORLD = WORLD
        except ImportError:
            continue  # module not shipped in this installation
        except Exception:
            log(f"warning: failed to inject WORLD into genesis_world.{mod_name}")


WORLD.update(_pristine_namespace())

# ---------------------------------------------------------------------------
# Methods
# ---------------------------------------------------------------------------


def m_ping(_params):
    return {
        "pong": True,
        "initialized": _INITIALIZED["ok"],
        "backend": _INITIALIZED["backend"],
    }


def m_init(params):
    import genesis as gs  # noqa:  imported lazily — heavy

    viewer = bool(params.get("viewer", False))
    backend_name = params.get("backend") or os.environ.get("MOMO_SIM_BACKEND", "cpu")
    backend = gs.gpu if backend_name == "gpu" else gs.cpu

    gs.init(backend=backend, logging_level="warning")

    scene = gs.Scene(show_viewer=viewer)

    WORLD.clear()
    WORLD.update(_pristine_namespace())
    WORLD["gs"] = gs
    WORLD["scene"] = scene

    _inject_world_into_runtime()

    skills = _load_skills(WORLD)

    _INITIALIZED.update({"ok": True, "backend": backend_name, "viewer": viewer})
    return {
        "initialized": True,
        "backend": backend_name,
        "viewer": viewer,
        "genesis_version": getattr(gs, "__version__", "unknown"),
        "skills_loaded": skills,
    }


def m_exec(params):
    code = params.get("code", "")
    if not code.strip():
        return {"stdout": "", "stderr": ""}
    buf_out, buf_err = io.StringIO(), io.StringIO()
    error = None
    with contextlib.redirect_stdout(buf_out), contextlib.redirect_stderr(buf_err):
        try:
            exec(compile(code, "<agent>", "exec"), WORLD)
        except SystemExit:
            error = "SystemExit caught — the server process must not exit"
        except BaseException:
            error = traceback.format_exc()
    result = {"stdout": truncate(buf_out.getvalue()), "stderr": truncate(buf_err.getvalue())}
    if error:
        result["error"] = truncate(error)
    return result


def m_eval(params):
    expr = params.get("expr", "")
    if not expr.strip():
        return {"repr": "None"}
    try:
        value = eval(expr, WORLD)  # noqa: S307 — the world IS a REPL by design
        return {"repr": truncate(repr(value))}
    except BaseException:
        return {"error": truncate(traceback.format_exc())}


def m_observe(_params):
    observe_fn = WORLD.get("observe")
    if callable(observe_fn):
        try:
            return {"observation": observe_fn(), "source": "world.observe()"}
        except BaseException:
            return {"error": truncate(traceback.format_exc())}
    scene = WORLD.get("scene")
    info = {
        "initialized": _INITIALIZED["ok"],
        "backend": _INITIALIZED["backend"],
        "world_names": sorted(k for k in WORLD.keys() if not k.startswith("__")),
    }
    if scene is not None:
        try:
            info["entities"] = len(getattr(scene, "entities", []))
            info["is_built"] = bool(getattr(scene, "is_built", False))
        except Exception:
            pass
    return {"observation": info, "source": "default"}


def m_reset(_params):
    WORLD.clear()
    WORLD.update(_pristine_namespace())
    _INITIALIZED.update({"ok": False, "backend": None, "viewer": False})
    return {"reset": True}


def m_estop(_params):
    """Emergency stop: set the ESTOP flag honored by safety.smooth_move."""
    WORLD["ESTOP"] = True
    return {"estop": True}


def m_resume(_params):
    """Clear the ESTOP flag (explicit human/agent action required)."""
    WORLD["ESTOP"] = False
    return {"estop": False}


def m_shutdown(_params):
    send({"id": None, "ok": True, "result": {"bye": True}})
    sys.exit(0)


METHODS = {
    "ping": m_ping,
    "init": m_init,
    "exec": m_exec,
    "eval": m_eval,
    "observe": m_observe,
    "reset": m_reset,
    "estop": m_estop,
    "resume": m_resume,
    "shutdown": m_shutdown,
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main():
    log("genesis_world server ready")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            method = req.get("method", "")
            params = req.get("params") or {}
            handler = METHODS.get(method)
            if handler is None:
                send({"id": req_id, "ok": False, "error": f"unknown method: {method}"})
                continue
            result = handler(params)
            if method == "shutdown":
                continue  # shutdown sends its own response and exits
            send({"id": req_id, "ok": True, "result": result})
        except SystemExit:
            raise
        except BaseException:
            send({"id": req_id, "ok": False, "error": truncate(traceback.format_exc())})


if __name__ == "__main__":
    main()
