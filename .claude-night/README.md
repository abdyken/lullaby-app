# `.claude-night` — Overnight Apple-Review Fixer

An unattended, resumable workflow that works through Lullaby's Apple-review
blockers **one at a time**, each on its own local git branch, each in its own
named Claude Code session, with validation, logs, reports, and strict safety
rules. Target: the smallest Apple-review-safe **local-only v1 (Shape A)** —
no Supabase sync, no realtime caregiver sharing, no household/monetization
backend, no multiple babies, no push notifications, no local→account migration.

## Files

| Path | Tracked? | Purpose |
|---|---|---|
| `scripts/claude-night-apple-review.sh` | yes | The wrapper/orchestrator (bash) |
| `.claude-night/tasks.apple-review.tsv` | yes | Task manifest (TSV: `order slug continue_on_blocked title goal`) |
| `.claude-night/README.md` | yes | This file |
| `.claude-night/reports/` | yes | Per-task `XX-slug.status.json` written by Claude, committed with each task |
| `.claude-night/state/` | **gitignored** | Runtime state: `run.env`, `current_task`, per-task `.state` files |
| `.claude-night/logs/` | **gitignored** | Claude stdout JSON, stderr, validation logs, night-run log |
| `.claude-night/tmp/` | **gitignored** | Generated prompts |

## How it works

1. **First run** (requires a clean git tree): records the base branch, creates a
   safety tag `safety/pre-apple-review-night-YYYYMMDD-HHMMSS`, and creates/reuses
   the integration branch `release/apple-review-fixes`.
2. **Per task** from the manifest, in order:
   - branch `fix/apple-p0-XX-slug` off `release/apple-review-fixes`;
   - a **new** Claude Code session: `claude -p "<task prompt>" --name apple-review-XX-slug --output-format json`
     (model/effort/permission-mode from env). The **real `session_id` is parsed
     from the JSON output** and saved to state; resumes use
     `claude -p ... --resume <session_id>` (falling back to the session name if
     the id could not be parsed);
   - on **timeout** (`MAX_SECONDS`, default 17100s) or a detected **usage/rate
     limit**: state is saved (`paused`), the script sleeps
     `RESET_SLEEP_SECONDS` (default 19800s), then resumes the *same* session.
     Capped at `MAX_PAUSE_CYCLES` (default 6) per task;
   - **validation**: `npm run lint` (if present) → `npx tsc --noEmit` →
     `npm run check:local-interactions` (if present) → `git diff --check`.
     On failure, the same session is resumed with the validation output and
     asked to fix only those failures — up to `VALIDATION_RETRIES` (default 2);
   - Claude must write `.claude-night/reports/XX-slug.status.json`
     (`status: done|blocked|partial`). If missing, Claude is asked once; if
     still missing, the wrapper writes a fallback `partial` report. A `done`
     with failing validation is downgraded to `partial`;
   - `done` → wrapper commits on the task branch and merges it
     `--no-ff` into `release/apple-review-fixes`. `blocked`/`partial` → safe
     changes are committed, the branch is left **unmerged**, and the run
     continues only if the manifest says `continue_on_blocked=true`;
   - **merge conflicts stop the run immediately** with the conflicted files and
     exact manual commands printed. Nothing is force-resolved.
3. **Rerunning the script is always safe**: it skips `done` tasks and resumes
   the current task/session from `.claude-night/state/`.

## Start it

```bash
tmux new-session -d -s lullaby-apple-night \
  'MODEL=fable EFFORT=high PERMISSION_MODE=auto MAX_SECONDS=17100 RESET_SLEEP_SECONDS=19800 VALIDATION_RETRIES=2 ./scripts/claude-night-apple-review.sh 2>&1 | tee ".claude-night/logs/night-run-$(date +%Y%m%d-%H%M%S).log"'
```

## Monitor

```bash
tmux attach -t lullaby-apple-night          # watch live (detach: Ctrl-b d)
tail -f .claude-night/logs/night-run-*.log  # or follow the log
cat .claude-night/state/current_task        # which task is active
cat .claude-night/state/*.state             # per-task status
ls .claude-night/reports/                   # finished task reports
git log --oneline --graph release/apple-review-fixes
git branch --list 'fix/apple-p0-*'
```

## Env knobs

| Var | Default | Meaning |
|---|---|---|
| `MODEL` | `fable` | Claude model |
| `EFFORT` | `high` | Reasoning effort |
| `PERMISSION_MODE` | `auto` | Claude Code permission mode |
| `MAX_SECONDS` | `17100` | Per-run timeout (4h45m) |
| `RESET_SLEEP_SECONDS` | `19800` | Sleep after timeout/usage limit (5h30m) |
| `VALIDATION_RETRIES` | `2` | Validation fix-loop attempts |
| `MAX_PAUSE_CYCLES` | `6` | Cap on pause/sleep/resume cycles per task |

## Safety rules (enforced by design)

The wrapper **never**: pushes, force-pushes, runs `eas submit`, deploys,
submits to Apple, runs `git reset --hard` / `git clean` / `git checkout -- .` /
`git restore .`, deletes user data or env files, prints secrets, modifies
`.env`, changes the bundle id, enables a live paywall, or builds Shape B /
sync backend. All branches stay **local**. Each task prompt forbids Claude
from committing, merging, pushing, switching branches, or touching `.env` —
the wrapper owns git.

## Rollback

```bash
git checkout main                                # or your base branch
git tag -l 'safety/pre-apple-review-night-*'     # find the safety tag
# inspect what the night produced, then if you want it gone:
git branch -D release/apple-review-fixes
git branch --list 'fix/apple-p0-*' | xargs -r git branch -D
rm -rf .claude-night/state                       # forget run state (logs/reports keep history)
```
`main` itself is never touched by the night run, so rollback is just deleting
local branches.

## Troubleshooting

- **Dirty tree at start** → commit or `git stash push -u`, rerun.
- **Merge conflict** → the script printed the files + commands; resolve,
  `git add`, `git commit`, rerun the script (it continues with the next task).
- **Task blocked with `continue_on_blocked=false`** → read
  `.claude-night/reports/XX-slug.status.json`, fix/decide manually, then either
  edit the task's `.claude-night/state/XX-slug.state` to `T_STATUS='done'` (to
  skip) or delete that state file (to redo the task), and rerun.
- **Manual session resume** → each `.state` file contains the exact
  `claude -p ... --resume <id>` hint.
