// Test fixture: stands in for a real momo subagent. When process.argv[1] is
// pointed at this file, spawnSubagent() re-invokes `node <fixture> <task>`.
// Appends start/end markers to MOMO_FIXTURE_LOG (JSONL) so tests can assert
// execution intervals, sleeps MOMO_FIXTURE_SLEEP ms, then prints
// MOMO_FIXTURE_OUTPUT (default "OK").
const fs = require("fs")
const task = process.argv.slice(2).join(" ")
const log = process.env.MOMO_FIXTURE_LOG
const sleep = Number(process.env.MOMO_FIXTURE_SLEEP || 0) || 0
const output = process.env.MOMO_FIXTURE_OUTPUT || "OK"
const fail = process.env.MOMO_FIXTURE_FAIL === "1"

function marker(event) {
  if (!log) return
  fs.appendFileSync(log, JSON.stringify({ task, event, ts: Date.now() }) + "\n", "utf-8")
}

marker("start")
setTimeout(() => {
  marker("end")
  if (fail) {
    console.error("FIXTURE FAILURE")
    process.exit(1)
  }
  console.log(output)
  process.exit(0)
}, sleep)
