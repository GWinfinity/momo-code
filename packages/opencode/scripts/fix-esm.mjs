#!/usr/bin/env node
/**
 * fix-esm.mjs — Auto-fix ESM imports after tsc compilation
 *
 * Handles two issues TypeScript compiler leaves unresolved:
 *   1. Path aliases (@/*) → relative paths
 *   2. Missing .js extensions on relative imports
 */

import { readdir, readFile, writeFile } from "fs/promises" 
import { statSync } from "fs"
import { join, relative, dirname, extname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, "..", "dist")

/** Recursively list all .js files under dir */
async function* walkJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkJsFiles(full)
    } else if (entry.isFile() && full.endsWith(".js")) {
      yield full
    }
  }
}

/** Compute relative path from fromFile to toFile, with .js extension */
function relativeImportPath(fromFile, toFile) {
  let rel = relative(dirname(fromFile), toFile)
  rel = rel.replace(/\\/g, "/")
  if (!rel.endsWith(".js")) {
    rel += ".js"
  }
  if (!rel.startsWith(".")) {
    rel = "./" + rel
  }
  return rel
}

/** Resolve a logical import path to a physical dist/ file path */
function resolveImport(sourceFile, importPath) {
  const sourceDir = dirname(sourceFile)
  if (importPath.startsWith("@/")) {
    const subPath = importPath.slice(2)
    const candidate = join(DIST_DIR, subPath + ".js")
    try {
      const s = statSync(candidate)
      if (s.isFile()) return candidate
    } catch { /* try index */ }
    const indexCandidate = join(DIST_DIR, subPath, "index.js")
    try {
      const s = statSync(indexCandidate)
      if (s.isFile()) return indexCandidate
    } catch { /* not found */ }
    return null
  }
  if (importPath.startsWith(".")) {
    const base = importPath.replace(/\.js$/, "")
    const candidates = [
      join(sourceDir, base + ".js"),
      join(sourceDir, base),
      join(sourceDir, base, "index.js"),
    ]
    for (const c of candidates) {
      try {
        const s = statSync(c)
        if (s.isFile()) return c
      } catch { /* not found */ }
    }
  }
  return null
}

/** Rewrite import/export statements in a single file */
async function fixFile(filePath) {
  const content = await readFile(filePath, "utf-8")
  let changed = false
  const regex = /((?:import|export)\s+.*?\s+from\s+|\}\s*from\s+)["']([^"']+)["']/g
  const newContent = content.replace(regex, (match, prefix, importPath) => {
    if (!importPath.startsWith(".") && !importPath.startsWith("@/")) {
      return match
    }
    if (importPath.startsWith(".") && importPath.endsWith(".js")) {
      return match
    }
    const resolved = resolveImport(filePath, importPath)
    if (!resolved) {
      return match
    }
    const newPath = relativeImportPath(filePath, resolved)
    changed = true
    return `${prefix}"${newPath}"`
  })
}

console.log("🔧 Fixing ESM imports in dist/...")
let count = 0
for await (const file of walkJsFiles(DIST_DIR)) {
  await fixFile(file)
  count++
}
console.log(`✅ Scanned ${count} files, ESM imports fixed.\n`)
