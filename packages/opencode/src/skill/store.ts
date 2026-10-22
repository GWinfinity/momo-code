/**
 * SkillLibrary — persistence and curation for the ASPIRE-style skill library.
 *
 * Disk layout (all under `getMomoHome()`):
 * ```
 * skills/
 *   *.md            — the library: YAML-ish frontmatter + `## Sections` +
 *                     entries shaped as `**Trigger**:` / fenced code /
 *                     `**Evidence**:` (see below)
 *   README.md       — lifecycle docs (excluded from the content hash)
 *   changelog/      — replaced/superseded entry text (history, not guidance)
 *   ledger.jsonl    — append-only {kind:"grade", ...} records
 * skill-campaigns/  — per-run staging (created only when something stages)
 *   <campaign>/proposed/<slug>.md   — staged new-entry proposals
 *   <campaign>/patches/<n>-<slug>.json — staged prose edit patches
 *   <campaign>/skill_report.json    — the report that staged them
 * ```
 *
 * Curation rule (REPLACE-NOT-ANNOTATE, ported from ASPIRE): applying an
 * entry overwrites it in place; the old text moves to the changelog.
 * Nothing but `applyVerified` writes to the library.
 *
 * All whole-file writes are atomic (tmp + rename); JSONL/changelog
 * appends use single-call appends, mirroring experience/store.ts.
 *
 * @module skill/store
 */

import { Effect } from "effect"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { getMomoHome } from "../session/recorder"
import { listLibraryFiles } from "./lint"
import type { SkillEntry, SkillReport, VerificationReport } from "./schema"

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Skill library directory (`<momoHome>/skills`). */
export function getSkillsDir(): string {
  return path.join(getMomoHome(), "skills")
}

/** Per-run campaign staging root (`<momoHome>/skill-campaigns`). */
export function getSkillCampaignsDir(): string {
  return path.join(getMomoHome(), "skill-campaigns")
}

/** Skill file path for a skill name (e.g. "arrays" → skills/arrays.md). */
function skillPath(skillsDir: string, skill: string): string {
  return path.join(skillsDir, `${skill}.md`)
}

/** Kill path traversal / extension variants in a skill name. */
function sanitizeSkillName(name: string): string {
  const base = path.basename(String(name).trim())
  return base.replace(/\.md$/i, "")
}

// ---------------------------------------------------------------------------
// File format: frontmatter + sections + entries
// ---------------------------------------------------------------------------

export interface SkillFile {
  name: string
  description: string
  entries: SkillEntry[]
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)---\r?\n?/

function parseFrontmatter(text: string): { name: string; description: string; body: string } {
  const m = FRONTMATTER_RE.exec(text)
  if (!m) return { name: "", description: "", body: text }
  let name = ""
  let description = ""
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    if (kv[1] === "name") name = kv[2].trim()
    else if (kv[1] === "description") description = kv[2].trim()
  }
  return { name, description, body: text.slice(m[0].length) }
}

/**
 * Parse a skill markdown file into frontmatter + Trigger/Code/Evidence
 * entries. Every `### <title>` block under any `##` section is one entry;
 * the code is the first fenced block, trigger/evidence are the matching
 * bold-labelled lines.
 */
