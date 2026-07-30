---
name: unit-tests-FIRST
description: Use when writing or reviewing unit tests for changed code in this pipeline. Defines the FIRST principles (Fast, Independent, Repeatable, Self-validating, Timely) as concrete, checkable rules the Unit Test Generator agent must satisfy for every test it writes.
---

# FIRST Principles for Unit Tests

A checklist the Unit Test Generator agent applies to every test it writes for changed code. A test that
violates any one of these is not acceptable output — fix it before including it in `test-report.md`.

## F — Fast
- Runs in milliseconds, not seconds. No real network calls, no real filesystem I/O beyond what the test
  framework's own tmp helpers provide, no `sleep`.
- If the code under test does I/O, mock/stub the boundary rather than exercising the real dependency.

## I — Independent
- No test depends on another test having run first, or on shared mutable state left over from a previous test.
- Tests may run in any order, or in parallel, with the same result every time.
- Each test sets up its own fixtures/data; nothing is implicitly inherited from test ordering.

## R — Repeatable
- Same result every run, in any environment (your machine, CI, someone else's laptop).
- No dependency on wall-clock time, random values without a fixed seed, external services, or ambient system
  state (locale, timezone, env vars) unless the test explicitly controls that input.

## S — Self-validating
- The test itself asserts pass/fail with a boolean outcome (assertion), not something a human has to read
  output and judge.
- No tests that just print/log values for manual inspection — every test has a real assertion tied to the
  behavior being verified.

## T — Timely
- Written close to the change it covers — in this pipeline, that means written in the same run as the fix,
  covering exactly the bug that was fixed (a regression test) plus the directly adjacent behavior.
- Not deferred, not written for unrelated legacy code "while we're here."

## How the Unit Test Generator applies this

Before writing `test-report.md`, run each written test mentally (or literally, via the test runner) against
each letter above. Include a short FIRST compliance line in the report per test group — e.g. "Fast: no I/O,
runs in-memory. Independent: fresh fixture per test. Repeatable: no time/random dependency. Self-validating:
explicit assert on return value. Timely: written same run, covers the exact fixed bug." A test that can't
honestly get a compliance line for all five should be rewritten, not shipped.
