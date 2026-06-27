#!/usr/bin/env bash
set -euo pipefail

# Onboarding-specific Claude autopilot runner.
#
# Safety shape:
# - Uses docs/ONBOARDING_AGENT_STATUS.md, never the old logging status file.
# - Starts a fresh `claude -p` session for each slice.
# - Requires a clean onboarding branch before it starts.
# - Stops after any failure, missing commit, dirty worktree, or out-of-scope diff.
# - Never pushes, installs packages, runs native builds, or touches destructive git.

STATUS_FILE="docs/ONBOARDING_AGENT_STATUS.md"
ROADMAP_FILE="docs/onboarding-roadmap.md"
PROMPT_FILE=".claude/prompts/onboarding-autopilot-step.md"
LOG_FILE=".claude/onboarding-autopilot.log"

CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
CLAUDE_EFFORT="${CLAUDE_EFFORT:-max}"
MAX_SESSIONS="${MAX_SESSIONS:-1}"
MAX_CHANGED_FILES="${MAX_CHANGED_FILES:-18}"

DRY_RUN=0
STOP_AFTER_SUCCESS=0
ALLOW_BRANCH_OVERRIDE=0
BRANCH_PATTERN_OVERRIDE=""

usage() {
  cat <<'USAGE'
Usage: bash scripts/claude-onboarding-autopilot.sh [options]

Options:
  --dry-run                 Print the exact Claude command and rendered prompt.
  --max-sessions N          Run at most N fresh Claude sessions. Default: 1.
  --stop-after-success      Exit after the first successful committed slice.
  --allow-branch            Bypass onboarding branch-pattern enforcement.
  --branch-pattern PATTERN  Override the status-file branch pattern.
  --help                    Show this help.

Environment:
  CLAUDE_MODEL              Claude model passed to the CLI. Default: opus.
  CLAUDE_EFFORT             Claude effort passed to the CLI. Default: max.
  MAX_CHANGED_FILES         Max committed file count per slice. Default: 18.
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

log() {
  printf '%s\n' "$*"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --max-sessions)
      [ "${2:-}" ] || die "--max-sessions requires a number"
      MAX_SESSIONS="$2"
      shift 2
      ;;
    --stop-after-success)
      STOP_AFTER_SUCCESS=1
      shift
      ;;
    --allow-branch)
      ALLOW_BRANCH_OVERRIDE=1
      shift
      ;;
    --branch-pattern)
      [ "${2:-}" ] || die "--branch-pattern requires a shell glob"
      BRANCH_PATTERN_OVERRIDE="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

case "$MAX_SESSIONS" in
  ''|*[!0-9]*) die "--max-sessions must be a positive integer" ;;
esac
[ "$MAX_SESSIONS" -ge 1 ] || die "--max-sessions must be at least 1"

case "$MAX_CHANGED_FILES" in
  ''|*[!0-9]*) die "MAX_CHANGED_FILES must be a positive integer" ;;
esac
[ "$MAX_CHANGED_FILES" -ge 1 ] || die "MAX_CHANGED_FILES must be at least 1"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$repo_root" ] || die "Must be run inside the git repository"
cd "$repo_root"

[ -f "$ROADMAP_FILE" ] || die "Missing roadmap: $ROADMAP_FILE"
[ -f "$STATUS_FILE" ] || die "Missing status file: $STATUS_FILE"
[ -f "$PROMPT_FILE" ] || die "Missing prompt file: $PROMPT_FILE"
[ -f "package.json" ] || die "Missing package.json; run from repo root"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "Working tree is dirty before starting. Commit/stash first."
fi

status_value() {
  local key="$1"
  awk -F': *' -v key="$key" '$1 == key { print substr($0, index($0, $2)); exit }' "$STATUS_FILE"
}

autopilot_status() {
  status_value "AUTOPILOT_STATUS"
}

branch_pattern_from_status() {
  status_value "EXPECTED_BRANCH_PATTERN"
}