export function parseSkillFile(text: string, skillFallback = ""): SkillFile {
  const { name, description, body } = parseFrontmatter(text)
  const skill = sanitizeSkillName(name || skillFallback)
  const lines = body.split(/\r?\n/)
  const entries: SkillEntry[] = []

  let i = 0
  while (i < lines.length) {
    const heading = /^###\s+(.+?)\s*$/.exec(lines[i])
    if (!heading) {
      i++
      continue
    }
    const title = heading[1]
    const start = i
    i++
    while (i < lines.length && !/^#{1,3}\s/.test(lines[i])) i++
    const block = lines.slice(start, i).join("\n")

    const trigger = /^\*\*Trigger\*\*:\s*(.+)$/m.exec(block)
    const evidence = /^\*\*Evidence\*\*:\s*([\s\S]*?)$/m.exec(block)
    const fence = /^```(?:ts|typescript|js)?\s*\r?\n([\s\S]*?)^```/m.exec(block)

    entries.push({
      skill,
      title,
      trigger: trigger ? trigger[1].trim() : "",
      code: fence ? fence[1].replace(/\n$/, "") : "",
      evidence: evidence ? evidence[1].trim() : "",
    })
  }

  return { name: skill, description, entries }
}

/** Render one entry as a `###` markdown block (parse round-trips). */
export function renderEntryBlock(entry: SkillEntry): string {
  const trigger = entry.trigger.replace(/\s*\n\s*/g, " ").trim()
  const evidence = entry.evidence.replace(/\s*\n\s*/g, " ").trim()
  return [
    `### ${entry.title.trim()}`,
    "",
    `**Trigger**: ${trigger}`,
    "",
    "```ts",
    entry.code.trim(),
    "```",
    "",
    `**Evidence**: ${evidence}`,
  ].join("\n")
}

/** Render a whole skill file (frontmatter + one `## Entries` section). */
export function renderSkillFile(name: string, description: string, entries: SkillEntry[]): string {
  const blocks = entries.map((e) => renderEntryBlock(e)).join("\n\n")
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n## Entries\n\n${blocks}\n`
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || "entry"
}

// ---------------------------------------------------------------------------
// Atomic writes
// ---------------------------------------------------------------------------

function atomicWriteFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`
  try {
    fs.writeFileSync(tmp, content, "utf-8")
    fs.renameSync(tmp, file)
  } catch (err) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore cleanup errors */
    }
    throw err
  }
}

function trySync<T>(what: string, f: () => T): Effect.Effect<T, Error> {
  return Effect.try({
    try: f,
    catch: (err) =>
      new Error(`${what}: ${err instanceof Error ? err.message : String(err)}`),
  })
}

// ---------------------------------------------------------------------------
// SkillLibrary service
// ---------------------------------------------------------------------------

export interface ApplyOutcome {
  /** "skill §title" entries written into the library. */
  applied: string[]
  /** Prose edit patches recorded to a changelog (never auto-spliced). */
  patched: string[]
  /** Entries skipped because the report graded them not-sound. */
  skipped: string[]
}

export interface StageOutcome {
  proposedDir: string
  proposalFiles: string[]
  patchFiles: string[]
  reportFile: string
}

/**
 * Persistence + curation for the skill library.
 *
 * The coordinator is the only write path, and the only library-mutating
 * method is `applyVerified` (gated on a verified transmission report).
 * Everything else reads or stages.
 *
 * Usage:
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const lib = yield* SkillLibrary
 *   const sha = yield* lib.sha()
 *   // ...
 * }).pipe(Effect.provide(SkillLibraryLive))
 * ```
 */
export class SkillLibrary extends Effect.Service<SkillLibrary>()("skill/Store", {
  effect: Effect.gen(function* () {
    const skillsDir = getSkillsDir()
    const ledgerPath = path.join(skillsDir, "ledger.jsonl")
    const changelogDir = path.join(skillsDir, "changelog")

    // -------------------------------------------------------------------
    // Reads
    // -------------------------------------------------------------------

    /** List library skill names (file baselines without `.md`, sorted). */
    const list = (): Effect.Effect<string[], Error> =>
      trySync("list skills", () =>
        listLibraryFiles(skillsDir).map((f) => path.basename(f, ".md")).sort(),
      )

    /** Read one skill file's full text, or null when it does not exist. */
    const read = (name: string): Effect.Effect<string | null, Error> =>
      trySync("read skill", () => {
        const file = skillPath(skillsDir, sanitizeSkillName(name))
        if (!fs.existsSync(file)) return null
        return fs.readFileSync(file, "utf-8")
      })

    /**
     * Content hash of the library (16 hex chars).
     *
     * sha256 over sorted `relpath\0content` of every `*.md` directly under
     * the skills dir, excluding README.md (docs-only edits must not change
     * the library's identity) and changelog/ (history, not guidance).
     */
    const sha = (): Effect.Effect<string, Error> =>
      trySync("hash library", () => librarySha(skillsDir))

    /** Number of grade records currently in the ledger. */
    const ledgerSize = (): Effect.Effect<number, Error> =>
      trySync("read ledger", () => {
        if (!fs.existsSync(ledgerPath)) return 0
        return fs
          .readFileSync(ledgerPath, "utf-8")
          .split("\n")
          .filter((l) => l.trim()).length
      })

    // -------------------------------------------------------------------
    // Staging (writes to campaign dirs only — never the library)
    // -------------------------------------------------------------------

    /**
     * Stage a worker's report into a campaign directory: each proposedNew
     * entry becomes a `proposed/<slug>.md` proposal file in library entry
     * format; each proposedEdit becomes a JSON patch under `patches/`.
     * The raw report is kept alongside for audit.
     */
    const stageProposal = (
      report: SkillReport,
      campaignDir: string,
    ): Effect.Effect<StageOutcome, Error> =>
      trySync("stage proposal", () => {
        const proposedDir = path.join(campaignDir, "proposed")
        const patchesDir = path.join(campaignDir, "patches")
        fs.mkdirSync(proposedDir, { recursive: true })
        if (report.proposedEdits.length > 0) fs.mkdirSync(patchesDir, { recursive: true })

        const used = new Set<string>()
        const proposalFiles: string[] = []
        for (const entry of report.proposedNew) {
          let slug = slugify(`${entry.skill}-${entry.title}`)
          let n = 1
          while (used.has(slug)) slug = `${slugify(`${entry.skill}-${entry.title}`)}-${++n}`
          used.add(slug)
          const file = path.join(proposedDir, `${slug}.md`)
          const skillName = sanitizeSkillName(entry.skill)
          const body = [
            "---",
            `name: ${skillName}`,
            `description: ${entry.title.replace(/\s*\n\s*/g, " ").trim()}`,
            "---",
            "",
            "## Proposed",
            "",
            renderEntryBlock({ ...entry, skill: skillName }),
            "",
          ].join("\n")
          atomicWriteFile(file, body)
          proposalFiles.push(file)
        }

        const patchFiles: string[] = []
        report.proposedEdits.forEach((edit, i) => {
          const file = path.join(
            patchesDir,
            `${String(i).padStart(3, "0")}-${slugify(edit.skill)}.json`,
          )
          atomicWriteFile(file, JSON.stringify(edit, null, 2) + "\n")
          patchFiles.push(file)
        })

        const reportFile = path.join(campaignDir, "skill_report.json")
        atomicWriteFile(reportFile, JSON.stringify(report, null, 2) + "\n")

        return { proposedDir, proposalFiles, patchFiles, reportFile }
      })

    // -------------------------------------------------------------------
    // The only library writer
    // -------------------------------------------------------------------

    /**
     * Apply a verified report's staged proposals into the library.
     *
     * REPLACE-NOT-ANNOTATE: an entry whose title already exists in the
     * target skill file is overwritten in place and its old text appended
     * to `changelog/<skill>.md`; otherwise the entry is appended (or a new
     * skill file created). When the report carries per-proposal
     * dispositions, only "sound" ones apply (v1 verifier leaves
     * `proposals` empty — a verified report then promotes the whole staged
     * package). Prose edit patches are recorded to the target changelog;
     * Phase 1 does not splice prose into library text.
     */
    const applyVerified = (
      report: VerificationReport,
      proposalDir: string,
    ): Effect.Effect<ApplyOutcome, Error> =>
      trySync("apply verified proposals", () => {
        const structuralGrading = report.proposals.length > 0
        const soundTitles = new Set(
          report.proposals.filter((p) => p.disposition === "sound").map((p) => p.title),
        )

        const proposalFiles = resolveProposalFiles(proposalDir)
        const outcome: ApplyOutcome = { applied: [], patched: [], skipped: [] }

        for (const file of proposalFiles) {
          const parsed = parseSkillFile(fs.readFileSync(file, "utf-8"), path.basename(file, ".md"))
          for (const entry of parsed.entries) {
            if (structuralGrading && !soundTitles.has(entry.title)) {
              outcome.skipped.push(`${entry.skill} §${entry.title}`)
              continue
            }
            applyEntry(skillsDir, changelogDir, entry)
            outcome.applied.push(`${entry.skill} §${entry.title}`)
          }
        }

        if (!structuralGrading) {
          for (const patchFile of resolvePatchFiles(proposalDir)) {
            try {
              const patch = JSON.parse(fs.readFileSync(patchFile, "utf-8")) as {
                skill?: string
                section?: string
                change?: string
                why?: string
              }
              const skill = sanitizeSkillName(patch.skill ?? "")
              if (!skill) continue
              recordPatch(changelogDir, skill, patch)
              outcome.patched.push(`${skill} §${patch.section ?? ""}`.trim())
            } catch {
              // corrupt patch file — skip rather than abort the apply
            }
          }
        }

        return outcome
      })

    // -------------------------------------------------------------------
    // Grades
    // -------------------------------------------------------------------

    /**
     * Append the consulted verdicts of a skill report to the library
     * ledger (one JSON line per grade). Returns the number of lines
     * written.
     */
    const recordGrades = (report: SkillReport): Effect.Effect<number, Error> =>
      trySync("record grades", () => {
        if (report.consulted.length === 0) return 0
        fs.mkdirSync(skillsDir, { recursive: true })
        const ts = new Date().toISOString()
        const lines = report.consulted
          .map((c) =>
            JSON.stringify({
              kind: "grade",
              skill: c.skill,
              section: c.section,
              verdict: c.verdict,
              evidence: c.evidence,
              ts,
            }),
          )
          .join("\n")
        fs.appendFileSync(ledgerPath, lines + "\n", "utf-8")
        return report.consulted.length
      })

    // -------------------------------------------------------------------
    // Service API
    // -------------------------------------------------------------------

    return {
      list,
      read,
      sha,
      ledgerSize,
      stageProposal,
      applyVerified,
      recordGrades,
    } as const
  }),
  dependencies: [],
}) {}

/** Default live layer for the SkillLibrary service. */
export const SkillLibraryLive = SkillLibrary.Default

// ---------------------------------------------------------------------------
// Standalone helpers (used by the service above and directly by tests/CLI)
// ---------------------------------------------------------------------------

/** Content hash — see SkillLibrary.sha (exported for one-off use). */
export function librarySha(skillsDir: string): string {
  const digest = crypto.createHash("sha256")
  const files = listLibraryFiles(skillsDir)
    .map((f) => [path.basename(f), fs.readFileSync(f, "utf-8")] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  for (const [rel, content] of files) {
    digest.update(rel)
    digest.update("\0")
    digest.update(content)
    digest.update("\0")
  }
  return digest.digest("hex").slice(0, 16)
}

/** Locate staged proposal files for applyVerified: `proposed/` when present,
 *  otherwise `*.md` directly in the given dir (single-file path accepted). */
export function resolveProposalFiles(proposalDir: string): string[] {
  try {
    if (!fs.existsSync(proposalDir)) return []
    if (fs.statSync(proposalDir).isFile()) {
      return proposalDir.endsWith(".md") ? [proposalDir] : []
    }
    const proposed = path.join(proposalDir, "proposed")
    const dir = fs.existsSync(proposed) ? proposed : proposalDir
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .sort()
      .map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

/** Locate staged JSON edit patches (used when no structural grading exists). */
export function resolvePatchFiles(proposalDir: string): string[] {
  try {
    if (!fs.existsSync(proposalDir) || !fs.statSync(proposalDir).isDirectory()) return []
    const patches = path.join(proposalDir, "patches")
    if (!fs.existsSync(patches)) return []
    return fs
      .readdirSync(patches)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => path.join(patches, f))
  } catch {
    return []
  }
}

/** Apply one entry into the library with REPLACE-NOT-ANNOTATE semantics. */
function applyEntry(skillsDir: string, changelogDir: string, entry: SkillEntry): void {
  const skill = sanitizeSkillName(entry.skill)
  const file = skillPath(skillsDir, skill)
  const block = renderEntryBlock({ ...entry, skill })

  if (!fs.existsSync(file)) {
    atomicWriteFile(file, renderSkillFile(skill, entry.title, [{ ...entry, skill }]))
    return
  }

  const text = fs.readFileSync(file, "utf-8")
  const lines = text.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const m = /^###\s+(.+?)\s*$/.exec(lines[i])
    if (m && m[1].trim() === entry.title.trim()) {
      start = i
      break
    }
  }

  if (start === -1) {
    // new title — append, keeping a blank line after the previous block
    const sep = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n"
    atomicWriteFile(file, `${text}${sep}${block}\n`)
    return
  }

  let end = start + 1
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) end++
  const oldBlock = lines.slice(start, end).join("\n")
  const nextLines = [...lines.slice(0, start), ...block.split("\n"), ...lines.slice(end)]
  atomicWriteFile(file, nextLines.join("\n"))

  // replaced, not annotated: the old text lives in the changelog
  const changelog = path.join(changelogDir, `${skill}.md`)
  fs.mkdirSync(changelogDir, { recursive: true })
  fs.appendFileSync(
    changelog,
    `\n## ${entry.title} — replaced ${new Date().toISOString()}\n\n${oldBlock}\n`,
    "utf-8",
  )
}

/** Record a prose edit patch in the target skill's changelog (not spliced). */
function recordPatch(
  changelogDir: string,
  skill: string,
  patch: { section?: string; change?: string; why?: string },
): void {
  fs.mkdirSync(changelogDir, { recursive: true })
  const changelog = path.join(changelogDir, `${skill}.md`)
  const ts = new Date().toISOString()
  fs.appendFileSync(
    changelog,
    [
      `\n## Proposed edit — recorded ${ts}`,
      "",
      `Target: ${skill} §${patch.section ?? ""}`,
      `Why: ${patch.why ?? ""}`,
      "",
      patch.change ?? "",
      "",
      "Status: recorded by /aspire apply; prose edits are not auto-spliced into the library (Phase 1 applies new entries only).",
      "",
    ].join("\n"),
    "utf-8",
  )
}
