# Semantic review

`SemanticReviewer` accepts structured review output (`accept`, `reject`, or `needs_human`) and validates the verdict/issues shape. Reviewer recommendations are advisory: they cannot authorize tools or bypass approvals. Deterministic fallback requires verification evidence and otherwise escalates to a human. Repair loops must be bounded by the configured repair-round limit.

Review records, repair rounds, and execution rounds are stored in the V0.6 SQLite migration and keyed by root agent/task. Bot events can use the same orchestrator through `createAdaptiveBotRunner`; session metadata retains the root agent ID for follow-ups.
