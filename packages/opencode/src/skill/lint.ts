/**
 * Executable lint for the skill library — port of ASPIRE's lint_skills.py.
 *
 * Every check here is retroactive in spirit: it names defect classes that
 * cost real verification runs (unparseable snippets, helpers called but
 * defined nowhere, cross-references that no longer resolve, search loops
 * with no empty case). Errors block; warnings advise.
 *
 * Checks (see LintIssue.check):
 * - `unparseable-fence`  (ERROR) every ```ts/typescript/js fence must parse
 * - `undefined-helper`   (ERROR) identifiers used but defined nowhere
 * - `dangling-section-ref` (ERROR) `other.md §Section` must resolve to a heading
 * - `seeded-search-loop` (WARN) result seeded before a break-loop, no empty case
 * - `unguarded-min-max`  (WARN) Math.min/max over a possibly-empty spread
 *
 * @module skill/lint
 */

import * as fs from "fs"
import * as path from "path"
import ts from "typescript"
import { getMomoHome } from "../session/recorder"

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface LintIssue {
  file: string
  line?: number
  check: string
  message: string
}

export interface LintResult {
  errors: LintIssue[]
  warnings: LintIssue[]
}

// ---------------------------------------------------------------------------
// Builtins
// ---------------------------------------------------------------------------

/**
 * Identifiers a fence may use without declaring them.
 *
 * JS/TS builtins plus the globals available in the momo runtime
 * (process/Buffer/require) and the common TypeScript utility types,
 * which appear as plain identifiers in type positions.
 */
const BUILTINS = new Set([
  // JS/TS builtins
  "console", "JSON", "Math", "Object", "Array", "String", "Number", "Boolean",
  "Promise", "Map", "Set", "Date", "Error", "RegExp", "Symbol",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "globalThis", "Intl", "Reflect", "Proxy", "WeakMap", "WeakSet", "WeakRef",
  "ArrayBuffer", "SharedArrayBuffer", "DataView", "BigInt",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array",
  // node runtime
  "Buffer", "process", "require", "module", "exports",
  // pseudo-globals parsed as identifiers
  "undefined", "NaN", "Infinity",
  // TypeScript utility / lib types seen as type-reference identifiers
  "Record", "Partial", "Pick", "Omit", "Exclude", "Extract", "NonNullable",
  "ReturnType", "InstanceType", "Parameters", "ConstructorParameters",
  "Readonly", "Required", "ThisType", "PromiseLike", "ArrayLike",
])

// ---------------------------------------------------------------------------
// Fence extraction & parsing
// ---------------------------------------------------------------------------

export interface Fence {
  /** 1-based line number of the first code line inside the fence. */
  line: number
  lang: string
  code: string
}

const FENCE_OPEN = /^```(ts|typescript|js)\s*$/
const FENCE_CLOSE = /^```\s*$/

/** Extract ts/typescript/js fenced code blocks from markdown text. */
export function extractFences(text: string): Fence[] {
  const lines = text.split(/\r?\n/)
  const fences: Fence[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i])
    if (!open) continue
    const startLine = i + 2 // first code line (1-based)
    const buf: string[] = []
    i++
    while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    fences.push({ line: startLine, lang: open[1], code: buf.join("\n") })
  }
  return fences
}

/**
 * Parse a code snippet with the TypeScript compiler and return error
 * messages (line:col prefixed). Empty array means the snippet parses.
 * Shared with report.ts so proposals and library fences are judged alike.
 */
export function codeParseErrors(code: string): string[] {
  const result = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  return (result.diagnostics ?? [])
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => {
      const pos =
        d.start === undefined
          ? ""
          : (() => {
              const upto = code.slice(0, d.start)
              const line = upto.split("\n").length
              const col = d.start - upto.lastIndexOf("\n")
              return `${line}:${col}: `
            })()
      return `${pos}${ts.flattenDiagnosticMessageText(d.messageText, " ")}`
    })
}

// ---------------------------------------------------------------------------
// Declaration / use analysis
// ---------------------------------------------------------------------------

/**
 * True when `node` is the binding name of a declaration (variable, function,
 * class, parameter, import binding, type alias, ...). Parent pointers are
 * required, so source files must be created with setParentNodes.
 */
function isDeclarationName(node: ts.Identifier): boolean {
  const p = node.parent as ts.NamedDeclaration | undefined
  if (!p || p.name !== node) return false
  return (
    ts.isFunctionDeclaration(p) ||
    ts.isFunctionExpression(p) ||
    ts.isClassDeclaration(p) ||
    ts.isClassExpression(p) ||
    ts.isVariableDeclaration(p) ||
    ts.isParameter(p) ||
    ts.isBindingElement(p) ||
    ts.isTypeAliasDeclaration(p) ||
    ts.isInterfaceDeclaration(p) ||
    ts.isEnumDeclaration(p) ||
    ts.isEnumMember(p) ||
    ts.isModuleDeclaration(p) ||
    ts.isImportSpecifier(p) ||
    ts.isNamespaceImport(p) ||
    ts.isImportClause(p)
  )
}

