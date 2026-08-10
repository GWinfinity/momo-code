#!/usr/bin/env python3
"""
genesis_world.workbench — simulation workbench runtime for the world server.

Adds the three pillars of the /workbench UI:

  1. Time management — a simulation clock (SIM_CLOCK) + a daemon step
     worker thread (play / pause / single-step / variable speed). All
     scene mutations go through WORLD_LOCK (injected by server.py) so the
     worker never races RPC handlers.
  2. Camera management — a spec registry on top of sensors.attach_camera
     (list / add / remove / move / snapshot).
  3. Pre-sim preview — run a setup script, build the scene, auto-attach
     preview cameras, and export the scene meshes to GLB (+ manifest)
     for the three.js viewport.

WORLD and WORLD_LOCK are injected by server.py at init time (same pattern
as sensors/safety/perception).
"""

import json
import os
import threading
import time
import traceback

# Injected by server.py (with fallback so the module is importable standalone)
WORLD = None
WORLD_LOCK = threading.RLock()

# ---------------------------------------------------------------------------
# Simulation clock
# ---------------------------------------------------------------------------

SIM_CLOCK = {"t": 0.0, "steps": 0, "playing": False, "speed": 1.0, "dt": 0.01}

_worker = None
_worker_lock = threading.Lock()


def _scene():
    scene = (WORLD or {}).get("scene")
    if scene is None:
        raise RuntimeError("scene not initialized — call init first")
    return scene


def _sync_dt():
    try:
        SIM_CLOCK["dt"] = float(getattr(_scene(), "dt", SIM_CLOCK["dt"]))
    except Exception:
        pass


def _step_worker():
    while True:
        playing = SIM_CLOCK["playing"] and not (WORLD or {}).get("ESTOP", False)
        if not playing:
            time.sleep(0.05)
            continue
        try:
            with WORLD_LOCK:
                _scene().step()
            SIM_CLOCK["steps"] += 1
            SIM_CLOCK["t"] += SIM_CLOCK["dt"]
        except Exception:
            SIM_CLOCK["playing"] = False
            continue
        # realtime pacing: dt seconds of wall time per step at 1x
        time.sleep(max(SIM_CLOCK["dt"] / max(SIM_CLOCK["speed"], 1e-6), 0.0))


def _ensure_worker():
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_step_worker, daemon=True, name="sim-clock")
            _worker.start()


def clock_play():
    _sync_dt()
    _ensure_worker()
    SIM_CLOCK["playing"] = True
    return clock_status()


def clock_pause():
    SIM_CLOCK["playing"] = False
    return clock_status()


def clock_tick(n=1):
    """Single-step n physics steps (cooperative, works while paused)."""
    _sync_dt()
    n = max(int(n), 1)
    with WORLD_LOCK:
        for _ in range(n):
            _scene().step()
            SIM_CLOCK["steps"] += 1
            SIM_CLOCK["t"] += SIM_CLOCK["dt"]
    return clock_status()


def clock_set_speed(speed):
    SIM_CLOCK["speed"] = min(max(float(speed), 0.1), 10.0)
    return clock_status()


def clock_status():
    return dict(SIM_CLOCK)


def clock_reset():
    SIM_CLOCK.update({"t": 0.0, "steps": 0, "playing": False, "speed": 1.0})


# ---------------------------------------------------------------------------
# Scene info & poses
# ---------------------------------------------------------------------------


def _to_list(x, digits=5):
    try:
        import numpy as np

        arr = np.asarray(x, dtype=float).flatten()
        return [round(float(v), digits) for v in arr]
    except Exception:
        return []


def node_name(entity_idx, link_idx=None):
    return f"e{entity_idx}" if link_idx is None else f"e{entity_idx}_l{link_idx}"


