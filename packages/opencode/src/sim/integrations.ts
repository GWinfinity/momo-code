/**
 * Sim integrations — pluggable environment backends for the /sim bridge.
 *
 * Each integration describes one world server: a Python script speaking the
 * NDJSON JSON-RPC surface (see python/genesis_world/server.py `METHODS`),
 * its default interpreter and any extra child env. Genesis is the first
 * adapter; a new environment implements the same server surface (or the
 * cap_harness `EnvironmentAdapter` protocol on the harness side) and
 * registers one entry here — everything downstream (`/sim`, `/optim --sim`,
 * the dashboard workbench) then selects it via
 * `MOMO_SIM_INTEGRATION=<name>` or `--integration <name>`.
 *
 * @module sim/integrations
 */

import * as path from "path"
import { fileURLToPath } from "url"

export interface SimIntegration {
  /** Stable integration id (used by MOMO_SIM_INTEGRATION / --integration). */
  readonly name: string
  /** Human label for the dashboard / doctor output. */
  readonly label: string
  /** Bundled world server script path (absolute). */
  readonly serverPath: string
  /** Default python executable (undefined → bridge resolution: explicit
   *  MOMO_SIM_PYTHON → uv → plain python). */
  readonly python?: string
  /** Extra child env for the world server (e.g. MOMO_SIM_BACKEND). */
  readonly env?: Record<string, string>
}

/** Resolve a path against the bundled python/ tree (works from src and dist). */
function bundledServer(...segments: string[]): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "..", "..", "python", ...segments)
}

/** Registry of known integrations, in registration order. */
export const SIM_INTEGRATIONS: Record<string, SimIntegration> = {
  genesis: {
    name: "genesis",
    label: "Genesis world (bundled genesis_world server)",
    serverPath: bundledServer("genesis_world", "server.py"),
  },
}

/** Integration used when nothing else is specified. */
export const DEFAULT_SIM_INTEGRATION = "genesis"

/** List available integrations (registry order). */
export function listIntegrations(): SimIntegration[] {
  return Object.values(SIM_INTEGRATIONS)
}

/**
 * Resolve an integration: explicit name → MOMO_SIM_INTEGRATION → default.
 * Throws for unknown names, listing the available ones.
 */
export function resolveIntegration(name?: string): SimIntegration {
  const wanted = (name ?? process.env.MOMO_SIM_INTEGRATION ?? DEFAULT_SIM_INTEGRATION).trim()
  const found = SIM_INTEGRATIONS[wanted]
  if (found) return found
  const available = listIntegrations().map((i) => i.name).join(", ")
  throw new Error(`unknown sim integration "${wanted}" (available: ${available})`)
}
