#!/usr/bin/env bash
#
# claude-night-apple-review.sh — overnight, resumable Apple-review fixer for Lullaby.
#
# Works through .claude-night/tasks.apple-review.tsv one blocker at a time:
#   - one git branch per task (fix/apple-p0-XX-slug), branched from release/apple-review-fixes
#   - one fresh Claude Code session per task (named, resumable by real session_id)
#   - portable timeout + usage-limit pause/sleep/resume
#   - validation (lint / tsc / smoke / git diff --check) with a bounded fix loop
#   - per-task status JSON reports, wrapper-owned commits and --no-ff merges
#
# SAFETY: this script never pushes, never force-pushes, never deploys, never runs
# `eas submit`, and never runs destructive git commands (reset --hard, clean -fd,
# checkout -- ., restore .). All branches stay local. It never reads or prints .env.
#
# Rerunning the script is safe: it resumes the current task and session from
# .claude-night/state/.
#
# Env knobs (all optional):
#   MODEL=fable  EFFORT=high  PERMISSION_MODE=auto
#   MAX_SECONDS=17100          # per-Claude-run timeout (4h45m)
#   RESET_SLEEP_SECONDS=19800  # sleep after timeout/usage-limit (5h30m)
#   VALIDATION_RETRIES=2       # validation fix-loop attempts per task
#   MAX_PAUSE_CYCLES=6         # safety cap on pause/sleep/resume cycles per task
#
set -u -o pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MODEL="${MODEL:-fable}"
EFFORT="${EFFORT:-high}"
PERMISSION_MODE="${PERMISSION_MODE:-auto}"
MAX_SECONDS="${MAX_SECONDS:-17100}"
RESET_SLEEP_SECONDS="${RESET_SLEEP_SECONDS:-19800}"
VALIDATION_RETRIES="${VALIDATION_RETRIES:-2}"
MAX_PAUSE_CYCLES="${MAX_PAUSE_CYCLES:-6}"

INTEGRATION_BRANCH="release/apple-review-fixes"
NIGHT_DIR=".claude-night"
TASKS_FILE="$NIGHT_DIR/tasks.apple-review.tsv"
STATE_DIR="$NIGHT_DIR/state"
LOGS_DIR="$NIGHT_DIR/logs"
REPORTS_DIR="$NIGHT_DIR/reports"
TMP_DIR="$NIGHT_DIR/tmp"
RUN_ENV="$STATE_DIR/run.env"
CURRENT_TASK_FILE="$STATE_DIR/current_task"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }
hr() { printf -- '------------------------------------------------------------------\n'; }
die() { hr; log "FATAL: $*"; hr; exit 1; }

# ---------------------------------------------------------------------------
# Environment / capability checks
# ---------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git not found"
command -v claude >/dev/null 2>&1 || die "claude CLI not found in PATH"
command -v npm >/dev/null 2>&1 || die "npm not found"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$REPO_ROOT" || die "cannot cd to repo root"

[ -f "$TASKS_FILE" ] || die "task manifest missing: $TASKS_FILE"

mkdir -p "$STATE_DIR" "$LOGS_DIR" "$REPORTS_DIR" "$TMP_DIR"

# JSON field reader: jq preferred, then python3, then node. Prints "" if absent.
json_get() { # json_get <file> <key>
  local f="$1" k="$2"
  [ -s "$f" ] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg k "$k" 'if type=="object" and has($k) then (.[$k] | if type=="string" then . else tojson end) else empty end' "$f" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$f" "$k" 2>/dev/null <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    v = d.get(sys.argv[2])
    if v is not None:
        print(v if isinstance(v, str) else json.dumps(v))
except Exception:
    pass
PY
  elif command -v node >/dev/null 2>&1; then
    node -e 'try{const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const v=d[process.argv[2]];if(v!==undefined&&v!==null)console.log(typeof v==="string"?v:JSON.stringify(v))}catch(e){}' "$f" "$k" 2>/dev/null
  fi
}

