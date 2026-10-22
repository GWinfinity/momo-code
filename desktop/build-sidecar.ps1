# Build the momo gui-bridge sidecar as a single self-contained executable.
# Output: desktop/executables/momo-gui.exe (Windows) — bundled by `tinyjs build`
# via the executables/ mechanism. End users need neither Node.js nor Bun.
#
# Requires: bun (https://bun.sh) on the build machine only.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot          # repo root
$entry = Join-Path $root 'packages/opencode/src/cli/main.ts'
$outDir = Join-Path $PSScriptRoot 'executables'

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Error 'bun is required to compile the sidecar. Install from https://bun.sh'
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$outExe = if ($IsWindows -or $env:OS -eq 'Windows_NT') {
  Join-Path $outDir 'momo-gui.exe'
} else {
  Join-Path $outDir 'momo-gui'
}

Write-Host "Compiling sidecar -> $outExe"
bun build --compile $entry --outfile $outExe
if ($LASTEXITCODE -ne 0) { Write-Error 'bun build --compile failed' }

Write-Host "Done. $([math]::Round((Get-Item $outExe).Length / 1MB, 1)) MB"