/** True for identifiers that are labels/member names, not value references. */
function isNonReferenceName(node: ts.Identifier): boolean {
  const p = node.parent
  if (!p) return false
  // obj.prop — `prop` is a member name
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true
  // A.B in type positions — `B`
  if (ts.isQualifiedName(p) && p.right === node) return true
  // { key: value } — `key` is a label (shorthand `{ key }` stays a use)
  if (ts.isPropertyAssignment(p) && p.name === node) return true
  // member declarations and export renames
  if (
    (ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isPropertySignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isExportSpecifier(p) ||
      ts.isImportSpecifier(p)) &&
    p.name === node
  ) {
    return true
  }
  return false
}

/** Collect all declared (bound) top-level-ish names in a source file. */
function collectDeclared(sf: ts.SourceFile): Set<string> {
  const declared = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isDeclarationName(node)) declared.add(node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return declared
}

/** Collect identifiers used as value references in a source file. */
function collectUses(sf: ts.SourceFile): Map<string, number> {
  const uses = new Map<string, number>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      !isDeclarationName(node) &&
      !isNonReferenceName(node) &&
      !BUILTINS.has(node.text)
    ) {
      if (!uses.has(node.text)) uses.set(node.text, node.getStart(sf))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return uses
}

// ---------------------------------------------------------------------------
// Heuristic warnings (ported from lint_skills.py)
// ---------------------------------------------------------------------------

/**
 * Result variables seeded with a real value before a search loop that
 * only overwrites them on match (break). "Nothing matched" silently
 * proceeds with the known-bad default — the classic empty-search bug.
 */
