#!/usr/bin/env node
/**
 * MOMO CODE v2.0 — End-to-End Smoke Test
 * Run: npx tsx src/test/e2e-smoke.ts
 */

import fs from "fs"
import path from "path"
import os from "os"

const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const RESET = "\x1b[0m"

let pass = 0
let fail = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${name}`)
    pass++
  } else {
    console.log(`  ${RED}✗${RESET} ${name}`)
    fail++
  }
}

async function main(): Promise<void> {
  console.log("\n🧪 MOMO CODE v2.0 — Smoke Test\n")

  const rootDir = path.join(process.cwd(), "..", "..")
  const srcDir = path.join(rootDir, "packages", "opencode", "src")

  // P0: Honesty
  console.log("P0: Honesty")
  check("NOTICE file exists", fs.existsSync(path.join(rootDir, "NOTICE")))
  check("LICENSE mentions THIRD-PARTY", fs.readFileSync(path.join(rootDir, "LICENSE"), "utf-8").includes("THIRD-PARTY"))
  check("README has Experimental", fs.readFileSync(path.join(rootDir, "README.md"), "utf-8").includes("Experimental"))

  // P1: Pi Extensions
  console.log("\nP1: Pi Extensions")
  check("experience.ts exists", fs.existsSync(path.join(srcDir, "pi-extensions", "experience.ts")))
  check("rsi.ts exists", fs.existsSync(path.join(srcDir, "pi-extensions", "rsi.ts")))
  check("brand.ts exists", fs.existsSync(path.join(srcDir, "pi-extensions", "brand.ts")))
  check("permissions.ts exists", fs.existsSync(path.join(srcDir, "pi-extensions", "permissions.ts")))
  check("decisions.ts exists", fs.existsSync(path.join(srcDir, "pi-extensions", "decisions.ts")))
  check("cot.ts exists", fs.existsSync(path.join(srcDir, "pi-extensions", "cot.ts")))

  // P2: Bench + Gate
  console.log("\nP2: momo-bench")
  check("momo-bench/index.ts exists", fs.existsSync(path.join(srcDir, "momo-bench", "index.ts")))
  check("momo-bench/gate.ts exists", fs.existsSync(path.join(srcDir, "momo-bench", "gate.ts")))

  // P3: RSI
  console.log("\nP3: RSI")
  check("rsi/index.ts exists", fs.existsSync(path.join(srcDir, "rsi", "index.ts")))

  // P4: JEV + DecisionPort
  console.log("\nP4: JEV")
  check("jev/index.ts exists", fs.existsSync(path.join(srcDir, "jev", "index.ts")))
  check("decision/port.ts exists", fs.existsSync(path.join(srcDir, "decision", "port.ts")))

  // P5: REPL / UI
  console.log("\nP5: REPL / UI")
  check("repl/keyboard.ts exists", fs.existsSync(path.join(srcDir, "repl", "keyboard.ts")))
  check("repl/cot-renderer.ts exists", fs.existsSync(path.join(srcDir, "repl", "cot-renderer.ts")))
  check("repl/decision-capsule.ts exists", fs.existsSync(path.join(srcDir, "repl", "decision-capsule.ts")))
  check("repl/index.ts exists", fs.existsSync(path.join(srcDir, "repl", "index.ts")))

  // P6: Runtime types + Config + Experience closure
  console.log("\nP6: Runtime / Config / Evolve")
  check("runtime/types.ts exists", fs.existsSync(path.join(srcDir, "runtime", "types.ts")))
  check("config/schema.ts exists", fs.existsSync(path.join(srcDir, "config", "schema.ts")))
  check("experience/closure.ts exists", fs.existsSync(path.join(srcDir, "experience", "closure.ts")))
  check("evolve/candidate.ts exists", fs.existsSync(path.join(srcDir, "evolve", "candidate.ts")))

  // P7: Entry
  console.log("\nP7: Entry Point")
  check("bin/momo exists", fs.existsSync(path.join(rootDir, "packages", "opencode", "bin", "momo")))

  // Summary
  console.log(`\n${GREEN}Pass: ${pass}${RESET}  ${RED}Fail: ${fail}${RESET}`)
  if (fail === 0) {
    console.log(`\n${GREEN}🎉 All smoke tests passed!${RESET}\n`)
    process.exit(0)
  } else {
    console.log(`\n${RED}❌ Some tests failed.${RESET}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
