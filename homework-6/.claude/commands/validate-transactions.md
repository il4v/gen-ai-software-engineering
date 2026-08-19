---
description: Validate all transactions in sample-transactions.json without running the full pipeline.
---

Validate all transactions in sample-transactions.json without processing them.

Steps:
1. Run the validator stage in dry-run mode (e.g. python pipeline/validator.py --dry-run)
2. Report: total count, valid count, invalid count, reasons for rejection
3. Show a table of results

Note: step 1's "e.g. python pipeline/validator.py --dry-run" means `python3 pipeline/validator.py
--dry-run` in this environment — bare `python` may resolve to a different or absent installation.