has_npm_script() { # has_npm_script <name>
  node -e 'const s=(require("./package.json").scripts)||{};process.exit(s[process.argv[1]]?0:1)' "$1" 2>/dev/null
}

# Detect optional claude flags so the script degrades gracefully across CLI versions.
CLAUDE_HELP="$(claude --help 2>&1 || true)"
SUPPORTS_NAME=0;   printf '%s' "$CLAUDE_HELP" | grep -q -- '--name'   && SUPPORTS_NAME=1
SUPPORTS_EFFORT=0; printf '%s' "$CLAUDE_HELP" | grep -q -- '--effort' && SUPPORTS_EFFORT=1
printf '%s' "$CLAUDE_HELP" | grep -q -- '--resume' || die "this claude CLI does not support --resume; cannot run a resumable overnight workflow"

# Portable timeout: GNU timeout / gtimeout if usable, else pure-bash fallback.
TIMEOUT_BIN=""
for cand in gtimeout timeout; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" --foreground 1 true >/dev/null 2>&1; then
    TIMEOUT_BIN="$cand"
    break
  fi
done

portable_timeout() { # portable_timeout <seconds> <cmd...>  (returns 124 on timeout)
  local secs="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" --foreground "$secs" "$@"
    return $?
  fi
  "$@" &
  local cmd_pid=$!
  ( sleep "$secs"; kill -TERM "$cmd_pid" 2>/dev/null ) &
  local sleeper_pid=$!
  local rc=0
  wait "$cmd_pid" 2>/dev/null || rc=$?
  if kill -0 "$sleeper_pid" 2>/dev/null; then
    kill "$sleeper_pid" 2>/dev/null
    wait "$sleeper_pid" 2>/dev/null
  else
    rc=124  # sleeper already fired -> the command was killed by the timeout
  fi
  return "$rc"
}

HAS_LINT=0;  has_npm_script lint && HAS_LINT=1
HAS_SMOKE=0; has_npm_script check:local-interactions && HAS_SMOKE=1

# ---------------------------------------------------------------------------
# Git safety helpers (never destructive)
# ---------------------------------------------------------------------------
git_is_clean() { [ -z "$(git status --porcelain)" ]; }

current_branch() { git branch --show-current; }

branch_exists() { git rev-parse --verify --quiet "refs/heads/$1" >/dev/null; }

