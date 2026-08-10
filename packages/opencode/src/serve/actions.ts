/**
 * momo serve — POST actions: one-shot writes (optim run, sim estop/resume,
 * chat). Runs are async with one lock per study; progress flows over SSE.
 *
 * @module serve/actions
 */

import { chatComplete, resolveProviderConfig } from "../cli/chat.js"
import { SimBridge } from "../sim/bridge.js"
import { MockSampler } from "../optim/sampler.js"
import { runStudy } from "../optim/runner.js"
import { loadSemantics } from "../optim/semantics.js"
import { loadStudy } from "../optim/study.js"
import { recordSession } from "../session/recorder.js"
import { sendError, sendJson, type RouteHandler } from "./server.js"

// ---------------------------------------------------------------------------
// Run locking (one concurrent run per study)
// ---------------------------------------------------------------------------

const running = new Set<string>()

export function isStudyRunning(name: string): boolean {
  return running.has(name)
}

// ---------------------------------------------------------------------------
// Sim bridge (lazy singleton; closed on process exit)
// ---------------------------------------------------------------------------

let bridge: SimBridge | undefined
let bridgeInit: Promise<SimBridge> | undefined

export async function getSimBridge(): Promise<SimBridge> {
  if (bridge) return bridge
  if (!bridgeInit) {
    bridgeInit = (async () => {
      const b = new SimBridge()
      await b.initWorld({})
      bridge = b
      return b
    })()
    bridgeInit.catch(() => {
      bridgeInit = undefined // allow retry after a failed init
    })
  }
  return bridgeInit
}

process.once("exit", () => {
  try {
    if (bridge) void bridge.close()
  } catch {
    // shutting down — ignore
  }
})

/** Close the lazy bridge (tests and graceful shutdown). */
export async function closeSimBridge(): Promise<void> {
  try {
    if (bridge) await bridge.close()
  } finally {
    bridge = undefined
    bridgeInit = undefined
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function getActions(): Record<string, RouteHandler> {
  return {
    "/api/optim/studies/:name/run": async ({ res, params, body }) => {
      const config = loadStudy(params.name)
      if (!config) {
        sendError(res, 404, `study "${params.name}" not found`)
        return
      }
      if (running.has(params.name)) {
        sendError(res, 409, `study "${params.name}" already has a run in progress`)
        return
      }
      const payload = (typeof body === "object" && body !== null ? body : {}) as {
        trials?: unknown
        mock?: unknown
      }
      const trials = Math.min(Math.max(Number(payload.trials) || 10, 1), 1000)
      const useMock = payload.mock === true

      const semantics = loadSemantics(params.name)
      const approved = semantics?.status === "approved" ? semantics : undefined

      running.add(params.name)
      const startMs = Date.now()
      // Async: the response returns immediately; progress flows over SSE.
      void (async () => {
        try {
          const result = await runStudy(config, {
            trials,
            ...(useMock ? { sampler: new MockSampler() } : {}),
            ...(approved ? { semantics: approved } : {}),
          })
          await recordSession({
            provider: "optim",
            model: useMock ? "mock-sampler" : "agent-sampler",
            prompt: `[optim] ${params.name} (via /serve): ${config.direction} ${config.metric} (${trials} trials)`,
            response: result.best
              ? `BEST: ${result.best.value} at ${JSON.stringify(result.best.params)}`
              : `FAILED: no completed trial`,
            exitCode: result.best ? 0 : 1,
            durationMs: Date.now() - startMs,
            rlmDepth: 0,
          })
        } catch {
          // run failures surface via the trials/status SSE feed
        } finally {
          running.delete(params.name)
        }
      })()

      sendJson(res, 202, { started: true, trials, mock: useMock, semantics: approved ? "approved" : "blind" })
    },

    "/api/sim/estop": async ({ res }) => {
      try {
        const b = await getSimBridge()
        const result = await b.request("estop")
        sendJson(res, 200, result)
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/sim/resume": async ({ res }) => {
      try {
        const b = await getSimBridge()
        const result = await b.request("resume")
        sendJson(res, 200, result)
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    // -- Sim workbench actions ------------------------------------------------

    "/api/sim/preview": async ({ res, body }) => {
      try {
        const payload = (typeof body === "object" && body !== null ? body : {}) as { code?: unknown }
        const code = typeof payload.code === "string" ? payload.code : ""
        if (!code.trim()) {
          sendError(res, 400, `body must be {"code": "<scene setup python>"}`)
          return
        }
        const b = await getSimBridge()
        const result = await b.scenePreview(code)
        sendJson(res, result.ok ? 200 : 422, result)
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/sim/rebuild": async ({ res }) => {
      try {
        const b = await getSimBridge()
        sendJson(res, 200, await b.sceneRebuild())
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/sim/time": async ({ res, body }) => {
      try {
        const payload = (typeof body === "object" && body !== null ? body : {}) as {
          action?: unknown
          n?: unknown
          speed?: unknown
        }
        const action = payload.action
        if (action !== "play" && action !== "pause" && action !== "step" && action !== "speed") {
          sendError(res, 400, `action must be play|pause|step|speed`)
          return
        }
        const b = await getSimBridge()
        const result = await b.timeControl(action, {
          ...(typeof payload.n === "number" ? { n: payload.n } : {}),
          ...(typeof payload.speed === "number" ? { speed: payload.speed } : {}),
        })
        sendJson(res, 200, result)
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/sim/cameras": async ({ res, body }) => {
      try {
        const payload = (typeof body === "object" && body !== null ? body : {}) as {
          name?: unknown
        }
        if (typeof payload.name !== "string" || !payload.name.trim()) {
          sendError(res, 400, `camera spec needs a "name"`)
          return
        }
        const b = await getSimBridge()
        const result = await b.cameraAdd(payload as { name: string })
        sendJson(res, 200, result)
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/sim/cameras/:name/remove": async ({ res, params }) => {
      try {
        const b = await getSimBridge()
        sendJson(res, 200, await b.cameraRemove(params.name))
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/sim/cameras/:name/snapshot": async ({ res, params }) => {
      try {
        const b = await getSimBridge()
        const shot = await b.cameraSnapshot(params.name)
        // Convert the world-side absolute path to a servable frame URL
        const file = shot.rgb?.split(/[\\/]/).pop()
        sendJson(res, 200, { ...shot, url: file ? `/api/sim/frames/${file}` : undefined })
      } catch (err) {
        sendError(res, 503, `sim world unavailable: ${err instanceof Error ? err.message : err}`)
      }
    },

    "/api/chat": async ({ res, body }) => {
      const payload = (typeof body === "object" && body !== null ? body : {}) as {
        prompt?: unknown
      }
      const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : ""
      if (!prompt) {
        sendError(res, 400, `body must be {"prompt": "..."}`)
        return
      }
      const provider = await resolveProviderConfig()
      if (!provider) {
        sendError(
          res,
          503,
          "no provider configured — set MOMO_API_KEY (or MOMO_<PROVIDER>_API_KEY)",
        )
        return
      }
      const reply = await chatComplete({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.7,
        timeout: 180_000,
      })
      sendJson(res, 200, { reply, model: provider.model, provider: provider.providerName })
    },
  }
}
