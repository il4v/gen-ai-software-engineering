#!/usr/bin/env bash
# Coverage-gate PreToolUse hook (Task 3). Blocks `git push` if pytest coverage is below 80%.
# Reads the PreToolUse JSON payload from stdin; any Bash command that isn't a git push is a no-op.

PAYLOAD="$(cat)"

COMMAND="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("command", ""))
except Exception:
    print("")
')"

case "$COMMAND" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_DIR" || exit 0

COVERAGE_OUTPUT="$(python3 -m pytest --cov=pipeline --cov=frontend --cov=mcp --cov-report=term-missing --cov-fail-under=80 2>&1)"
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "Coverage gate blocked this push: pytest exited $STATUS (tests failed and/or coverage is below the 80% gate)." >&2
  echo "$COVERAGE_OUTPUT" | tail -25 >&2
  exit 2
fi

exit 0