require_clean_tree_or_die() {
  if ! git_is_clean; then
    hr
    log "The git working tree is DIRTY and no in-progress task explains it."
    log "This script refuses to touch anything until you decide what to do."
    echo
    git status --short
    echo
    log "Options:"
    log "  - commit your work:   git add -A && git commit -m 'wip'"
    log "  - or stash it:        git stash push -u -m 'pre-night-run'"
    log "Then rerun this script. Nothing was modified."
    hr
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Task state (KEY='VALUE' files under .claude-night/state/, sourced on load)
# ---------------------------------------------------------------------------
T_STATUS=""; T_BRANCH=""; T_SESSION_NAME=""; T_SESSION_ID=""
T_PAUSE_COUNT=0; T_RUN_RETRIES=0; T_VAL_ATTEMPTS=0; T_LAST_LOG=""

state_file_for() { printf '%s/%s.state' "$STATE_DIR" "$1"; }

load_task_state() { # load_task_state <task_key>
  T_STATUS="pending"; T_BRANCH=""; T_SESSION_NAME=""; T_SESSION_ID=""
  T_PAUSE_COUNT=0; T_RUN_RETRIES=0; T_VAL_ATTEMPTS=0; T_LAST_LOG=""
  local f; f="$(state_file_for "$1")"
  # shellcheck disable=SC1090
  [ -f "$f" ] && . "$f"
}

save_task_state() { # save_task_state <task_key>
  local f; f="$(state_file_for "$1")"
  local resume_ref="${T_SESSION_ID:-$T_SESSION_NAME}"
  cat > "$f" <<EOF
T_STATUS='$T_STATUS'
T_BRANCH='$T_BRANCH'
T_SESSION_NAME='$T_SESSION_NAME'
T_SESSION_ID='$T_SESSION_ID'
T_PAUSE_COUNT=$T_PAUSE_COUNT
T_RUN_RETRIES=$T_RUN_RETRIES
T_VAL_ATTEMPTS=$T_VAL_ATTEMPTS
T_LAST_LOG='$T_LAST_LOG'
# manual resume (informational):
#   claude -p "Continue this task." --resume "$resume_ref"
# updated: $(ts)
EOF
  printf '%s\n' "$1" > "$CURRENT_TASK_FILE"
}

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
build_task_prompt() { # build_task_prompt <order> <slug> <title> <goal> <branch>
  local order="$1" slug="$2" title="$3" goal="$4" branch="$5"
  cat <<EOF
You are Claude Code working on EXACTLY ONE overnight Apple-review blocker for the Lullaby app (React Native / Expo, baby-care tracker). The release shape is "Shape A": a local-only v1.

TASK ${order} — ${title}
GOAL: ${goal}

You are already on the dedicated git branch '${branch}'. An external wrapper script owns all git operations.

STRICT RULES:
- Work only on this one blocker. Inspect the actual code before editing anything; do not guess.
- Make minimal, shippable changes. No rewrites, no new architecture, no fifth tab.
- Keep Lullaby local-only v1: do NOT build Supabase sync, realtime caregiver sharing, household/entitlement backend, multiple babies, push notifications, or local-to-account migration.
- Preserve the calm/premium UI style: reuse theme tokens from src/theme and existing component/sheet patterns.
- Do not add new dependencies unless absolutely necessary.
- Do NOT commit, push, merge, rebase, tag, or switch branches — the wrapper does all git. Do not run destructive commands (git reset --hard, git clean, rm -rf on project files).
- Never push, deploy, run eas submit, enable a live paywall by default, or change the bundle identifier.
- Never read, print, or modify .env files (project permissions deny reading .env*, including via Bash). If this task requires updating .env.example, recreate the whole file using the Write tool (rm + Write pattern) and document variables with placeholder values only — never real secrets.
- Before declaring the task done, verify your work: run 'npx tsc --noEmit' (and 'npm run lint' where relevant) and fix anything you broke. The wrapper will also validate afterwards.

REQUIRED FINAL ARTIFACT — you MUST create this exact file before finishing:
  .claude-night/reports/${order}-${slug}.status.json
containing valid JSON of this shape:
{
  "task": "${order}-${slug}",
  "status": "done",
  "summary": "one paragraph of what you changed and why",
  "files_changed": ["path/one.tsx", "path/two.ts"],
  "validation_notes": "what you ran and the results",
  "manual_followups": ["anything a human must do later"],
  "apple_review_risk_remaining": ["remaining risks for this area, if any"]
}
Set "status" to "done" only if the goal is genuinely met; use "partial" for real-but-incomplete progress and "blocked" if you cannot make safe progress (explain why in summary and manual_followups).
EOF
}

build_continue_prompt() { # build_continue_prompt <order> <slug> <title>
  local order="$1" slug="$2" title="$3"
  cat <<EOF
Your previous run on TASK ${order} — ${title} was interrupted (timeout, usage limit, or a wrapper restart). Continue exactly where you left off on this same task, following all the original rules (one blocker only; minimal shippable changes; local-only Shape A; no git operations; no new backend; never touch .env).

If the task is already complete, do not redo work: just make sure the required status file exists and is accurate:
  .claude-night/reports/${order}-${slug}.status.json
then stop.
EOF
}

build_validation_fix_prompt() { # build_validation_fix_prompt <order> <slug> <title> <valfile>
  local order="$1" slug="$2" title="$3" valfile="$4"
  cat <<EOF
Validation FAILED for TASK ${order} — ${title}. Fix ONLY these validation failures for this task. Do not expand scope, do not refactor unrelated code, do not run git commands. After fixing, rerun the failing checks yourself to confirm, and update .claude-night/reports/${order}-${slug}.status.json if its contents changed.

Validation output (tail):
--------------------------------------------------------------------
$(tail -n 150 "$valfile" 2>/dev/null)
--------------------------------------------------------------------
EOF
}

build_status_json_prompt() { # build_status_json_prompt <order> <slug>
  local order="$1" slug="$2"
  cat <<EOF
You finished working but the required status report file is missing or invalid. Create it NOW, exactly at:
  .claude-night/reports/${order}-${slug}.status.json
Valid JSON with keys: task, status ("done"|"blocked"|"partial"), summary, files_changed, validation_notes, manual_followups, apple_review_risk_remaining. Reflect what you actually did in this session. Do nothing else.
EOF
}

# ---------------------------------------------------------------------------
# Claude runner
# ---------------------------------------------------------------------------
# run_claude_once <task_key> <mode:new|resume> <prompt_file> <attempt_tag>
# Captures stdout JSON + stderr into logs; updates T_SESSION_ID on success.
# Return codes: 0 = run completed; 124 = timeout; 90 = rate/usage-limited; other = error.
run_claude_once() {
  local task_key="$1" mode="$2" prompt_file="$3" tag="$4"
  local out="$LOGS_DIR/${task_key}.${tag}.out.json"
  local err="$LOGS_DIR/${task_key}.${tag}.err.log"
  T_LAST_LOG="$out"

  local -a cmd
  cmd=(claude -p "$(cat "$prompt_file")" --model "$MODEL" --permission-mode "$PERMISSION_MODE" --output-format json)
  [ "$SUPPORTS_EFFORT" = 1 ] && cmd+=(--effort "$EFFORT")

  if [ "$mode" = "new" ]; then
    [ "$SUPPORTS_NAME" = 1 ] && cmd+=(--name "$T_SESSION_NAME")
  else
    # Resume by real session id when we have it; fall back to session name.
    cmd+=(--resume "${T_SESSION_ID:-$T_SESSION_NAME}")
  fi

  log "claude run: task=$task_key mode=$mode tag=$tag model=$MODEL effort=$EFFORT (timeout ${MAX_SECONDS}s)"
  log "  log: $out"

  local rc=0
  portable_timeout "$MAX_SECONDS" "${cmd[@]}" < /dev/null > "$out" 2> "$err" || rc=$?

  # Capture the real session_id from the JSON result whenever it is present.
  local sid
  sid="$(json_get "$out" session_id)"
  if [ -n "$sid" ]; then
    T_SESSION_ID="$sid"
  fi

  if [ "$rc" -eq 124 ]; then
    log "  -> TIMEOUT after ${MAX_SECONDS}s"
    return 124
  fi

  # Rate/usage-limit detection across stdout + stderr.
  if grep -Eqi 'rate.?limit|usage.?limit|limit (reached|will reset|resets)|out of (usage|quota)|usage cap|too many requests|overloaded_error|status.?code.?429|credit balance is too low' "$out" "$err" 2>/dev/null; then
    log "  -> RATE/USAGE LIMIT detected"
    return 90
  fi

  local is_err subtype
  is_err="$(json_get "$out" is_error)"
  subtype="$(json_get "$out" subtype)"
  if [ "$rc" -ne 0 ] || [ "$is_err" = "true" ]; then
    log "  -> claude run failed (exit=$rc is_error=${is_err:-n/a} subtype=${subtype:-n/a}); stderr tail:"
    tail -n 10 "$err" 2>/dev/null | sed 's/^/       /'
    return 1
  fi

  log "  -> run completed (session_id=${T_SESSION_ID:-unknown})"
  return 0
}

# run_claude_until_complete <task_key> <order> <slug> <title> <mode> <prompt_file> <tag_prefix>
# Handles timeout + usage-limit pause/sleep/resume cycles and one plain-error retry.
# Returns 0 when a run finished normally; 1 when hard-failed.
run_claude_until_complete() {
  local task_key="$1" order="$2" slug="$3" title="$4" mode="$5" prompt_file="$6" tag_prefix="$7"
  local attempt=0

  while :; do
    attempt=$((attempt + 1))
    local rc=0
    run_claude_once "$task_key" "$mode" "$prompt_file" "${tag_prefix}${attempt}" || rc=$?

    case "$rc" in
      0)
        return 0
        ;;
      124|90)
        T_PAUSE_COUNT=$((T_PAUSE_COUNT + 1))
        T_STATUS="paused"
        save_task_state "$task_key"
        if [ "$T_PAUSE_COUNT" -gt "$MAX_PAUSE_CYCLES" ]; then
          log "pause cycle cap reached (${MAX_PAUSE_CYCLES}); marking task hard-failed for tonight"
          return 1
        fi
        hr
        log "PAUSED task $task_key (cycle $T_PAUSE_COUNT/$MAX_PAUSE_CYCLES)."
        log "  reason: $([ "$rc" -eq 124 ] && echo timeout || echo usage/rate limit)"
        log "  session: name=$T_SESSION_NAME id=${T_SESSION_ID:-<unknown>}"
        log "  branch:  $T_BRANCH   log: $T_LAST_LOG"
        log "  sleeping ${RESET_SLEEP_SECONDS}s before resuming the SAME session..."
        hr
        sleep "$RESET_SLEEP_SECONDS"
        build_continue_prompt "$order" "$slug" "$title" > "$prompt_file"
        mode="resume"
        T_STATUS="running"
        save_task_state "$task_key"
        ;;
      *)
        T_RUN_RETRIES=$((T_RUN_RETRIES + 1))
        save_task_state "$task_key"
        if [ "$T_RUN_RETRIES" -gt 1 ]; then
          log "claude run failed twice for $task_key; giving up on this task"
          return 1
        fi
        log "retrying task $task_key once by resuming the session..."
        build_continue_prompt "$order" "$slug" "$title" > "$prompt_file"
        mode="resume"
        sleep 30
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
run_validation() { # run_validation <outfile>  -> 0 pass / 1 fail
  local out="$1" ok=0
  : > "$out"

  if [ "$HAS_LINT" = 1 ]; then
    echo "===== npm run lint =====" >> "$out"
    npm run lint >> "$out" 2>&1 || { echo "[FAILED] npm run lint" >> "$out"; ok=1; }
  else
    echo "===== npm run lint: SKIPPED (no lint script) =====" >> "$out"
  fi

  echo "===== npx tsc --noEmit =====" >> "$out"
  npx tsc --noEmit >> "$out" 2>&1 || { echo "[FAILED] npx tsc --noEmit" >> "$out"; ok=1; }

  if [ "$HAS_SMOKE" = 1 ]; then
    echo "===== npm run check:local-interactions =====" >> "$out"
    npm run check:local-interactions >> "$out" 2>&1 || { echo "[FAILED] npm run check:local-interactions" >> "$out"; ok=1; }
  else
    echo "===== check:local-interactions: SKIPPED (no such script) =====" >> "$out"
  fi

  echo "===== git diff --check =====" >> "$out"
  git diff --check >> "$out" 2>&1 || { echo "[FAILED] git diff --check (whitespace/conflict markers)" >> "$out"; ok=1; }

  return "$ok"
}