status_is_terminal() {
  local status="$1"
  case "$status" in
    DONE|BLOCKED) return 0 ;;
    *) return 1 ;;
  esac
}

current_branch="$(git rev-parse --abbrev-ref HEAD)"
branch_pattern="${BRANCH_PATTERN_OVERRIDE:-$(branch_pattern_from_status)}"
[ -n "$branch_pattern" ] || branch_pattern="feat/onboarding-*"

if [ "$ALLOW_BRANCH_OVERRIDE" -ne 1 ]; then
  case "$current_branch" in
    $branch_pattern) ;;
    *)
      die "Current branch '$current_branch' does not match '$branch_pattern'. Use --allow-branch only for intentional local testing."
      ;;
  esac
fi

node -e "const s=require('./package.json').scripts||{}; for (const k of ['lint','check:local-interactions']) if (!s[k]) process.exit(1)" \
  || die "package.json must define lint and check:local-interactions scripts"

case "$STATUS_FILE" in
  *LULLABY_LOGGING_AGENT_STATUS*) die "Onboarding runner is pointed at the old logging status file" ;;
esac
case "$PROMPT_FILE" in
  *lullaby-autopilot-step.md*) die "Onboarding runner is pointed at the old logging prompt" ;;
esac

mkdir -p ".claude"

