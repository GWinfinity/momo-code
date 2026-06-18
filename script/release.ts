#!/usr/bin/env bun
/**
 * momo Code Release Script
 * 
 * Flow: version --> build --> publish npm --> finalize
 * 
 * Environment:
 *   MOMO_VERSION    -- target version (or auto-bump)
 *   MOMO_BUMP       -- patch | minor | major
 *   MOMO_RELEASE    -- set to create GitHub release
 *   MOMO_CHANNEL    -- release channel (default: stable)
 */
import { $ } from "bun"

const BUMP = process.env.MOMO_BUMP || Bun.argv[2] || "patch"
const CHANNEL = process.env.MOMO_CHANNEL || "stable"

async function main() {
  console.log("momo Code Release Pipeline")
  console.log(`   Channel: ${CHANNEL}`)
  console.log(`   Bump: ${BUMP}`)

  // 1. Calculate version
  console.log("\nStep 1: Version")
  const pkg = await Bun.file("packages/opencode/package.json").json()
  const current = pkg.version
  const next = bumpVersion(current, BUMP)
  console.log(`   ${current} --> ${next}`)

  // 2. Build
  console.log("\nStep 2: Build")
  await $`bun run packages/opencode/script/build.ts`

  // 3. Publish npm
  console.log("\nStep 3: Publish npm")
  await publishNpm(next)

  // 4. Finalize
  console.log("\nStep 4: Finalize")
  if (process.env.MOMO_RELEASE) {
    await createGitHubRelease(next)
  }

  console.log(`\nReleased momo Code v${next}`)
}

function bumpVersion(current: string, bump: string): string {
  const [major, minor, patch] = current.split(".").map(Number)
  switch (bump) {
    case "major": return `${major + 1}.0.0`
    case "minor": return `${major}.${minor + 1}.0`
    default: return `${major}.${minor}.${patch + 1}`
  }
}

async function publishNpm(version: string) {
  // Update version in package.json
  const pkg = await Bun.file("packages/opencode/package.json").json()
  pkg.version = version
  await Bun.write("packages/opencode/package.json", JSON.stringify(pkg, null, 2))

  // Build platform binaries
  const platforms = [
    { platform: "darwin", arch: "arm64" },
    { platform: "darwin", arch: "x64" },
    { platform: "linux", arch: "arm64" },
    { platform: "linux", arch: "x64" },
    { platform: "win32", arch: "arm64" },
    { platform: "win32", arch: "x64" },
  ]

  for (const { platform, arch } of platforms) {
    const pkgName = `momocode-${platform}-${arch}`
    console.log(`   Publishing ${pkgName}...`)
    // Platform-specific binary publishing logic
  }

  // Publish main wrapper package
  console.log("   Publishing @momo/cli...")
}

async function createGitHubRelease(version: string) {
  console.log(`   Creating GitHub release v${version}...`)
  // GitHub release creation logic
}

main().catch(err => {
  console.error("Release failed:", err)
  process.exit(1)
})
