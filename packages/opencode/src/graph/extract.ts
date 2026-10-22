/**
 * Graph Engine — artifact extraction.
 *
 * After a node completes, scan its output for fenced code blocks and write
 * them to `~/.momo/graph-outputs/<graph-id>/<node-id>/`.  Each file's path
 * is either inferred from the first-line comment (`# src/foo.py`) or
 * auto-numbered (`output_0.py`).
 *
 * @module graph/extract
 */

import * as fs from "fs"
import * as path from "path"
import { getMomoHome } from "../session/recorder.js"

export interface ExtractedArtifact {
  /** Relative path under the graph output dir, e.g. "src/data_preprocess.py". */
  readonly path: string
  /** Absolute path on disk. */
  readonly fullPath: string
  /** Size in bytes. */
  readonly size: number
  /** Source node id. */
  readonly nodeId: string
}

/** Get the output directory for a graph run. */
export function getGraphOutputDir(graphId: string): string {
  return path.join(getMomoHome(), "graph-outputs", graphId)
}

/**
 * Extract fenced code blocks from a node's output and write them to disk.
 * Returns the list of extracted artifacts.
 */
export function extractArtifacts(
  graphId: string,
  nodeId: string,
  output: string,
): ExtractedArtifact[] {
  const outDir = getGraphOutputDir(graphId)
  const artifacts: ExtractedArtifact[] = []

  // Match ```lang ... ``` blocks (python, typescript, yaml, json, bash, etc.)
  const blockRe = /```(\w*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let autoIndex = 0

  while ((match = blockRe.exec(output)) !== null) {
    const lang = match[1].toLowerCase()
    const code = match[2].trim()
    if (code.length < 20) continue // skip trivial blocks

    // Determine extension from language tag
    const ext = langToExt(lang)
    if (!ext) continue // skip non-code blocks (markdown, text, etc.)

    // Try to infer filename from the first line
    const firstLine = code.split("\n")[0]
    const nameFromComment =
      firstLine.match(/^#\s*([\w\/\\.-]+\.\w+)\s*$/) ||
      firstLine.match(/^\/\/\s*([\w\/\\.-]+\.\w+)\s*$/) ||
      firstLine.match(/^<!--\s*([\w\/\\.-]+\.\w+)\s*-->$/)

    let relPath: string
    if (nameFromComment) {
      relPath = nameFromComment[1].replace(/\\/g, "/")
    } else {
      relPath = `${nodeId}/output_${autoIndex++}${ext}`
    }

    const fullPath = path.join(outDir, relPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, code, "utf-8")

    artifacts.push({ path: relPath, fullPath, size: code.length, nodeId })
  }

  return artifacts
}

/** Map a code-fence language tag to a file extension. */
function langToExt(lang: string): string | null {
  const map: Record<string, string> = {
    python: ".py",
    py: ".py",
    typescript: ".ts",
    ts: ".ts",
    javascript: ".js",
    js: ".js",
    yaml: ".yaml",
    yml: ".yaml",
    json: ".json",
    bash: ".sh",
    sh: ".sh",
    shell: ".sh",
    sql: ".sql",
    html: ".html",
    css: ".css",
    markdown: ".md",
    md: ".md",
    toml: ".toml",
    tex: ".tex",
    cpp: ".cpp",
    c: ".c",
    rust: ".rs",
    go: ".go",
    java: ".java",
  }
  return map[lang] ?? null
}
