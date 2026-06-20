#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE="docs/LULLABY_LOGGING_AGENT_STATUS.md"
PROMPT_FILE=".claude/prompts/lullaby-autopilot-step.md"
LOG_FILE=".claude/autopilot.log"

MAX_ROUNDS="${MAX_ROUNDS:-30}"
CLAUDE_MODEL="${CLAUDE_MODEL:-sonnet}"
CLAUDE_EFFORT="${CLAUDE_EFFORT:-high}"

mkdir -p .claude

echo "==============================" | tee -a "$LOG_FILE"
echo "Lullaby Claude Autopilot Start" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Max rounds: $MAX_ROUNDS" | tee -a "$LOG_FILE"
echo "Model: $CLAUDE_MODEL" | tee -a "$LOG_FILE"
echo "Effort: $CLAUDE_EFFORT" | tee -a "$LOG_FILE"
echo "==============================" | tee -a "$LOG_FILE"

if [ ! -f "$STATUS_FILE" ]; then
  echo "Missing status file: $STATUS_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Missing prompt file: $PROMPT_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

for ROUND in $(seq 1 "$MAX_ROUNDS"); do
  echo "" | tee -a "$LOG_FILE"
  echo "===== AUTOPILOT ROUND $ROUND / $MAX_ROUNDS =====" | tee -a "$LOG_FILE"
  echo "Time: $(date)" | tee -a "$LOG_FILE"

  if grep -q "AUTOPILOT_STATUS: DONE" "$STATUS_FILE"; then
    echo "Autopilot status is DONE. Exiting." | tee -a "$LOG_FILE"
    exit 0
  fi

  if grep -q "AUTOPILOT_STATUS: BLOCKED" "$STATUS_FILE"; then
    echo "Autopilot status is BLOCKED. Exiting." | tee -a "$LOG_FILE"
    exit 2
  fi

  BEFORE_HEAD="$(git rev-parse HEAD 2>/dev/null || echo 'no-git-head')"

  set +e
  claude -p \
    --model "$CLAUDE_MODEL" \
    --effort "$CLAUDE_EFFORT" \
    --permission-mode auto \
    --output-format text \
    "$(cat "$PROMPT_FILE")" 2>&1 | tee -a "$LOG_FILE"

  CLAUDE_EXIT=${PIPESTATUS[0]}
  set -e

  AFTER_HEAD="$(git rev-parse HEAD 2>/dev/null || echo 'no-git-head')"

  echo "Claude exit code: $CLAUDE_EXIT" | tee -a "$LOG_FILE"
  echo "Before HEAD: $BEFORE_HEAD" | tee -a "$LOG_FILE"
  echo "After HEAD:  $AFTER_HEAD" | tee -a "$LOG_FILE"

  if [ "$CLAUDE_EXIT" -ne 0 ]; then
    echo "Claude failed in round $ROUND. Stopping autopilot." | tee -a "$LOG_FILE"
    echo "Set AUTOPILOT_STATUS: BLOCKED manually if needed." | tee -a "$LOG_FILE"
    exit "$CLAUDE_EXIT"
  fi

  if grep -q "AUTOPILOT_STATUS: DONE" "$STATUS_FILE"; then
    echo "Autopilot completed all tasks." | tee -a "$LOG_FILE"
    exit 0
  fi

  if grep -q "AUTOPILOT_STATUS: BLOCKED" "$STATUS_FILE"; then
    echo "Autopilot became blocked." | tee -a "$LOG_FILE"
    exit 2
  fi

  echo "Round $ROUND completed. Continuing to next task." | tee -a "$LOG_FILE"
done

echo "Reached MAX_ROUNDS=$MAX_ROUNDS without DONE." | tee -a "$LOG_FILE"
echo "Increase MAX_ROUNDS if the status file shows safe progress." | tee -a "$LOG_FILE"
exit 3