# ---------------------------------------------------------------------------
# Status JSON handling
# ---------------------------------------------------------------------------
status_json_valid() { # status_json_valid <report_file> -> prints status on stdout if valid
  local f="$1" s
  [ -f "$f" ] || return 1
  s="$(json_get "$f" status)"
  case "$s" in
    done|blocked|partial) printf '%s' "$s"; return 0 ;;
    *) return 1 ;;
  esac
}

write_fallback_status_json() { # write_fallback_status_json <report_file> <task_key> <note>
  local f="$1" task_key="$2" note="$3"
  cat > "$f" <<EOF
{
  "task": "$task_key",
  "status": "partial",
  "summary": "WRAPPER-GENERATED: Claude did not produce a valid status JSON. $note",
  "files_changed": [],
  "validation_notes": "see $LOGS_DIR/${task_key}.*.log and the git diff on the task branch",
  "manual_followups": ["Review the task branch diff manually", "Decide whether to merge or drop this branch"],
  "apple_review_risk_remaining": ["Task outcome unverified - treat this blocker as still open"]
}
EOF
}

# ---------------------------------------------------------------------------
# Git orchestration
# ---------------------------------------------------------------------------
commit_task_changes() { # commit_task_changes <task_key> <status>
  local task_key="$1" status="$2"
  if git_is_clean; then
    log "no changes to commit for $task_key"
    return 0
  fi
  git add -A || die "git add failed on $(current_branch)"
  git commit -m "fix(apple-review): $task_key [$status]

Automated overnight Apple-review task via scripts/claude-night-apple-review.sh.
Status report: $REPORTS_DIR/$task_key.status.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    || die "git commit failed on $(current_branch)"
  log "committed changes for $task_key on $(current_branch)"
}

