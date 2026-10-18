/**
 * SkillReport validation — port of ASPIRE campaign.py --validate-skill-report.
 *
 * A malformed report degrades silently to "this task proposed nothing",
 * which reads exactly like a task that had nothing to say. Validation is
 * therefore structural and strict: verdict vocab, evidence specificity,
 * proposal field completeness, and code that a verifier could actually
 * run (it receives the snippet text and nothing else).
 *
 * @module skill/report
 */

import ts from "typescript"
import { codeParseErrors } from "./lint"
import { VERDICTS, type SkillReport } from "./schema"

/** Minimum evidence length for a "misleading"/"wrong" grade to be actionable. */
const SPECIFIC_ENOUGH = 40

const SHA16 = /^[0-9a-f]{16}$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export type ValidationResult =
  | { ok: true; report: SkillReport }
  | { ok: false; errors: string[] }

/**
 * Validate a parsed skill_report.json. Returns the typed report on success
 * or a list of human-readable problems (most structural first).
 */
export function validateSkillReport(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return { ok: false, errors: ["not a JSON object"] }
  const problems: string[] = []

  if (!nonEmpty(raw.skillLibrarySha)) {
    problems.push("skillLibrarySha is missing — a rerun cannot tell which library ran")
  } else if (!SHA16.test(String(raw.skillLibrarySha).trim())) {
    problems.push(`skillLibrarySha must be a 16-char hex string, got '${raw.skillLibrarySha}'`)
  }

  const consulted = Array.isArray(raw.consulted) ? raw.consulted : []
  const proposedEdits = Array.isArray(raw.proposedEdits) ? raw.proposedEdits : []
  const proposedNew = Array.isArray(raw.proposedNew) ? raw.proposedNew : []

  consulted.forEach((entry, i) => {
    const where = `consulted[${i}]`
    if (!isRecord(entry)) {
      problems.push(`${where}: not an object`)
      return
    }
    if (!nonEmpty(entry.skill)) problems.push(`${where}: no skill named`)
    if (!nonEmpty(entry.section)) problems.push(`${where}: no section named`)
    const verdict = entry.verdict
    if (typeof verdict !== "string" || !(VERDICTS as readonly string[]).includes(verdict)) {
      problems.push(`${where}: verdict '${String(verdict)}' is not one of ${VERDICTS.join(", ")}`)
    }
    const evidence = nonEmpty(entry.evidence) ? entry.evidence.trim() : ""
    if (!evidence) {
      problems.push(`${where}: no evidence for a '${String(verdict)}' grade`)
    } else if ((verdict === "misleading" || verdict === "wrong") && evidence.length < SPECIFIC_ENOUGH) {
      problems.push(
        `${where}: a '${verdict}' grade needs specifics a maintainer can act on (>= ${SPECIFIC_ENOUGH} chars), got ${evidence.length}`,
      )
    }
  })

  proposedNew.forEach((entry, i) => {
    const where = `proposedNew[${i}]`
    if (!isRecord(entry)) {
      problems.push(`${where}: not an object`)
      return
    }
    for (const field of ["skill", "title", "trigger", "code", "evidence"] as const) {
      if (!nonEmpty(entry[field])) {
        problems.push(`${where}: ${field} is empty — a verifier gets only this text`)
      }
    }
    if (nonEmpty(entry.code)) {
      const parseErrors = codeParseErrors(String(entry.code))
      if (parseErrors.length > 0) {
        problems.push(`${where}: code does not parse (${parseErrors[0]}) — a verifier cannot run it`)
      }
    }
  })

  proposedEdits.forEach((entry, i) => {
    const where = `proposedEdits[${i}]`
    if (!isRecord(entry)) {
      problems.push(`${where}: not an object`)
      return
    }
    for (const field of ["skill", "section", "change", "why"] as const) {
      if (!nonEmpty(entry[field])) problems.push(`${where}: ${field} is empty`)
    }
  })

  if (problems.length > 0) return { ok: false, errors: problems }
  return { ok: true, report: raw as unknown as SkillReport }
}

// ---------------------------------------------------------------------------
// underivedScalars — free names participating in arithmetic
// ---------------------------------------------------------------------------

/** Binary operators whose operands must come from bound values. */
const ARITHMETIC_OPS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
])

function declaredNames(code: string): Set<string> {
  const sf = ts.createSourceFile("snippet.ts", code, ts.ScriptTarget.ES2022, true)
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    const p = node.parent as ts.NamedDeclaration | undefined
    if (
      ts.isIdentifier(node) &&
      p &&
      p.name === node &&
      (ts.isFunctionDeclaration(p) ||
        ts.isFunctionExpression(p) ||
        ts.isClassDeclaration(p) ||
        ts.isClassExpression(p) ||
        ts.isVariableDeclaration(p) ||
        ts.isParameter(p) ||
        ts.isBindingElement(p) ||
        ts.isTypeAliasDeclaration(p) ||
        ts.isEnumDeclaration(p) ||
        ts.isImportSpecifier(p) ||
        ts.isNamespaceImport(p) ||
        ts.isImportClause(p))
    ) {
      names.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return names
}

/**
 * Names a snippet reads in an arithmetic/binary expression without ever
 * binding them in the snippet itself. A verifier is handed the snippet
 * text and nothing else, so a name the code reads without deriving it is
 * a guess the author must explain in the trigger/evidence prose.
 * (Pure helper — used by tests and available to the Phase 2 coordinator.)
 */
export function underivedScalars(code: string): string[] {
  const sf = ts.createSourceFile("snippet.ts", code, ts.ScriptTarget.ES2022, true)
  const bound = declaredNames(code)
  const free = new Set<string>()

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      ARITHMETIC_OPS.has(node.operatorToken.kind)
    ) {
      for (const side of [node.left, node.right]) {
        if (ts.isIdentifier(side) && !bound.has(side.text)) free.add(side.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return [...free].sort()
}
