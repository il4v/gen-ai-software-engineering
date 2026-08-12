---
description: Change fraud-detection policy in plain English; edits config/fraud_rules.yaml and reports the impact against the known 8-transaction baseline.
---

Change the fraud-detection rules in `config/fraud_rules.yaml` per the request that follows this command,
using the same process the `rule-engine-agent` subagent follows:

1. Run the pipeline against the current rules first and record the baseline outcome for all 8
   transactions in `sample-transactions.json` (`python3 -c "import orchestrator;
   orchestrator.reset_shared_dirs()"`, clear `shared/results/*.json`, `python3 orchestrator.py`).
2. Edit `config/fraud_rules.yaml` to satisfy the request. Keep existing rule `name`s stable unless asked
   to remove that rule.
3. Re-run the same two commands and diff the new outcomes against the baseline, transaction by
   transaction.
4. Report: what changed in the YAML, which transactions' outcomes changed and why, and confirm which
   ones stayed the same.

Never skip the before/after pipeline run — a rules file that's easy to edit is also easy to silently
break, and only actually running it against real data catches that.
