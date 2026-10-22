/**
 * MOMO CODE — /memory command.
 * Manage the Hy-Memory long-term memory store (Tencent Hunyuan).
 *
 *   momo /memory status                      Server + config summary
 *   momo /memory search <query> [--limit N]  Search long-term memories
 *   momo /memory add <text...>               Store a memory
 *   momo /memory list [--limit N] [--offset N]
 *   momo /memory delete <id> | --all
 */
import {
  getHyMemoryHome,
  getMemoryClient,
  getMemoryConfig,
  getMemoryServer,
  isMemoryEnabled,
} from "../../memory/index.js"
import type { MemoryEntry } from "../../memory/types.js"

const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const MAGENTA = "\x1b[95m"
const RED = "\x1b[31m"

function printHelp(): void {
  console.log(`\n${BOLD}  MOMO CODE — /memory${RESET} ${DIM}(Hy-Memory long-term memory)${RESET}\n`)
  console.log(`  ${CYAN}status${RESET}                      Show server health and effective config`)
  console.log(`  ${CYAN}search${RESET} <query> [--limit N]  Search long-term memories`)
  console.log(`  ${CYAN}add${RESET} <text...>               Store a new memory`)
  console.log(`  ${CYAN}list${RESET} [--limit N] [--offset N]  List stored memories`)
  console.log(`  ${CYAN}delete${RESET} <id> | --all        Delete one memory (or everything)\n`)
}

function parseNumberFlag(args: string[], flag: string): number | undefined {
  const i = args.indexOf(flag)
  if (i === -1 || i + 1 >= args.length) return undefined
  const n = Number(args[i + 1])
  return Number.isNaN(n) ? undefined : n
}

function withoutFlags(args: string[], flags: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (flags.includes(args[i])) {
      i++ // skip the flag's value (or bare flag)
      continue
    }
    out.push(args[i])
  }
  return out
}

function printEntry(index: number, entry: MemoryEntry): void {
  const score = entry.score != null ? ` ${DIM}(score: ${(entry.score * 100).toFixed(0)}%)${RESET}` : ""
  const layer = entry.layer ? ` ${DIM}[${entry.layer}]${RESET}` : ""
  const id = entry.memory_id ? ` ${DIM}id: ${entry.memory_id}${RESET}` : ""
  console.log(`  ${GREEN}${index}.${RESET} ${entry.content}${score}${layer}${id}`)
}

async function ensureReady(): Promise<boolean> {
  const cfg = getMemoryConfig()
  const client = getMemoryClient()
  if (!cfg || !client) {
    console.error(`${MAGENTA}MOMO CODE${RESET}: memory is disabled (MOMO_MEMORY=0).`)
    return false
  }
  const server = getMemoryServer()
  if (server && cfg.autoStartServer && !(await server.ensureServer())) {
    console.error(`${MAGENTA}MOMO CODE${RESET} ${RED}Hy-Memory server is not reachable.${RESET}`)
    console.error(`${DIM}Check Python >= 3.8, network to pypi.org, and the llm/embedder keys in momo.jsonc.${RESET}`)
    return false
  }
  return true
}

async function status(): Promise<void> {
  const cfg = getMemoryConfig()
  if (!cfg) {
    console.log(`\n  ${BOLD}Memory:${RESET} ${RED}disabled${RESET} ${DIM}(MOMO_MEMORY=0)${RESET}\n`)
    return
  }
  const server = getMemoryServer()
  const healthy = server ? await server.isHealthy() : false
  if (!healthy && cfg.autoStartServer && server) {
    console.log(`${DIM}  No server yet — starting Hy-Memory server...${RESET}`)
    await server.ensureServer()
  }
  const up = server ? await server.isHealthy() : false
  console.log(`\n  ${BOLD}Hy-Memory${RESET} ${up ? `${GREEN}● healthy${RESET}` : `${RED}● down${RESET}`}`)
  console.log(`    ${DIM}server${RESET}     ${cfg.serverUrl}`)
  console.log(`    ${DIM}user/agent${RESET} ${cfg.userId} / ${cfg.agentId}`)
  console.log(`    ${DIM}mode${RESET}       ${cfg.mode}  ${DIM}topK: ${cfg.topK}  threshold: ${cfg.searchThreshold}${RESET}`)
  console.log(`    ${DIM}auto${RESET}       recall: ${cfg.autoRecall}  capture: ${cfg.autoCapture}  startServer: ${cfg.autoStartServer}`)
  console.log(`    ${DIM}home${RESET}       ${getHyMemoryHome()}`)
  if (!up) {
    console.log(`\n  ${DIM}Set llm/embedder in momo.jsonc "memory" block — see Hy-Memory docs.${RESET}`)
  }
  console.log()
}