function seededSearchNames(sf: ts.SourceFile): string[] {
  const seeded = new Map<string, number>()
  const findSeeds = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      node.initializer.kind !== ts.SyntaxKind.NullKeyword &&
      !(ts.isIdentifier(node.initializer) && node.initializer.text === "undefined")
    ) {
      seeded.set(node.name.text, node.getStart(sf))
    }
    ts.forEachChild(node, findSeeds)
  }
  findSeeds(sf)

  const flagged = new Set<string>()
  const isLoop = (node: ts.Node): node is ts.IterationStatement | ts.WhileStatement | ts.DoStatement =>
    ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) || ts.isDoStatement(node)

  const containsBreak = (node: ts.Node): boolean => {
    let found = false
    const walk = (n: ts.Node): void => {
      if (ts.isBreakStatement(n)) found = true
      if (!found) ts.forEachChild(n, walk)
    }
    walk(node)
    return found
  }

  const visit = (node: ts.Node): void => {
    if (isLoop(node) && containsBreak(node)) {
      const loopStart = node.getStart(sf)
      const findAssign = (n: ts.Node): void => {
        if (
          ts.isBinaryExpression(n) &&
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(n.left)
        ) {
          const seedPos = seeded.get(n.left.text)
          if (seedPos !== undefined && seedPos < loopStart) flagged.add(n.left.text)
        }
        ts.forEachChild(n, findAssign)
      }
      findAssign(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return [...flagged].sort()
}

/**
 * `Math.min(...xs)` / `Math.max(...xs)` (or a no-arg call) with no
 * `xs.length` emptiness guard anywhere in the snippet.
 */
function unguardedMinMax(sf: ts.SourceFile, code: string): string[] {
  const found = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Math" &&
      (node.expression.name.text === "min" || node.expression.name.text === "max")
    ) {
      const first = node.arguments[0]
      if (node.arguments.length === 0) {
        found.add(`Math.${node.expression.name.text}() with no arguments`)
      } else if (first && ts.isSpreadElement(first)) {
        const inner = first.expression
        if (ts.isIdentifier(inner)) {
          if (!code.includes(`${inner.text}.length`)) {
            found.add(`Math.${node.expression.name.text}(...${inner.text}) with no emptiness guard`)
          }
        } else {
          found.add(`Math.${node.expression.name.text}(...<expr>) over a possibly-empty collection`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return [...found].sort()
}

// ---------------------------------------------------------------------------
// § cross-references
// ---------------------------------------------------------------------------

// `other.md §Section Name` / `other.md §*Section*` (ASPIRE SECTION_REF port)
const SECTION_REF = /`?([A-Za-z0-9_-]+\.md)`?\s*§\*?([^*\n.,;)]{4,60})/g

function normaliseHeading(text: string): string {
  return text.replace(/[` *~]/g, "").trim().toLowerCase()
}

function collectHeadings(text: string): Set<string> {
  const headings = new Set<string>()
  const re = /^#{2,3} (.+)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) headings.add(normaliseHeading(m[1]))
  return headings
}

function lineOfOffset(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length
}

// ---------------------------------------------------------------------------
// File sets
// ---------------------------------------------------------------------------

/**
 * Skill library markdown files: `*.md` directly under the library dir.
 * README.md documents the lifecycle (docs-only edits must not change the
 * library's identity — same exclusion as the content hash), and
 * `changelog/` holds history, not runtime guidance.
 */
export function listLibraryFiles(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .sort()
      .map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Core lint
// ---------------------------------------------------------------------------

function parseFenceFile(
  file: string,
  text: string,
  report: boolean,
  errors: LintIssue[],
): Array<{ sf: ts.SourceFile; fence: Fence }> {
  const parsed: Array<{ sf: ts.SourceFile; fence: Fence }> = []
  for (const fence of extractFences(text)) {
    const parseErrors = codeParseErrors(fence.code)
    if (parseErrors.length > 0) {
      if (report) {
        errors.push({
          file: path.basename(file),
          line: fence.line,
          check: "unparseable-fence",
          message: `fence does not parse: ${parseErrors[0]}`,
        })
      }
      continue
    }
    const sf = ts.createSourceFile(
      `${path.basename(file)}:${fence.line}`,
      fence.code,
      ts.ScriptTarget.ES2022,
      /* setParentNodes */ true,
    )
    parsed.push({ sf, fence })
  }
  return parsed
}

/**
 * Lint `targets`, treating `declaredScope` files as definition context
 * (their declared names satisfy uses in the targets). Problems are only
 * reported for files in `targets`.
 */
function lintFiles(targets: string[], declaredScope: string[]): LintResult {
  const errors: LintIssue[] = []
  const warnings: LintIssue[] = []
  const targetSet = new Set(targets)

  const texts = new Map<string, string>()
  const fencesByFile = new Map<string, Array<{ sf: ts.SourceFile; fence: Fence }>>()
  const declaredGlobal = new Set<string>()
  const headingsByFile = new Map<string, Set<string>>()

  for (const file of new Set([...declaredScope, ...targets])) {
    let text: string
    try {
      text = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }
    texts.set(file, text)
    headingsByFile.set(path.basename(file), collectHeadings(text))
    const parsed = parseFenceFile(file, text, targetSet.has(file), errors)
    fencesByFile.set(file, parsed)
    for (const { sf } of parsed) {
      for (const name of collectDeclared(sf)) declaredGlobal.add(name)
    }
  }

  // undefined helpers (only uses originating in target files are reported,
  // one issue per name per file no matter how many fences use it)
  for (const file of targets) {
    const firstSite = new Map<string, number>()
    for (const { sf } of fencesByFile.get(file) ?? []) {
      for (const [name, pos] of collectUses(sf).entries()) {
        if (declaredGlobal.has(name)) continue
        if (!firstSite.has(name)) {
          firstSite.set(name, sf.getLineAndCharacterOfPosition(pos).line + 1)
        }
      }
    }
    for (const [name, line] of [...firstSite.entries()].sort((a, b) => a[1] - b[1])) {
      errors.push({
        file: path.basename(file),
        line,
        check: "undefined-helper",
        message: `'${name}' is used but defined nowhere (not a builtin, not declared in any fence of the library)`,
      })
    }
  }

  // heuristic warnings per fence
  for (const file of targets) {
    for (const { sf, fence } of fencesByFile.get(file) ?? []) {
      for (const name of seededSearchNames(sf)) {
        warnings.push({
          file: path.basename(file),
          line: fence.line,
          check: "seeded-search-loop",
          message: `'${name}' is assigned a non-null value before a search loop with break and never re-handled after an empty loop — seed it null/undefined and branch on no-match`,
        })
      }
      for (const msg of unguardedMinMax(sf, fence.code)) {
        warnings.push({
          file: path.basename(file),
          line: fence.line,
          check: "unguarded-min-max",
          message: msg,
        })
      }
    }
  }

  // dangling § cross-references (targets only, headings from all context)
  for (const file of targets) {
    const text = texts.get(file)
    if (!text) continue
    SECTION_REF.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SECTION_REF.exec(text))) {
      const targetFile = m[1]
      const section = normaliseHeading(m[2])
      const headings = headingsByFile.get(targetFile)
      if (!headings) continue // unknown file — not ours to police
      const resolved = [...headings].some(
        (h) => h.includes(section.slice(0, 30)) || section.includes(h.slice(0, 30)),
      )
      if (!resolved) {
        errors.push({
          file: path.basename(file),
          line: lineOfOffset(text, m.index),
          check: "dangling-section-ref",
          message: `${targetFile} §${m[2].trim()} does not resolve to any heading in ${targetFile}`,
        })
      }
    }
  }

  return { errors, warnings }
}

/**
 * Lint the whole library directory (`*.md` directly under it, excluding
 * README.md and the changelog/ subdirectory).
 */
export function lintLibrary(dir: string): LintResult {
  const files = listLibraryFiles(dir)
  return lintFiles(files, files)
}

/**
 * Lint one staged proposal file against the library: library files count
 * as definition context (a helper the library defines is "defined"), but
 * only problems originating in the proposal are reported. Run this BEFORE
 * dispatching a verifier — an undefined helper here is a wasted trial.
 */
export function lintProposalFile(
  file: string,
  libraryDir: string = path.join(getMomoHome(), "skills"),
): LintResult {
  return lintFiles([file], [file, ...listLibraryFiles(libraryDir)])
}
