/**
 * Worker prompt-package staging — port of ASPIRE dispatch.py.
 *
 * The coordinator dispatches every agent from a FILE rather than an inline
 * prompt, so what each agent was told is recoverable afterwards. The file
 * is self-contained: task, rules, and the exact required outputs. The
 * agent's chat instruction is just "read this file and follow it exactly".
 *
 * @module skill/dispatch
 */

import * as fs from "fs"
import * as path from "path"
import { getSkillsDir } from "./store"
import type { SkillTask } from "./schema"

/** Which role the prompt package is for. */
export type WorkerRole = "worker" | "heldout"

/**
 * Standing coordinator policy for campaign workers (adapted from ASPIRE's
 * subagent-prompt addenda). Every rule is retroactive: each one names a
 * hazard that cost a real unattended run.
 */
export const WORKER_RULES = `
1. Debug by failure mode, not by task instance. A fix that only patches
   this one input is a failed run — look for the class of failure and fix
   that.
2. Version budget: at most 3 versions of your solution per failure mode,
   8 versions total. Spend versions deliberately; write down what each
   version taught before writing the next.
3. Write ONLY inside your task directory. Never touch the skill library
   or another task's directory; use absolute paths everywhere. To set
   something aside, move it into an archive/ directory inside your own
   directory — never delete.
4. You may NOT approve, apply, or run destructive commands: no rm, no
   sudo, no background daemons. An unattended campaign does not fail on an
   approval prompt — it waits forever.
5. If a tool refuses an action, do NOT reach for a different tool to
   accomplish the same thing. Report the refusal and continue. Routing
   around a refusal is indistinguishable from evading a control.
`.trim()

/** Heldout rules: evaluation only, no iteration, no proposals. */
export const HELDOUT_RULES = `
1. ONE attempt. This task measures the library as it stands — do not debug
   iteratively and do not propose library changes.
2. Write ONLY inside your task directory; use absolute paths; never delete
   (move to archive/ instead).
3. If a tool refuses an action, do NOT route around it — report it in your
   notes and continue.
`.trim()

const REQUIRED_OUTPUTS = `
Before you finish, write \`skill_report.json\` into your task directory with
exactly this shape:

{
  "skillLibrarySha": "<the library sha stated above>",
  "consulted": [
    { "skill": "<file>", "section": "<heading>",
      "verdict": "useful | misleading | wrong | not-applicable",
      "evidence": "<what specifically happened>" }
  ],
  "proposedEdits": [
    { "skill": "<file>", "section": "<heading>",
      "change": "<what to change>", "why": "<reason>" }
  ],
  "proposedNew": [
    { "skill": "<file>", "title": "<entry title>", "trigger": "<when to use>",
      "code": "<paste-ready TypeScript>", "evidence": "<how you know>" }
  ]
}

Rules for the report:
- Record a consulted verdict for EVERY library section you opened.
- "misleading" or "wrong" grades need specific, actionable evidence
  (at least 40 characters).
- proposedNew code must parse as TypeScript and use nothing it does not
  define or name in its trigger/evidence — a verifier receives only that
  text.
`.trim()

// ---------------------------------------------------------------------------
// Prompt packages
// ---------------------------------------------------------------------------

/**
 * Write <campaignDir>/tasks/<task.id>/PROMPT.md — the self-contained prompt
 * package the worker agent is pointed at — and return its path.
 *
 * Worker role: the agent reads the (read-only) library from disk, solves
 * the task under the rules, and must produce skill_report.json.
 * Heldout role: the current library content is inlined, the agent makes one
 * attempt and records pass/fail in heldout_outcome.json.
 */