merge_task_branch() { # merge_task_branch <task_key> <branch>
  local task_key="$1" branch="$2"
  git checkout "$INTEGRATION_BRANCH" >/dev/null 2>&1 || die "cannot checkout $INTEGRATION_BRANCH"
  if ! git merge --no-ff "$branch" -m "merge: $branch into $INTEGRATION_BRANCH ($task_key)"; then
    hr
    log "MERGE CONFLICT while merging $branch into $INTEGRATION_BRANCH."
    log "The script has STOPPED. Nothing was force-resolved."
    echo
    log "Current branch: $(current_branch)"
    log "Conflicted files:"
    git diff --name-only --diff-filter=U | sed 's/^/    /'
    echo
    log "Resolve manually:"
    log "  1) edit the conflicted files"
    log "  2) git add <files>"
    log "  3) git commit          # completes the merge"
    log "  4) rerun: ./scripts/claude-night-apple-review.sh   # continues with the next task"
    log "Or abort the merge (safe):  git merge --abort"
    hr
    exit 1
  fi
  log "merged $branch into $INTEGRATION_BRANCH"
}

# ---------------------------------------------------------------------------
# Per-task driver
# ---------------------------------------------------------------------------
process_task() { # process_task <order> <slug> <cob> <title> <goal>
  local order="$1" slug="$2" cob="$3" title="$4" goal="$5"
  local task_key="${order}-${slug}"
  local branch="fix/apple-p0-${order}-${slug}"
  local report="$REPORTS_DIR/${task_key}.status.json"
  local prompt_file="$TMP_DIR/${task_key}.prompt.txt"

  load_task_state "$task_key"

  case "$T_STATUS" in
    done)
      log "task $task_key already done — skipping"
      return 0
      ;;
    blocked|partial)
      log "task $task_key previously ended as '$T_STATUS'"
      if [ "$cob" = "true" ]; then
        log "continue_on_blocked=true — moving on"
        return 0
      fi
      die "task $task_key is '$T_STATUS' and continue_on_blocked=false. Inspect $report and branch $branch, then either fix manually or mark the state file done."
      ;;
  esac

  hr
  log "TASK $task_key — $title"
  hr

  local mode="new"
  if [ "$T_STATUS" = "pending" ]; then
    # Fresh task: branch off the integration branch.
    git checkout "$INTEGRATION_BRANCH" >/dev/null 2>&1 || die "cannot checkout $INTEGRATION_BRANCH"
    require_clean_tree_or_die
    if branch_exists "$branch"; then
      log "reusing existing branch $branch"
      git checkout "$branch" >/dev/null 2>&1 || die "cannot checkout $branch"
    else
      git checkout -b "$branch" >/dev/null 2>&1 || die "cannot create branch $branch"
      log "created branch $branch from $INTEGRATION_BRANCH"
    fi
    T_BRANCH="$branch"
    T_SESSION_NAME="apple-review-${order}-${slug}"
    T_SESSION_ID=""
    T_STATUS="running"
    save_task_state "$task_key"
    build_task_prompt "$order" "$slug" "$title" "$goal" "$branch" > "$prompt_file"
    mode="new"
  else
    # Resuming an in-flight task (running/paused/validating after restart).
    log "resuming in-flight task $task_key (state=$T_STATUS, session=${T_SESSION_ID:-$T_SESSION_NAME})"
    if [ "$(current_branch)" != "$T_BRANCH" ]; then
      if git_is_clean; then
        git checkout "$T_BRANCH" >/dev/null 2>&1 || die "cannot checkout task branch $T_BRANCH"
      else
        die "working tree is dirty on '$(current_branch)' but task $task_key expects branch '$T_BRANCH'. Commit/stash manually, then rerun."
      fi
    fi
    build_continue_prompt "$order" "$slug" "$title" > "$prompt_file"
    mode="resume"
    T_STATUS="running"
    save_task_state "$task_key"
  fi

  # --- main Claude work loop (handles timeout / usage-limit internally) ---
  if ! run_claude_until_complete "$task_key" "$order" "$slug" "$title" "$mode" "$prompt_file" "work"; then
    log "task $task_key hard-failed during the Claude run"
    commit_task_changes "$task_key" "blocked"
    [ -f "$report" ] || write_fallback_status_json "$report" "$task_key" "The Claude run failed or hit the pause-cycle cap."
    T_STATUS="blocked"; save_task_state "$task_key"
    git checkout "$INTEGRATION_BRANCH" >/dev/null 2>&1 || true
    if [ "$cob" = "true" ]; then log "continue_on_blocked=true — moving on"; return 0; fi
    die "task $task_key blocked and continue_on_blocked=false"
  fi

  # --- validation + bounded fix loop ---
  T_STATUS="validating"; save_task_state "$task_key"
  local valfile="$LOGS_DIR/${task_key}.validation.log"
  local val_ok=1
  local i=0
  while :; do
    log "running validation for $task_key (attempt $((i + 1)))..."
    if run_validation "$valfile"; then
      val_ok=0
      log "validation PASSED for $task_key"
      break
    fi
    log "validation FAILED for $task_key — tail:"
    tail -n 12 "$valfile" | sed 's/^/       /'
    i=$((i + 1))
    T_VAL_ATTEMPTS="$i"; save_task_state "$task_key"
    if [ "$i" -gt "$VALIDATION_RETRIES" ]; then
      log "validation retries exhausted for $task_key"
      break
    fi
    build_validation_fix_prompt "$order" "$slug" "$title" "$valfile" > "$prompt_file"
    if ! run_claude_until_complete "$task_key" "$order" "$slug" "$title" "resume" "$prompt_file" "valfix${i}-"; then
      log "validation-fix Claude run failed for $task_key"
      break
    fi
  done

  # --- status JSON ---
  local task_status=""
  task_status="$(status_json_valid "$report")" || task_status=""
  if [ -z "$task_status" ]; then
    log "status JSON missing/invalid for $task_key — asking Claude once to produce it"
    build_status_json_prompt "$order" "$slug" > "$prompt_file"
    run_claude_until_complete "$task_key" "$order" "$slug" "$title" "resume" "$prompt_file" "statusjson" || true
    task_status="$(status_json_valid "$report")" || task_status=""
  fi
  if [ -z "$task_status" ]; then
    write_fallback_status_json "$report" "$task_key" "Asked once, still missing."
    task_status="partial"
  fi

  # Validation failure caps the status: never merge a red branch as "done".
  if [ "$val_ok" -ne 0 ] && [ "$task_status" = "done" ]; then
    log "Claude reported 'done' but validation is failing — downgrading to 'partial'"
    task_status="partial"
  fi

  # --- commit + merge / park ---
  commit_task_changes "$task_key" "$task_status"

  if [ "$task_status" = "done" ]; then
    merge_task_branch "$task_key" "$branch"
    T_STATUS="done"; save_task_state "$task_key"
    log "task $task_key DONE and merged"
    return 0
  fi

  T_STATUS="$task_status"; save_task_state "$task_key"
  git checkout "$INTEGRATION_BRANCH" >/dev/null 2>&1 || true
  hr
  log "task $task_key ended as '$task_status' — branch $branch left UNMERGED for manual review"
  log "report: $report"
  hr
  if [ "$cob" = "true" ]; then
    log "continue_on_blocked=true — moving on to the next task"
    return 0
  fi
  die "task $task_key is '$task_status' and continue_on_blocked=false — stopping as configured"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
