#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE="docs/LULLABY_LOGGING_AGENT_STATUS.md"
PROMPT_FILE=".claude/prompts/lullaby-autopilot-step.md"
LOG_FILE=".claude/autopilot.log"

MAX_ROUNDS="${MAX_ROUNDS:-30}"

CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
CLAUDE_EFFORT="${CLAUDE_EFFORT:-max}"

LIMIT_RETRY_SLEEP_SECONDS="${LIMIT_RETRY_SLEEP_SECONDS:-1800}"
MAX_LIMIT_RETRIES="${MAX_LIMIT_RETRIES:-999}"

mkdir -p .claude

status_is() {
  local expected="$1"
  grep -qx "AUTOPILOT_STATUS: ${expected}" "$STATUS_FILE"
}

echo "==============================" | tee -a "$LOG_FILE"
echo "Lullaby Claude Autopilot Start" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Max rounds: $MAX_ROUNDS" | tee -a "$LOG_FILE"
echo "Model: $CLAUDE_MODEL" | tee -a "$LOG_FILE"
echo "Effort: $CLAUDE_EFFORT" | tee -a "$LOG_FILE"
echo "Limit retry sleep: ${LIMIT_RETRY_SLEEP_SECONDS}s" | tee -a "$LOG_FILE"
echo "Max limit retries: $MAX_LIMIT_RETRIES" | tee -a "$LOG_FILE"
echo "==============================" | tee -a "$LOG_FILE"

if [ ! -f "$STATUS_FILE" ]; then
  echo "Missing status file: $STATUS_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Missing prompt file: $PROMPT_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

ROUND=1
LIMIT_RETRY_COUNT=0

while [ "$ROUND" -le "$MAX_ROUNDS" ]; do
  echo "" | tee -a "$LOG_FILE"
  echo "===== AUTOPILOT ROUND $ROUND / $MAX_ROUNDS =====" | tee -a "$LOG_FILE"
  echo "Time: $(date)" | tee -a "$LOG_FILE"

  if status_is "DONE"; then
    echo "Autopilot status is DONE. Exiting." | tee -a "$LOG_FILE"
    exit 0
  fi

  if status_is "BLOCKED"; then
    echo "Autopilot status is BLOCKED. Exiting." | tee -a "$LOG_FILE"
    exit 2
  fi

  BEFORE_HEAD="$(git rev-parse HEAD 2>/dev/null || echo 'no-git-head')"
  ROUND_OUTPUT=".claude/autopilot-round-${ROUND}.out"

  rm -f "$ROUND_OUTPUT"

  set +e
  claude -p \
    --model "$CLAUDE_MODEL" \
    --effort "$CLAUDE_EFFORT" \
    --permission-mode auto \
    --output-format text \
    "$(cat "$PROMPT_FILE")" 2>&1 | tee "$ROUND_OUTPUT" | tee -a "$LOG_FILE"

  CLAUDE_EXIT=${PIPESTATUS[0]}
  set -e

  AFTER_HEAD="$(git rev-parse HEAD 2>/dev/null || echo 'no-git-head')"

  echo "Claude exit code: $CLAUDE_EXIT" | tee -a "$LOG_FILE"
  echo "Before HEAD: $BEFORE_HEAD" | tee -a "$LOG_FILE"
  echo "After HEAD:  $AFTER_HEAD" | tee -a "$LOG_FILE"

  if [ "$CLAUDE_EXIT" -ne 0 ]; then
    if grep -qiE "rate limit|usage limit|limit reached|quota|too many requests|429|reset|resets|five.hour|5.hour|5-hour|session limit" "$ROUND_OUTPUT"; then
      LIMIT_RETRY_COUNT=$((LIMIT_RETRY_COUNT + 1))

      echo "" | tee -a "$LOG_FILE"
      echo "Claude appears to have hit a usage/rate/session limit." | tee -a "$LOG_FILE"
      echo "Limit retry $LIMIT_RETRY_COUNT / $MAX_LIMIT_RETRIES." | tee -a "$LOG_FILE"
      echo "Sleeping for ${LIMIT_RETRY_SLEEP_SECONDS}s, then retrying the SAME round." | tee -a "$LOG_FILE"
      echo "Current time: $(date)" | tee -a "$LOG_FILE"

      if [ "$LIMIT_RETRY_COUNT" -ge "$MAX_LIMIT_RETRIES" ]; then
        echo "Reached MAX_LIMIT_RETRIES. Stopping." | tee -a "$LOG_FILE"
        exit 4
      fi

      sleep "$LIMIT_RETRY_SLEEP_SECONDS"
      continue
    fi

    echo "Claude failed in round $ROUND with a non-limit error. Stopping autopilot." | tee -a "$LOG_FILE"
    echo "Inspect: $ROUND_OUTPUT" | tee -a "$LOG_FILE"
    exit "$CLAUDE_EXIT"
  fi

  LIMIT_RETRY_COUNT=0

  if status_is "DONE"; then
    echo "Autopilot completed all tasks." | tee -a "$LOG_FILE"
    exit 0
  fi

  if status_is "BLOCKED"; then
    echo "Autopilot became blocked." | tee -a "$LOG_FILE"
    exit 2
  fi

  echo "Round $ROUND completed. Continuing to next task." | tee -a "$LOG_FILE"
  ROUND=$((ROUND + 1))
done

echo "Reached MAX_ROUNDS=$MAX_ROUNDS without DONE." | tee -a "$LOG_FILE"
echo "Increase MAX_ROUNDS if the status file shows safe progress." | tee -a "$LOG_FILE"
exit 3