export function stageWorkerPrompt(opts: {
  campaignDir: string
  task: SkillTask
  librarySha: string
  role?: WorkerRole
  /** Optional file whose contents replace the built-in rules. */
  workerRulesPath?: string
}): string {
  const role: WorkerRole = opts.role ?? "worker"
  const taskDir = path.join(opts.campaignDir, "tasks", opts.task.id)
  fs.mkdirSync(taskDir, { recursive: true })
  const promptFile = path.join(taskDir, "PROMPT.md")

  const rules = opts.workerRulesPath && fs.existsSync(opts.workerRulesPath)
    ? fs.readFileSync(opts.workerRulesPath, "utf-8").trim()
    : role === "heldout"
      ? HELDOUT_RULES
      : WORKER_RULES

  const parts: string[] = []
  parts.push(`# ${role === "heldout" ? "Heldout evaluation" : "Worker"} prompt package — task ${opts.task.id}`)
  parts.push("")
  parts.push(`band: ${opts.task.band}`)
  parts.push("")
  parts.push("## Task")
  parts.push("")
  parts.push(`id: ${opts.task.id}`)
  parts.push("")
  parts.push(opts.task.prompt.trim())
  parts.push("")
  parts.push("Check command (exit 0 = task solved):")
  parts.push("")
  parts.push("```sh")
  parts.push(opts.task.check)
  parts.push("```")

  if (role === "heldout") {
    parts.push("")
    parts.push("## Skill library (current)")
    parts.push("")
    parts.push(
      "Solve the task using the skill library below as your only guidance. " +
        `It is also on disk at ${getSkillsDir()} (content sha ${opts.librarySha}).`,
    )
    parts.push("")
    const skillsDir = getSkillsDir()
    let inlined = 0
    if (fs.existsSync(skillsDir)) {
      for (const f of fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md") && f !== "README.md").sort()) {
        parts.push(`### ${f}`)
        parts.push("")
        parts.push(fs.readFileSync(path.join(skillsDir, f), "utf-8").trim())
        parts.push("")
        inlined++
      }
    }
    if (inlined === 0) parts.push("(library is empty)")
    parts.push("")
    parts.push("## Rules")
    parts.push("")
    parts.push(rules)
    parts.push("")
    parts.push("## Required output")
    parts.push("")
    parts.push(
      "Write `heldout_outcome.json` into your task directory with exactly this shape:",
    )
    parts.push("")
    parts.push('```json')
    parts.push('{ "pass": true, "notes": "<one line: what worked or what blocked you>" }')
    parts.push("```")
    parts.push("")
    parts.push("`pass` must be true iff the check command exited 0.")
  } else {
    parts.push("")
    parts.push("## Skill library")
    parts.push("")
    parts.push(
      `The shared skill library lives at ${getSkillsDir()} (content sha ${opts.librarySha}). ` +
        "It is the only trusted cross-task channel: entries that passed this same verification " +
        "gate in earlier tasks. You may READ it freely — you must NEVER write to it, and never " +
        "write outside your own task directory.",
    )
    parts.push("")
    parts.push("## Rules")
    parts.push("")
    parts.push(rules)
    parts.push("")
    parts.push("## Required outputs")
    parts.push("")
    parts.push(REQUIRED_OUTPUTS)
  }

  const tmp = `${promptFile}.tmp.${Date.now()}`
  fs.writeFileSync(tmp, parts.join("\n") + "\n", "utf-8")
  fs.renameSync(tmp, promptFile)
  return promptFile
}

/**
 * Chat instruction argv for a subagent pointed at a staged prompt package.
 *
 * NOTE: this is a single-element argv (the instruction as one positional
 * argument) so it lands in the router's default chat path (`momo "<prompt>"`).
 * The compiled-binary `-p <prompt>` convention cannot be used here because
 * this CLI's router already binds -p/--provider (cli/index.ts).
 */
export function buildWorkerArgv(promptFile: string, outputFile = "skill_report.json"): string[] {
  // NOTE: the working directory is followed by a space on purpose — a
  // trailing "." would leave path parsers that grab `\S+` pointing at a
  // dot-suffixed directory that does not exist.
  return [
    `Read the file ${promptFile} and follow it exactly. Work only inside ${path.dirname(
      promptFile,
    )} and write ${outputFile} there before you finish.`,
  ]
}