trap 'echo; log "Interrupted. State is saved under $STATE_DIR — rerun this script to resume."; exit 130' INT TERM

hr
log "Lullaby overnight Apple-review fixer"
log "model=$MODEL effort=$EFFORT permission_mode=$PERMISSION_MODE"
log "timeout=${MAX_SECONDS}s sleep_on_limit=${RESET_SLEEP_SECONDS}s validation_retries=$VALIDATION_RETRIES"
log "timeout binary: ${TIMEOUT_BIN:-<bash fallback>} | jq: $(command -v jq >/dev/null 2>&1 && echo yes || echo no) | claude --name: $SUPPORTS_NAME | claude --effort: $SUPPORTS_EFFORT"
hr

# First run: record base branch, require clean tree, create safety tag + integration branch.
if [ ! -f "$RUN_ENV" ]; then
  require_clean_tree_or_die
  BASE_BRANCH="$(current_branch)"
  [ -n "$BASE_BRANCH" ] || die "detached HEAD — checkout a branch first"
  SAFETY_TAG="safety/pre-apple-review-night-$(date +%Y%m%d-%H%M%S)"
  git tag "$SAFETY_TAG" || die "could not create safety tag"
  cat > "$RUN_ENV" <<EOF
BASE_BRANCH='$BASE_BRANCH'
SAFETY_TAG='$SAFETY_TAG'
STARTED_AT='$(ts)'
EOF
  log "base branch: $BASE_BRANCH"
  log "safety tag created: $SAFETY_TAG   (rollback: git checkout $BASE_BRANCH && git branch -D <task branches>)"
