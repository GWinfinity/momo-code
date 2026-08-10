/**
 * momo serve — GET routes: stateless reads from the ~/.momo stores.
 *
 * @module serve/routes
 */

import { loadGoals } from "../goal/store.js"
import { loadSchedule } from "../schedule/store.js"
import { readRecentSessions, getMomoHome } from "../session/recorder.js"
import * as path from "path"
import type { SimBridge } from "../sim/bridge.js"
import {
  bestTrial,
  listStudies,
  loadStudy,
  readTrials,
} from "../optim/study.js"
import { loadSemantics } from "../optim/semantics.js"
import { isStudyRunning } from "./actions.js"
import { getSimBridge } from "./actions.js"
import { sendError, sendJson, sendFile, openSse, type RouteHandler } from "./server.js"

/** Proxy a bridge call → JSON, or 503 when the sim world is unavailable. */
async function proxySim(
  res: import("http").ServerResponse,
  fn: (b: SimBridge) => Promise<unknown>,
): Promise<void> {
  try {
    const bridge = await getSimBridge()
    sendJson(res, 200, await fn(bridge))
  } catch (err) {
    sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
  }
}

// ---------------------------------------------------------------------------
// Optim helpers
// ---------------------------------------------------------------------------

function studySummary(name: string) {
  const config = loadStudy(name)
  if (!config) return null
  const trials = readTrials(name)
  const best = bestTrial(config.direction, trials)
  const semantics = loadSemantics(name)
  return {
    name: config.name,
    direction: config.direction,
    metric: config.metric,
    trials: trials.length,
    completed: trials.filter((t) => t.state === "complete").length,
    semantics: semantics?.status ?? "none",
    running: isStudyRunning(name),
    best: best ? { number: best.number, value: best.value, params: best.params } : null,
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function getRoutes(): Record<string, RouteHandler> {
  return {
    "/api/sessions": ({ res, query }) => {
      const limit = Math.min(Number(query.get("limit")) || 50, 500)
      sendJson(res, 200, { sessions: readRecentSessions(limit) })
    },

    "/api/optim/studies": ({ res }) => {
      const studies = listStudies()
        .map(studySummary)
        .filter(Boolean)
      sendJson(res, 200, { studies })
    },

    "/api/optim/studies/:name": ({ res, params }) => {
      const config = loadStudy(params.name)
      if (!config) {
        sendError(res, 404, `study "${params.name}" not found`)
        return
      }
      const trials = readTrials(params.name)
      const best = bestTrial(config.direction, trials)
      const semantics = loadSemantics(params.name)
      sendJson(res, 200, {
        ...config,
        running: isStudyRunning(params.name),
        semantics: semantics
          ? { status: semantics.status, params: semantics.params, interactions: semantics.interactions, constraints: semantics.constraints }
          : null,
        best: best ? { number: best.number, value: best.value, params: best.params } : null,
      })
    },

    "/api/optim/studies/:name/trials": ({ res, params }) => {
      if (!loadStudy(params.name)) {
        sendError(res, 404, `study "${params.name}" not found`)
        return
      }
      sendJson(res, 200, { trials: readTrials(params.name) })
    },

    "/api/optim/studies/:name/stream": ({ req, res, params }) => {
      if (!loadStudy(params.name)) {
        sendError(res, 404, `study "${params.name}" not found`)
        return
      }
      const push = openSse(res)
      let seen = readTrials(params.name).length
      let lastRunning = isStudyRunning(params.name)
      push("status", { running: lastRunning, trials: seen })

      const timer = setInterval(() => {
        try {
          const trials = readTrials(params.name)
          for (let i = seen; i < trials.length; i++) {
            push("trial", trials[i])
          }
          seen = trials.length
          const running = isStudyRunning(params.name)
          if (running !== lastRunning) {
            lastRunning = running
            push("status", { running, trials: seen })
          }
        } catch {
          // keep the stream alive across transient read errors
        }
      }, 2000)

      req.on("close", () => clearInterval(timer))
    },

    "/api/goals": ({ res }) => {
      sendJson(res, 200, { goals: loadGoals() })
    },

    "/api/schedule": ({ res }) => {
      sendJson(res, 200, { entries: loadSchedule() })
    },

    "/api/sim/observe": async ({ res }) => {
      try {
        const bridge = await getSimBridge()
        const estop = await bridge.evalExpr("ESTOP")
        const obs = await bridge.observe()
        sendJson(res, 200, { estop: estop.repr === "True", observation: obs })
      } catch (err) {
        sendError(
          res,
          503,
          `sim world unavailable: ${err instanceof Error ? err.message : err}`,
        )
      }
    },

    // -- Sim workbench (time / scene / camera) -------------------------------

    "/api/sim/scene/info": async ({ res }) => {
      await proxySim(res, (b) => b.sceneInfo())
    },

    "/api/sim/scene/poses": async ({ res }) => {
      await proxySim(res, (b) => b.scenePoses())
    },

    "/api/sim/scene/mesh": ({ res }) => {
      const dir = path.join(getMomoHome(), "sim", "preview")
      sendFile(res, dir, "scene.glb", "model/gltf-binary")
    },

    "/api/sim/cameras": async ({ res }) => {
      await proxySim(res, (b) => b.cameraList())
    },

    "/api/sim/frames/:file": ({ res, params }) => {
      const dir = path.join(getMomoHome(), "sim", "frames")
      sendFile(res, dir, params.file, "image/png")
    },

    "/api/sim/poses/stream": async ({ req, res }) => {
      let bridge
      try {
        bridge = await getSimBridge()
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
        return
      }
      const push = openSse(res)
      let lastClock = ""
      const timer = setInterval(async () => {
        try {
          const data = await bridge.scenePoses()
          push("pose", data.poses)
          const clock = JSON.stringify(data.clock)
          if (clock !== lastClock) {
            lastClock = clock
            push("clock", data.clock)
          }
        } catch {
          // keep the stream alive across transient bridge errors
        }
      }, 200) // ~5Hz
      req.on("close", () => clearInterval(timer))
    },
  }
}
