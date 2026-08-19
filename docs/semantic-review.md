# Semantic review

`SemanticReviewer` accepts structured review output (`accept`, `reject`, or `needs_human`) and validates the verdict/issues shape. Reviewer recommendations are advisory: they cannot authorize tools or bypass approvals. Deterministic fallback requires verification evidence and otherwise escalates to a human. Repair loops must be bounded by the configured repair-round limit.