export async function runMemoryCommand(args: string[]): Promise<void> {
  const sub = (args[0] || "").toLowerCase()

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    printHelp()
    return
  }
  if (!isMemoryEnabled()) {
    console.error(`${MAGENTA}MOMO CODE${RESET}: memory is disabled (MOMO_MEMORY=0).`)
    return
  }

  switch (sub) {
    case "status":
      await status()
      return

    case "search": {
      const rest = withoutFlags(args.slice(1), ["--limit"])
      const query = rest.join(" ").trim()
      if (!query) {
        console.error(`${RED}Usage:${RESET} /memory search <query> [--limit N]`)
        return
      }
      if (!(await ensureReady())) return
      const limit = parseNumberFlag(args, "--limit")
      const entries = await getMemoryClient()!.search(query, { limit })
      console.log()
      if (!entries) {
        console.log(`  ${RED}Search failed.${RESET}`)
      } else if (entries.length === 0) {
        console.log(`  ${DIM}No relevant memories found.${RESET}`)
      } else {
        console.log(`  ${BOLD}Found ${entries.length} memor${entries.length === 1 ? "y" : "ies"}:${RESET}`)
        entries.forEach((e, i) => printEntry(i + 1, e))
      }
      console.log()
      return
    }

    case "add": {
      const text = withoutFlags(args.slice(1), []).join(" ").trim()
      if (!text) {
        console.error(`${RED}Usage:${RESET} /memory add <text...>`)
        return
      }
      if (!(await ensureReady())) return
      const res = await getMemoryClient()!.add(text)
      console.log()
      if (res?.success) {
        console.log(`  ${GREEN}Stored memory${RESET}${res.memory_id ? ` ${DIM}(id: ${res.memory_id})${RESET}` : ""}`)
      } else {
        console.log(`  ${RED}Failed to store memory.${RESET}`)
      }
      console.log()
      return
    }

    case "list": {
      if (!(await ensureReady())) return
      const limit = parseNumberFlag(args, "--limit")
      const offset = parseNumberFlag(args, "--offset")
      const res = await getMemoryClient()!.list({ limit, offset })
      console.log()
      if (!res) {
        console.log(`  ${RED}List failed.${RESET}`)
      } else if (res.memories.length === 0) {
        console.log(`  ${DIM}No memories stored.${RESET}`)
      } else {
        console.log(`  ${BOLD}Memories (${res.memories.length}/${res.total}):${RESET}`)
        res.memories.forEach((e, i) => printEntry(i + 1, e))
      }
      console.log()
      return
    }

    case "delete": {
      const rest = withoutFlags(args.slice(1), [])
      if (args.includes("--all")) {
        if (!(await ensureReady())) return
        await getMemoryClient()!.deleteAll()
        console.log(`\n  ${GREEN}Deleted all memories.${RESET}\n`)
        return
      }
      const id = rest[0]
      if (!id) {
        console.error(`${RED}Usage:${RESET} /memory delete <id> | --all`)
        return
      }
      if (!(await ensureReady())) return
      const res = await getMemoryClient()!.delete(id)
      console.log()
      if (res?.success) {
        console.log(`  ${GREEN}Deleted ${res.deleted_count ?? 1} memory(ies).${RESET}`)
      } else {
        console.log(`  ${RED}Delete failed.${RESET}`)
      }
      console.log()
      return
    }

    default:
      console.error(`${RED}Unknown subcommand:${RESET} ${sub}`)
      printHelp()
  }
}
