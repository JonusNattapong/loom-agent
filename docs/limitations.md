---
title: Known limitations
version: 0.4
category: explanation
---

# Known limitations

- V0.4 is a local, single-process multi-agent runtime. It has no remote workers, network A2A, daemon, scheduler, distributed lock service, or cloud queue.
- Plan topology and role selection are rule-based rather than model-generated.
- “Targeted tests” currently run the full Vitest suite.
- Diff review checks whitespace/errors and statistics; it is not semantic model review.
- The OpenAI-compatible provider supports one tool round and no streaming.
- All agents use the same provider/model by default. Role model overrides are represented in config types but not routed yet.
- Role Markdown overrides replace instructions only; tool and skill policy remains in built-in definitions.
- Skills are discoverable, but graph children do not inject `--skill` instructions yet.
- MCP supports basic line-delimited stdio JSON-RPC only.
- SQLite access is synchronous. Bounded concurrency coordinates asynchronous child work but does not make SQLite distributed or multi-writer safe across several Loom processes.
- A lease prevents concurrent assignment in one database. If a side effect was interrupted, the tool ledger may require human intervention instead of replaying it.
- Artifact tracking records declared tool/executor changes; it does not derive a complete filesystem diff automatically.
- Approval decisions have no user identity or cryptographic signature.
- Context visibility and role tools reduce accidental sharing; Loom is not a sandbox.
- Trace payloads do not receive general secret redaction.
- The deterministic eval harness measures runtime invariants, not model quality.

Reasonable V0.5 work includes model-assisted planning and delegation, semantic review, true targeted-test selection, multi-round providers, richer role configuration, and stronger approval identity. Remote/distributed execution should remain a separate milestone.
