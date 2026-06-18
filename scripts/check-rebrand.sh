#!/usr/bin/env bash
set -euo pipefail

echo "Checking for opencode brand leakage..."

# Check for OPENCODE_ env prefix (excluding intentionally kept references)
echo "Checking for OPENCODE_ env prefix..."
ENV_HITS=$(grep -rn "OPENCODE_" \
  packages/opencode/src packages/opencode/bin packages/app/src script packages/core/src \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.jsonc" --include="*.mjs" \
  | grep -viE "node_modules|models\.dev|UPSTREAM_OK|MOMO_DISABLE_OPENCODE" || true)

if [ -n "$ENV_HITS" ]; then
  echo "Found OPENCODE_ env prefix leakage:"
  echo "$ENV_HITS"
  exit 1
fi

# Check for @opencode-ai/ package references
echo "Checking for @opencode-ai/ package references..."
PKG_HITS=$(grep -rn "@opencode-ai/" \
  packages/opencode/src packages/opencode/bin packages/app/src script packages/core/src \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.jsonc" --include="*.mjs" \
  | grep -viE "node_modules|UPSTREAM_OK" || true)

if [ -n "$PKG_HITS" ]; then
  echo "Found @opencode-ai/ package reference leakage:"
  echo "$PKG_HITS"
  exit 1
fi

# Check for opencode binary references (excluding comments with UPSTREAM_OK)
echo "Checking for opencode binary leakage..."
BIN_HITS=$(grep -rn '"opencode"' \
  packages/opencode/bin \
  --include="*.ts" --include="*.mjs" --include="*.json" \
  | grep -viE "UPSTREAM_OK|node_modules" || true)

if [ -n "$BIN_HITS" ]; then
  echo "Found opencode binary leakage:"
  echo "$BIN_HITS"
  exit 1
fi

# Check for opencode.ai domain in non-exemption contexts
echo "Checking for opencode.ai domain leakage..."
DOMAIN_HITS=$(grep -rn "opencode\.ai" \
  packages/opencode/src packages/opencode/bin packages/app/src script install \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.jsonc" --include="*.mjs" \
  | grep -viE "UPSTREAM_OK|node_modules|changelog|comment" || true)

if [ -n "$DOMAIN_HITS" ]; then
  echo "Found opencode.ai domain leakage:"
  echo "$DOMAIN_HITS"
  exit 1
fi

echo "Rebrand check passed -- no opencode leakage detected"
