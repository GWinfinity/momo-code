# momo Code — Windows Installer (PowerShell)
#
# Usage:
#   irm https://momozi.cc/install.ps1 | iex
#   # or
#   .\install.ps1
#
# What it does:
#   1. Checks Node.js >= 20
#   2. Clones or updates momo-code into ~/.momo/lib/
#   3. Runs npm install + npm run build
#   4. Creates a wrapper at ~/.momo/bin/momo.cmd
#   5. Adds ~/.momo/bin to user PATH
#   6. Runs momo /setup for first-time API key configuration

param(
    [string]$Version = "",
    [switch]$NoModifyPath,
    [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"

# ── Colors ───────────────────────────────────────────────────────────
$MAGENTA = "`e[95m"
$CYAN    = "`e[36m"
$GREEN   = "`e[32m"
$YELLOW  = "`e[33m"
$RED     = "`e[31m"
$DIM     = "`e[2m"
$BOLD    = "`e[1m"
$RESET   = "`e[0m"

$APP = "momo"
$REPO = "https://github.com/momozi1996/momo-code.git"
$INSTALL_DIR = "$env:USERPROFILE\.momo"
$BIN_DIR = "$INSTALL_DIR\bin"
$LIB_DIR = "$INSTALL_DIR\lib\momo-code"

Write-Host ""
Write-Host "${MAGENTA}${BOLD}  MOMO CODE${RESET} — Windows Installer"
Write-Host "${DIM}  AI coding agent that evolves with you${RESET}"
Write-Host ""

# ── Check Node.js ────────────────────────────────────────────────────
Write-Host "${DIM}  Checking Node.js...${RESET}"
try {
    $nodeVersion = & node -v 2>$null
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 20) {
        Write-Host "${RED}  Node.js $nodeVersion found, but >= 20 is required.${RESET}"
        Write-Host "  Download: https://nodejs.org/"
        exit 1
    }
    Write-Host "${GREEN}  Node.js $nodeVersion OK${RESET}"
} catch {
    Write-Host "${RED}  Node.js not found. Please install Node.js >= 20:${RESET}"
    Write-Host "  https://nodejs.org/"
    exit 1
}

# ── Check npm ────────────────────────────────────────────────────────
try {
    $npmVersion = & npm -v 2>$null
    Write-Host "${GREEN}  npm $npmVersion OK${RESET}"
} catch {
    Write-Host "${RED}  npm not found. It should come with Node.js.${RESET}"
    exit 1
}

Write-Host ""

# ── Clone or update repo ─────────────────────────────────────────────
if (Test-Path "$LIB_DIR\.git") {
    Write-Host "${DIM}  Updating existing installation...${RESET}"
    Push-Location $LIB_DIR
    & git pull --quiet 2>$null
    Pop-Location
} else {
    Write-Host "${DIM}  Cloning momo-code...${RESET}"
    New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
    & git clone --quiet $REPO $LIB_DIR 2>$null
}

if (-not (Test-Path "$LIB_DIR\packages\opencode")) {
    Write-Host "${RED}  Clone failed. Check your internet connection.${RESET}"
    exit 1
}

# ── Install dependencies + build ─────────────────────────────────────
Write-Host "${DIM}  Installing dependencies...${RESET}"
Push-Location "$LIB_DIR\packages\opencode"
& npm install --no-fund --no-audit --quiet 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "${RED}  npm install failed.${RESET}"
    Pop-Location
    exit 1
}

Write-Host "${DIM}  Building...${RESET}"
& npm run build 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "${RED}  Build failed. Try running manually:${RESET}"
    Write-Host "  cd $LIB_DIR\packages\opencode"
    Write-Host "  npm install"
    Write-Host "  npm run build"
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "${GREEN}  Build complete.${RESET}"

# ── Create wrapper script ────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BIN_DIR | Out-Null

$wrapperContent = @"
@echo off
node "$LIB_DIR\packages\opencode\bin\momo" %*
"@
Set-Content -Path "$BIN_DIR\momo.cmd" -Value $wrapperContent -Encoding ASCII

# Also create a .ps1 wrapper for PowerShell
$psWrapperContent = @"
#!/usr/bin/env pwsh
& node "$LIB_DIR\packages\opencode\bin\momo" @args
"@
Set-Content -Path "$BIN_DIR\momo.ps1" -Value $psWrapperContent -Encoding ASCII

Write-Host "${GREEN}  Wrapper created at:${RESET} $BIN_DIR\momo.cmd"

# ── Add to PATH ──────────────────────────────────────────────────────
if (-not $NoModifyPath) {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$BIN_DIR*") {
        $newPath = "$BIN_DIR;$currentPath"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$BIN_DIR;$env:Path"
        Write-Host "${GREEN}  Added to PATH:${RESET} $BIN_DIR"
        Write-Host "${DIM}  (Restart your terminal for PATH changes to take effect)${RESET}"
    } else {
        Write-Host "${DIM}  $BIN_DIR is already in PATH.${RESET}"
    }
}

Write-Host ""

# ── Verify installation ─────────────────────────────────────────────
Write-Host "${GREEN}  Installation complete!${RESET}"
Write-Host ""
Write-Host "${BOLD}  Verify:${RESET}"
Write-Host "    ${CYAN}momo --version${RESET}"
Write-Host ""

# ── Run setup wizard ─────────────────────────────────────────────────
if (-not $SkipSetup) {
    $hasKey = $env:MOMO_API_KEY -or $env:MOMO_DEEPSEEK_API_KEY -or $env:MOMO_OPENAI_API_KEY -or $env:MOMO_ANTHROPIC_API_KEY
    $configFile = "$env:USERPROFILE\.momo\momo.jsonc"

    if (-not $hasKey -and -not (Test-Path $configFile)) {
        Write-Host "${YELLOW}  No API key detected.${RESET}"
        Write-Host "${BOLD}  Launching setup wizard...${RESET}"
        Write-Host ""
        & node "$LIB_DIR\packages\opencode\bin\momo" /setup
    } else {
        Write-Host "${DIM}  API key already configured. Skipping setup wizard.${RESET}"
        Write-Host "  To reconfigure: ${CYAN}momo /setup${RESET}"
    }
}

Write-Host ""
Write-Host "${DIM}  Docs: https://momozi.cc${RESET}"
Write-Host ""