def scene_info():
    scene = _scene()
    entities = []
    for ent in getattr(scene, "entities", []):
        links = list(getattr(ent, "links", []) or [])
        try:
            pos = _to_list(ent.get_pos(), 4)
            quat = _to_list(ent.get_quat(), 4)
        except Exception:
            pos, quat = [], []
        entities.append(
            {
                "idx": int(getattr(ent, "idx", len(entities))),
                "name": getattr(ent, "name", None) or f"entity_{len(entities)}",
                "type": type(ent).__name__,
                "pos": pos,
                "quat": quat,
                "link_count": len(links),
            }
        )
    return {
        "entities": entities,
        "is_built": bool(getattr(scene, "is_built", False)),
        "dt": SIM_CLOCK["dt"],
        "clock": clock_status(),
    }


def scene_poses():
    """World-space poses of every exported node (matches export_glb names)."""
    scene = _scene()
    poses = []
    for ent in getattr(scene, "entities", []):
        e_idx = int(getattr(ent, "idx", 0))
        links = list(getattr(ent, "links", []) or [])
        if links:
            for link in links:
                try:
                    poses.append(
                        {
                            "node": node_name(e_idx, int(getattr(link, "idx", 0))),
                            "pos": _to_list(link.get_pos()),
                            "quat": _to_list(link.get_quat()),
                        }
                    )
                except Exception:
                    continue
        else:
            try:
                poses.append(
                    {
                        "node": node_name(e_idx),
                        "pos": _to_list(ent.get_pos()),
                        "quat": _to_list(ent.get_quat()),
                    }
                )
            except Exception:
                continue
    return {"poses": poses, "clock": clock_status()}


# ---------------------------------------------------------------------------
# Mesh export (GLB for the three.js viewport)
# ---------------------------------------------------------------------------


def _preview_dir():
    home = os.environ.get("MOMO_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".momo")
    out = os.path.join(home, "sim", "preview")
    os.makedirs(out, exist_ok=True)
    return out


def export_glb():
    """
    Export scene link meshes to scene.glb + manifest.json under
    ~/.momo/sim/preview/. Best-effort per geom: Genesis internals vary
    by version, so anything unreadable is skipped (not fatal).
    """
    import trimesh  # Genesis depends on trimesh

    scene = _scene()
    ts_scene = trimesh.Scene()
    manifest = {}
    skipped = 0

    for ent in getattr(scene, "entities", []):
        e_idx = int(getattr(ent, "idx", 0))
        links = list(getattr(ent, "links", []) or [])
        geoms_by_node = []
        if links:
            for link in links:
                l_idx = int(getattr(link, "idx", 0))
                geoms_by_node.append((node_name(e_idx, l_idx), getattr(link, "geoms", []) or []))
        else:
            geoms_by_node.append((node_name(e_idx), getattr(ent, "geoms", []) or []))

        for node, geoms in geoms_by_node:
            parts = []
            for geom in geoms:
                mesh = getattr(geom, "mesh", None)
                if mesh is None:
                    meshes = getattr(geom, "meshes", None)
                    if meshes:
                        parts.extend(meshes)
                    continue
                parts.append(mesh)
            if not parts:
                skipped += 1
                continue
            try:
                combined = parts[0] if len(parts) == 1 else trimesh.util.concatenate(parts)
                ts_scene.add_geometry(combined, node_name=node, geom_name=node)
                manifest[node] = {"entity_idx": e_idx}
            except Exception:
                skipped += 1

    out_dir = _preview_dir()
    glb_path = os.path.join(out_dir, "scene.glb")
    manifest_path = os.path.join(out_dir, "manifest.json")
    ts_scene.export(glb_path)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"nodes": manifest, "skipped": skipped}, f, indent=2)
    return {"glb": glb_path, "manifest": manifest_path, "nodes": len(manifest), "skipped": skipped}


# ---------------------------------------------------------------------------
# Camera management
# ---------------------------------------------------------------------------

# Spec registry: attach params kept here (Genesis sensors don't retain them)
CAMERAS = {}


def _sensors():
    from genesis_world import sensors

    return sensors


def camera_list():
    out = []
    for name, spec in CAMERAS.items():
        out.append({"name": name, **spec})
    # cameras attached by agent code directly (not via workbench) still show up
    try:
        for name in _sensors()._SENSORS["camera"]:
            if name not in CAMERAS:
                out.append({"name": name, "external": True})
    except Exception:
        pass
    return {"cameras": out}