render_prompt() {
  local status current_slice_id current_slice_name next_slice_id phase_1b_enabled
  status="$(autopilot_status)"
  current_slice_id="$(status_value "CURRENT_SLICE_ID")"
  current_slice_name="$(status_value "CURRENT_SLICE_NAME")"
  next_slice_id="$(status_value "NEXT_SLICE_ID")"
  phase_1b_enabled="$(status_value "PHASE_1B_ENABLED")"

  cat "$PROMPT_FILE"
  cat <<EOF

## Runner Runtime Context

The onboarding runner selected exactly one slice for this fresh Claude session.

- Status file: \`$STATUS_FILE\`
- Roadmap file: \`$ROADMAP_FILE\`
- Current git branch: \`$current_branch\`
- AUTOPILOT_STATUS: \`$status\`
- CURRENT_SLICE_ID: \`$current_slice_id\`
- CURRENT_SLICE_NAME: \`$current_slice_name\`
- NEXT_SLICE_ID: \`$next_slice_id\`
- PHASE_1B_ENABLED: \`$phase_1b_enabled\`

Implement only \`$current_slice_id\` / \`$current_slice_name\`.
If this context is empty, inconsistent, or says DONE/BLOCKED, stop and summarize.
EOF
}

print_dry_run() {
  local prompt_text
  prompt_text="$(render_prompt)"

  log "Dry run: no Claude session will be started."
  log
  log "Command:"
  printf 'claude -p --model %q --effort %q --permission-mode auto --output-format text %q\n' \
    "$CLAUDE_MODEL" "$CLAUDE_EFFORT" "$prompt_text"
  log
  log "Rendered prompt:"
  log "----- BEGIN PROMPT -----"
  printf '%s\n' "$prompt_text"
  log "----- END PROMPT -----"
}

is_safe_path() {
  case "$1" in
    docs/ONBOARDING_AGENT_STATUS.md) return 0 ;;
    scripts/check-local-interactions.ts) return 0 ;;
    src/components/onboarding/*) return 0 ;;
    src/components/auth/*) return 0 ;;
    src/components/BabyHeader.tsx) return 0 ;;
    src/components/TonightStatus.tsx) return 0 ;;
    src/components/QuickLogRow.tsx) return 0 ;;
    src/components/HandoffCard.tsx) return 0 ;;
    src/components/FirstLogCoach.tsx) return 0 ;;
    src/state/AuthProvider.tsx) return 0 ;;
    src/data/*) return 0 ;;
    src/app/\(tabs\)/index.tsx) return 0 ;;
    src/app/\(tabs\)/log.tsx) return 0 ;;
    src/features/logging/state/LoggingProvider.tsx) return 0 ;;
    *) return 1 ;;
  esac
}

check_diff_scope() {
  local before="$1"
  local after="$2"
  local changed_count=0
  local file
  local unsafe=0
  local changed_files

  changed_files="$(git diff --name-only "$before..$after")"
  if [ -z "$changed_files" ]; then
    die "Claude created a commit, but no changed files were detected"
  fi

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    changed_count=$((changed_count + 1))
    if ! is_safe_path "$file"; then
      echo "Out-of-scope changed file: $file" >&2
      unsafe=1
    fi
  done <<EOF
$changed_files
EOF

  if [ "$changed_count" -gt "$MAX_CHANGED_FILES" ]; then
    die "Changed file count $changed_count exceeds MAX_CHANGED_FILES=$MAX_CHANGED_FILES"
  fi

  [ "$unsafe" -eq 0 ] || die "Committed diff exceeded onboarding safe scope"
}

run_checks() {
  log "Running post-session checks..."
  npx tsc --noEmit
  npm run check:local-interactions
  npm run lint
}

status="$(autopilot_status)"
[ -n "$status" ] || die "Missing AUTOPILOT_STATUS in $STATUS_FILE"
if status_is_terminal "$status"; then
  log "Onboarding autopilot status is $status. Nothing to do."
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  print_dry_run
  exit 0
fi

sessions_completed=0
last_head="$(git rev-parse HEAD)"

while [ "$sessions_completed" -lt "$MAX_SESSIONS" ]; do
  status="$(autopilot_status)"
  if status_is_terminal "$status"; then
    log "Onboarding autopilot status is $status. Stopping."
    break
  fi

  current_slice_id="$(status_value "CURRENT_SLICE_ID")"
  current_slice_name="$(status_value "CURRENT_SLICE_NAME")"
  [ -n "$current_slice_id" ] || die "Missing CURRENT_SLICE_ID in $STATUS_FILE"

  session_number=$((sessions_completed + 1))
  before_head="$(git rev-parse HEAD)"
  session_log=".claude/onboarding-autopilot-session-$(date +%Y%m%d-%H%M%S)-${session_number}.log"
  prompt_text="$(render_prompt)"

  {
    echo
    echo "===== ONBOARDING SESSION $session_number / $MAX_SESSIONS ====="
    echo "Time: $(date)"
    echo "Branch: $current_branch"
    echo "Slice: $current_slice_id - $current_slice_name"
    echo "Before HEAD: $before_head"
  } | tee -a "$LOG_FILE"

  set +e
  claude -p \
    --model "$CLAUDE_MODEL" \
    --effort "$CLAUDE_EFFORT" \
    --permission-mode auto \
    --output-format text \
    "$prompt_text" 2>&1 | tee "$session_log" | tee -a "$LOG_FILE"
  claude_exit=${PIPESTATUS[0]}
  set -e

  after_head="$(git rev-parse HEAD)"
  {
    echo "Claude exit code: $claude_exit"
    echo "After HEAD:  $after_head"
  } | tee -a "$LOG_FILE"

  [ "$claude_exit" -eq 0 ] || die "Claude failed in session $session_number; see $session_log"
  [ "$after_head" != "$before_head" ] || die "Claude made no commit for slice $current_slice_id"

  check_diff_scope "$before_head" "$after_head"
  run_checks

  if [ -n "$(git status --porcelain)" ]; then
    git status --short
    die "Working tree is dirty after session $session_number"
  fi

  sessions_completed=$((sessions_completed + 1))
  last_head="$after_head"

  log "Session $session_number succeeded for $current_slice_id."
  if [ "$STOP_AFTER_SUCCESS" -eq 1 ]; then
    log "--stop-after-success set; stopping after one successful phase."
    break
  fi
done

log
log "Onboarding autopilot final summary"
log "- Branch: $current_branch"
log "- Sessions completed: $sessions_completed"
log "- Final HEAD: $last_head"
log "- Status: $(autopilot_status)"
log "- Log: $LOG_FILE"
log "- No push was attempted by this runner."
