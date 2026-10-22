// SPDX-License-Identifier: MIT
// Download the Julia-1-ONNX decision model (SupersonicLabs, Apache-2.0)
// from ModelScope into the momo model directory, verifying SHA-256.
//
// Usage: node scripts/download-julia-model.mjs [--dir PATH]

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const BASE = "https://modelscope.cn/models/SupersonicLabs/Julia-1-ONNX/resolve/master"

const FILES = [
  // [relative path, sha256]
  ["model.onnx", "97141d0cfb1da6204e9f8f24d581af72eaeb82cda21149d83eaa6df7160fbcd9"],
  ["model.onnx.data", "fd915be810d7ebfb80fb05a48dd33c9484d17ae1b6bcb9e1f544cbaaa913ded1"],
  ["tokenizer.json", "609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f"],
  ["tokenizer_config.json", "6b069e57db0ce0794c22547725275f22618809c4ef4249307337e651a0dfef8c"],
  ["wasm/julia_webgpu_encode.js", null],
  ["wasm/julia_webgpu_encode_bg.wasm", null],
]

const argDir = process.argv.indexOf("--dir")
const dir =
  argDir > -1
    ? path.resolve(process.argv[argDir + 1])
    : path.join(process.env.MOMO_HOME || path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".momo"), "models", "julia-1")

fs.mkdirSync(path.join(dir, "wasm"), { recursive: true })

for (const [rel, sha] of FILES) {
  const dest = path.join(dir, rel)
  const url = `${BASE}/${rel}`
  const res = await fetch(url)
  if (!res.ok && res.status !== 200) throw new Error(`download failed ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (sha) {
    const got = createHash("sha256").update(buf).digest("hex")
    if (got !== sha) throw new Error(`sha256 mismatch for ${rel}: ${got} != ${sha}`)
  }
  fs.writeFileSync(dest, buf)
  console.log(`${rel}: ${buf.length} bytes${sha ? " (sha256 ok)" : ""}`)
}
console.log(`Julia-1 model ready at ${dir}`)