def camera_add(spec):
    name = spec.get("name")
    if not name:
        raise ValueError("camera spec needs a 'name'")
    sensors = _sensors()
    kwargs = {
        "pos": tuple(spec.get("pos", (1.5, -1.5, 1.0))),
        "lookat": tuple(spec.get("lookat", (0.0, 0.0, 0.3))),
        "fov": float(spec.get("fov", 60.0)),
        "res": tuple(spec.get("res", (320, 240))),
    }
    with WORLD_LOCK:
        sensors.attach_camera(name, **kwargs)
    CAMERAS[name] = {k: (list(v) if isinstance(v, tuple) else v) for k, v in kwargs.items()}
    return {"added": name}


def camera_remove(name):
    sensors = _sensors()
    cam = sensors._SENSORS["camera"].pop(name, None)
    if cam is not None:
        try:
            with WORLD_LOCK:
                _scene().remove_sensor(cam)
        except Exception:
            pass  # older Genesis without remove_sensor — registry removal suffices
    CAMERAS.pop(name, None)
    return {"removed": name}


def camera_move(name, pos=None, lookat=None):
    sensors = _sensors()
    cam = sensors._SENSORS["camera"].get(name)
    if cam is None:
        raise KeyError(f"camera '{name}' not registered")
    moved = False
    for method in ("set_pose", "move", "set_extrinsics"):
        fn = getattr(cam, method, None)
        if not callable(fn):
            continue
        try:
            with WORLD_LOCK:
                if method == "set_pose":
                    fn(pos=pos, lookat=lookat)
                elif pos is not None:
                    fn(pos)
            moved = True
            break
        except TypeError:
            continue
    if not moved:
        raise RuntimeError("camera move is not supported by this Genesis version")
    if name in CAMERAS:
        if pos is not None:
            CAMERAS[name]["pos"] = list(pos)
        if lookat is not None:
            CAMERAS[name]["lookat"] = list(lookat)
    return {"moved": name, "pos": pos, "lookat": lookat}


def camera_snapshot(name):
    with WORLD_LOCK:
        return _sensors().snapshot(name)


# ---------------------------------------------------------------------------
# Pre-sim preview
# ---------------------------------------------------------------------------

DEFAULT_PREVIEW_CAMERAS = [
    ("front", {"pos": (1.6, 0.0, 0.9), "lookat": (0.0, 0.0, 0.35)}),
    ("iso", {"pos": (1.3, -1.3, 1.1), "lookat": (0.0, 0.0, 0.3)}),
    ("top", {"pos": (0.0, 0.0, 2.2), "lookat": (0.0, 0.0, 0.0), "fov": 50.0}),
]


def preview(code):
    """
    Pre-simulation preview: exec the setup script, build the scene,
    auto-attach preview cameras (if none), export GLB — all without
    stepping the physics. Returns entities + cameras + export info,
    or an error with the traceback.
    """
    scene = _scene()
    if getattr(scene, "is_built", False):
        return {
            "ok": False,
            "error": "scene already built — call scene/rebuild before previewing again",
        }
    try:
        with WORLD_LOCK:
            exec(compile(code, "<preview>", "exec"), WORLD)
            scene.build()
        _sync_dt()
        clock_reset()
    except BaseException:
        return {"ok": False, "error": traceback.format_exc()}

    errors = []
    if not CAMERAS:
        for name, spec in DEFAULT_PREVIEW_CAMERAS:
            try:
                camera_add({"name": name, **spec})
            except Exception as e:  # camera is optional — note and continue
                errors.append(f"preview camera '{name}': {e}")

    export = {}
    try:
        with WORLD_LOCK:
            export = export_glb()
    except Exception as e:
        errors.append(f"glb export: {e}")

    info = scene_info()
    return {
        "ok": True,
        "entities": info["entities"],
        "cameras": [c["name"] for c in camera_list()["cameras"]],
        "export": export,
        "clock": clock_status(),
        "errors": errors,
    }