else
  # shellcheck disable=SC1090
  . "$RUN_ENV"
  log "resuming existing run (base=$BASE_BRANCH, safety tag=$SAFETY_TAG)"
fi

if branch_exists "$INTEGRATION_BRANCH"; then
  log "reusing integration branch $INTEGRATION_BRANCH"
else
  git checkout -b "$INTEGRATION_BRANCH" "$BASE_BRANCH" >/dev/null 2>&1 || die "cannot create $INTEGRATION_BRANCH from $BASE_BRANCH"
  log "created integration branch $INTEGRATION_BRANCH from $BASE_BRANCH"
fi

# Iterate the manifest in order.
TASK_COUNT=0
DONE_COUNT=0
while IFS=$'\t' read -r order slug cob title goal; do
  case "$order" in ''|'#'*) continue ;; esac
  [ -n "$slug" ] || continue
  TASK_COUNT=$((TASK_COUNT + 1))
  process_task "$order" "$slug" "$cob" "$title" "$goal"
  load_task_state "${order}-${slug}"
  [ "$T_STATUS" = "done" ] && DONE_COUNT=$((DONE_COUNT + 1))
done < "$TASKS_FILE"

hr
log "NIGHT RUN COMPLETE: $DONE_COUNT/$TASK_COUNT tasks done."
log "integration branch: $INTEGRATION_BRANCH (all branches local; nothing pushed)"
log "reports: $REPORTS_DIR/   logs: $LOGS_DIR/   state: $STATE_DIR/"
log "next: review 'git log --oneline --graph $INTEGRATION_BRANCH', read the reports,"
log "      then merge $INTEGRATION_BRANCH into $BASE_BRANCH yourself when satisfied."
hr
