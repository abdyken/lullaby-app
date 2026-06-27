#!/usr/bin/env bash
set -euo pipefail

# Readiness check for the onboarding autopilot runner.
# This script validates setup only. It does not start Claude.

STATUS_FILE="docs/ONBOARDING_AGENT_STATUS.md"
ROADMAP_FILE="docs/onboarding-roadmap.md"
PROMPT_FILE=".claude/prompts/onboarding-autopilot-step.md"
RUNNER_FILE="scripts/claude-onboarding-autopilot.sh"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$repo_root" ] || die "Must be run inside the git repository"
cd "$repo_root"

[ -f "$RUNNER_FILE" ] || die "Missing runner: $RUNNER_FILE"
[ -f "$PROMPT_FILE" ] || die "Missing prompt: $PROMPT_FILE"
[ -f "$STATUS_FILE" ] || die "Missing status file: $STATUS_FILE"
[ -f "$ROADMAP_FILE" ] || die "Missing roadmap: $ROADMAP_FILE"
[ -f "package.json" ] || die "Missing package.json"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "Working tree is dirty"
fi

branch_pattern="$(awk -F': *' '$1 == "EXPECTED_BRANCH_PATTERN" { print substr($0, index($0, $2)); exit }' "$STATUS_FILE")"
[ -n "$branch_pattern" ] || branch_pattern="feat/onboarding-*"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
case "$current_branch" in
  $branch_pattern) ;;
  *) die "Current branch '$current_branch' does not match '$branch_pattern'" ;;
esac

node -e "const s=require('./package.json').scripts||{}; for (const k of ['lint','check:local-interactions']) { if (!s[k]) { console.error('missing script', k); process.exit(1); } }"

grep -q '^AUTOPILOT_STATUS:' "$STATUS_FILE" || die "Status file lacks AUTOPILOT_STATUS"
grep -q '^CURRENT_SLICE_ID:' "$STATUS_FILE" || die "Status file lacks CURRENT_SLICE_ID"
grep -q '^PHASE_1B_ENABLED:' "$STATUS_FILE" || die "Status file lacks PHASE_1B_ENABLED"

runner_status="$(awk -F= '$1 == "STATUS_FILE" { gsub(/"/, "", $2); print $2; exit }' "$RUNNER_FILE")"
runner_prompt="$(awk -F= '$1 == "PROMPT_FILE" { gsub(/"/, "", $2); print $2; exit }' "$RUNNER_FILE")"
[ "$runner_status" = "$STATUS_FILE" ] || die "Runner is not using $STATUS_FILE"
[ "$runner_prompt" = "$PROMPT_FILE" ] || die "Runner is not using $PROMPT_FILE"

echo "Onboarding autopilot setup is ready."
