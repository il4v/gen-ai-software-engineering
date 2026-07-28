#!/usr/bin/env bash
# Single-command execution of the homework-4 4-agent pipeline.
#
# Run order per bug folder in context/bugs/<NNN>/:
#   (Bug Researcher stand-in) -> Bug Research Verifier -> (Bug Planner stand-in)
#   -> Bug Fixer -> Security Verifier -> Unit Test Generator
#
# "Bug Researcher" and "Bug Planner" are not among the 4 required agents (see TASKS.md).
# They're folded in as simple file hand-offs instead of live agent stages:
#   - Bug Researcher stand-in: bug-context.md (written by hand in Step 4, with real
#     file:line citations) is used directly as the research-verifier's input document.
#   - Bug Planner stand-in: bug-context.md's own "What fixed looks like" section is
#     already a precise enough fix description to serve as the bug-fixer's plan.
# This choice is documented in PLAN-USER.md Step 5 and in the homework README.
#
# Invocation mechanism: each of the 4 required agents is invoked directly via
# `claude -p`, reading its frontmatter (model, tools) and prompt body straight out of
# agents/<name>.agent.md — not via Claude Code's named-subagent auto-discovery, which
# only resolves agents from .claude/agents/ and isn't suited to a deterministic,
# stop-on-failure batch pipeline. See PLAN-USER.md Step 5 for the full rationale.

set -euo pipefail

BUGS=(001 002 003)

# --- helpers -----------------------------------------------------------------

read_agent_field() {
  # $1 = agent file, $2 = frontmatter key (e.g. "model", "tools")
  awk -v key="$2:" '
    /^---[[:space:]]*$/ { fm++; next }
    fm == 1 && index($0, key) == 1 {
      sub("^" key "[[:space:]]*", "")
      print
      exit
    }
  ' "$1"
}

read_agent_body() {
  # Everything after the closing --- of the frontmatter, with leading blank lines
  # stripped. Pure awk (no sed) so this works identically on BSD sed (macOS) and
  # GNU sed (Linux) systems without a portability shim.
  awk '
    /^---[[:space:]]*$/ { fm++; next }
    fm >= 2 {
      if (!started && $0 == "") next
      started = 1
      print
    }
  ' "$1"
}

run_agent() {
  local agent_file="$1" task="$2"
  local model tools body

  model=$(read_agent_field "$agent_file" "model")
  tools=$(read_agent_field "$agent_file" "tools")
  body=$(read_agent_body "$agent_file")

  echo ">>> $(basename "$agent_file") (model: $model, tools: $tools)"
  claude -p "$task" \
    --system-prompt "$body" \
    --model "$model" \
    --allowedTools "$tools" \
    --permission-mode bypassPermissions
}

# --- pipeline ------------------------------------------------------------------

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")"

  for NNN in "${BUGS[@]}"; do
    echo "=== Bug $NNN ==="
    local BUGDIR="context/bugs/$NNN"

    if [ ! -f "$BUGDIR/bug-context.md" ]; then
      echo "Skipping $NNN: $BUGDIR/bug-context.md not found."
      continue
    fi

    mkdir -p "$BUGDIR/research"
    cp "$BUGDIR/bug-context.md" "$BUGDIR/research/codebase-research.md"

    # 1. Bug Research Verifier
    run_agent "agents/research-verifier.agent.md" \
      "Verify the research document at $BUGDIR/research/codebase-research.md and write your verification to $BUGDIR/research/verified-research.md."

    if command grep -qE "Needs Rework|Unverifiable" "$BUGDIR/research/verified-research.md"; then
      echo "!!! Bug $NNN research rated Needs Rework/Unverifiable — stopping this bug's run, moving to the next."
      continue
    fi

    cp "$BUGDIR/bug-context.md" "$BUGDIR/implementation-plan.md"

    # 2. Bug Fixer
    run_agent "agents/bug-fixer.agent.md" \
      "Apply the plan at $BUGDIR/implementation-plan.md to the app in src/. The project's test command is: cd tests && pytest -v. Write your summary to $BUGDIR/fix-summary.md."

    if [ ! -f "$BUGDIR/fix-summary.md" ]; then
      echo "!!! Bug $NNN: bug-fixer produced no fix-summary.md — stopping this bug's run."
      continue
    fi

    # 3. Security Verifier (on changed code)
    run_agent "agents/security-verifier.agent.md" \
      "Read $BUGDIR/fix-summary.md and review the files it lists as changed. Write your findings to $BUGDIR/security-report.md."

    # 4. Unit Test Generator (on changed code)
    run_agent "agents/unit-test-generator.agent.md" \
      "Read $BUGDIR/fix-summary.md and write tests for the changed code into tests/. Write your report to $BUGDIR/test-report.md."

    echo "=== Bug $NNN done. Artifacts in $BUGDIR/ ==="
  done

  echo
  echo "Pipeline complete. Verify with: cd tests && pytest -v"
}

# Only run the pipeline when executed directly (./run-pipeline.sh or bash run-pipeline.sh).
# Sourcing this file (e.g. to dry-test read_agent_field/read_agent_body) defines the
# functions above without executing anything.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
