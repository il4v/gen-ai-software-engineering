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

get_research_quality() {
  # Extracts the canonical verdict from the mandatory final line of a
  # verified-research.md file: "Research Quality: <Level>". Anchored to the whole
  # line (not a substring search) so prose elsewhere that merely *discusses* other
  # level names (e.g. "why not Needs Rework...") can never produce a false match —
  # that ambiguity previously caused bugs 002/003 to be wrongly halted.
  command grep -oE '^Research Quality:[[:space:]]*(Verified|Mostly Verified|Needs Rework|Unverifiable)[[:space:]]*$' "$1" \
    | tail -n1 \
    | sed -E 's/^Research Quality:[[:space:]]*//; s/[[:space:]]*$//'
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

STATUS_STAGES=(research-verifier bug-fixer security-verifier unit-test-generator)

status_file_path() {
  echo "context/bugs/$1/PIPELINE-STATUS.md"
}

get_stage_status() {
  # $1 = bug NNN, $2 = stage name. Prints "done" or "pending".
  local f
  f=$(status_file_path "$1")
  if [ -f "$f" ] && command grep -qE "^- ${2}: done" "$f"; then
    echo "done"
  else
    echo "pending"
  fi
}

set_stage_done() {
  # $1 = bug NNN, $2 = stage name, $3 = optional one-line detail (e.g. research quality).
  local nnn="$1" stage="$2" detail="${3:-}" f newline
  f=$(status_file_path "$nnn")
  newline="- ${stage}: done"
  [ -n "$detail" ] && newline="${newline} (${detail})"

  if [ ! -f "$f" ]; then
    mkdir -p "$(dirname "$f")"
    {
      echo "# Pipeline Status — Bug $nnn"
      echo
      for s in "${STATUS_STAGES[@]}"; do
        if [ "$s" = "$stage" ]; then
          echo "$newline"
        else
          echo "- ${s}: pending"
        fi
      done
      echo
      echo "Last updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$f"
  else
    awk -v stage="$stage" -v newline="$newline" '
      $0 ~ "^- " stage ":" { print newline; next }
      { print }
    ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    # Refresh the timestamp line if present, else append one.
    if command grep -q "^Last updated:" "$f"; then
      awk -v ts="Last updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" '
        /^Last updated:/ { print ts; next } { print }
      ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    else
      echo "Last updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$f"
    fi
  fi
}

all_stages_done() {
  # $1 = bug NNN. Returns success (0) only if every stage is marked done.
  local nnn="$1" s
  for s in "${STATUS_STAGES[@]}"; do
    [ "$(get_stage_status "$nnn" "$s")" = "done" ] || return 1
  done
  return 0
}

run_confirmation_tests() {
  # Re-runs the existing test suite(s) directly — no agent call, no LLM involved.
  # Used both as the cheap re-check for already-completed bugs and as the real test
  # step after a fresh bug-fixer run.
  #
  # Resolves a working pytest even if the caller's shell has no venv active: prefers
  # the app's own src/.venv, then PATH, then falls back to `python3 -m pytest`. A
  # missing pytest binary must never masquerade as "the tests failed."
  local ok=0 pytest_cmd

  if [ -x "src/.venv/bin/pytest" ]; then
    pytest_cmd="src/.venv/bin/pytest"
  elif command -v pytest >/dev/null 2>&1; then
    pytest_cmd="pytest"
  else
    pytest_cmd="python3 -m pytest"
  fi

  $pytest_cmd tests/ -v || ok=1

  if [ -f package.json ] && [ -d node_modules ]; then
    npm test || ok=1
  fi

  return "$ok"
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

    # Fast path: if every stage is already marked done, just re-confirm with the real
    # test suite (no agent calls, no side effects). Only fall through to full
    # processing if that confirmation actually fails — i.e. something regressed
    # underneath a stale marker.
    if all_stages_done "$NNN"; then
      echo "Bug $NNN: all stages already done per $(status_file_path "$NNN") — re-confirming with tests only."
      if run_confirmation_tests; then
        echo "=== Bug $NNN confirmed still fixed. Skipped all agent calls. ==="
        continue
      fi
      echo "!!! Bug $NNN: marked done, but the confirmation test run just failed — re-opening the full pipeline for this bug."
      # Actually reopen it: the per-stage checks below only skip a stage when its
      # marker says "done", so a stale-but-still-present status file would just be
      # re-skipped in full, silently no-opping this whole branch. Clearing it here
      # is what makes "re-opening" real instead of a message that does nothing.
      rm -f "$(status_file_path "$NNN")"
    fi

    # 1. Bug Research Verifier
    if [ "$(get_stage_status "$NNN" research-verifier)" = "done" ]; then
      echo "Bug $NNN: research-verifier already done — skipping."
    else
      mkdir -p "$BUGDIR/research"
      cp "$BUGDIR/bug-context.md" "$BUGDIR/research/codebase-research.md"
      run_agent "agents/research-verifier.agent.md" \
        "Verify the research document at $BUGDIR/research/codebase-research.md and write your verification to $BUGDIR/research/verified-research.md."
    fi

    local quality
    quality=$(get_research_quality "$BUGDIR/research/verified-research.md")

    if [ -z "$quality" ]; then
      echo "!!! Bug $NNN: no canonical 'Research Quality: <Level>' final line found in verified-research.md — treating as a gate failure, stopping this bug's run."
      continue
    fi

    echo "Bug $NNN research quality: $quality"

    if [ "$quality" = "Needs Rework" ] || [ "$quality" = "Unverifiable" ]; then
      echo "!!! Bug $NNN research rated $quality — stopping this bug's run, moving to the next."
      continue
    fi

    # A PASS-level quality is what "done" means for this stage — a Needs
    # Rework/Unverifiable verdict above already continued past this point, so
    # reaching here always means the stage should be recorded as done.
    set_stage_done "$NNN" research-verifier "Research Quality: $quality"

    # 2. Bug Fixer
    if [ "$(get_stage_status "$NNN" bug-fixer)" = "done" ]; then
      echo "Bug $NNN: bug-fixer already done — skipping."
    else
      cp "$BUGDIR/bug-context.md" "$BUGDIR/implementation-plan.md"
      run_agent "agents/bug-fixer.agent.md" \
        "Apply the plan at $BUGDIR/implementation-plan.md to the app in src/. The project's test command is: pytest tests/ -v (run it from this working directory — do not cd into tests/ first, since a Bash cd persists across your subsequent tool calls in this session and later relative-path writes would resolve wrong). Write your summary to $BUGDIR/fix-summary.md."

      if [ ! -f "$BUGDIR/fix-summary.md" ]; then
        echo "!!! Bug $NNN: bug-fixer produced no fix-summary.md — stopping this bug's run."
        continue
      fi
      set_stage_done "$NNN" bug-fixer
    fi

    # 3. Security Verifier (on changed code)
    if [ "$(get_stage_status "$NNN" security-verifier)" = "done" ]; then
      echo "Bug $NNN: security-verifier already done — skipping."
    else
      run_agent "agents/security-verifier.agent.md" \
        "Read $BUGDIR/fix-summary.md and review the files it lists as changed. Write your findings to $BUGDIR/security-report.md."

      if [ ! -f "$BUGDIR/security-report.md" ]; then
        echo "!!! Bug $NNN: security-verifier produced no security-report.md — stopping this bug's run."
        continue
      fi
      set_stage_done "$NNN" security-verifier
    fi

    # 4. Unit Test Generator (on changed code) — "QA". Once done, later runs only
    # re-run the test suite directly (see the fast path above); this branch is the
    # one real agent invocation that produces that done state in the first place.
    if [ "$(get_stage_status "$NNN" unit-test-generator)" = "done" ]; then
      echo "Bug $NNN: unit-test-generator already done — re-confirming with tests only."
      run_confirmation_tests || echo "!!! Bug $NNN: confirmation tests failed after an already-done unit-test-generator stage — investigate manually."
    else
      run_agent "agents/unit-test-generator.agent.md" \
        "Read $BUGDIR/fix-summary.md and write tests for the changed code into tests/. Write your report to $BUGDIR/test-report.md."

      if [ ! -f "$BUGDIR/test-report.md" ]; then
        echo "!!! Bug $NNN: unit-test-generator produced no test-report.md — stopping this bug's run."
        continue
      fi
      set_stage_done "$NNN" unit-test-generator
    fi

    echo "=== Bug $NNN done. Artifacts in $BUGDIR/ ==="
  done

  echo
  echo "Pipeline complete. Verify with: pytest tests/ -v"
}

# Only run the pipeline when executed directly (./run-pipeline.sh or bash run-pipeline.sh).
# Sourcing this file (e.g. to dry-test read_agent_field/read_agent_body) defines the
# functions above without executing anything.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  LOG_DIR="$SCRIPT_DIR/docs-tmp"
  mkdir -p "$LOG_DIR"
  # Timestamp reflects run *start* time, computed once here before main() begins.
  LOG_FILE="$LOG_DIR/pipeline-run-$(date +%Y%m%d-%H%M%S).log"
  echo "Logging full output to $LOG_FILE (in addition to this terminal)."
  main "$@" 2>&1 | tee "$LOG_FILE"
fi
