---
description: Run the transaction processing pipeline end-to-end and report results.
---

Run the transaction processing pipeline end-to-end.

Steps:
1. Check that sample-transactions.json exists
2. Clear shared/ directories
3. Run the pipeline (e.g. python orchestrator.py or npm run pipeline)
4. Show a summary of results from shared/results/
5. Report any transactions that were rejected and why

Step 3's "e.g. python orchestrator.py" means `python3 orchestrator.py` in this environment — bare `python`
may resolve to a different or absent installation. Same for any other Python invocation in these steps.

Step 2 means calling `orchestrator.reset_shared_dirs()` specifically — e.g.
`python3 -c "import orchestrator; orchestrator.reset_shared_dirs()"` — never a blanket
`rm -rf shared/*` or equivalent. `reset_shared_dirs()` wipes `shared/{input,processing,output}` only;
`shared/results/` is the audit trail (specification.md §3 Idempotency) and must never be cleared by this
step, no matter how "Clear shared/ directories" might otherwise be read literally.
