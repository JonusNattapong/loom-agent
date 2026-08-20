---
title: Known limitations
version: 1.1
category: explanation
---

# Known limitations

- Loom is controller-oriented and SQLite-backed. It supports a local daemon, scheduler, authenticated control plane, and outbound remote workers, but it is not a multi-controller distributed system.
- Plan topology and role selection are rule-based rather than model-generated.
- The current CLI verification path still uses the full Vitest suite for some targeted tasks; deterministic test selection is available as a library primitive but is not yet universal.
- Diff review checks whitespace/errors and statistics; it is not semantic model review.
- The OpenAI-compatible provider is non-streaming; adaptive execution supports bounded multi-round tool calls.
- Role-specific model routing remains limited; applications should register explicit providers until role routing is made durable end-to-end.
- Role Markdown overrides replace instructions only; tool and skill policy remains in built-in definitions.
- SDK embedded execution injects selected skills; graph-child skill policy remains an area for follow-up hardening.
- MCP supports basic line-delimited stdio JSON-RPC only.
- SQLite access is synchronous. Bounded concurrency coordinates asynchronous child work but does not make SQLite distributed or multi-writer safe across several Loom processes.
- A lease prevents concurrent assignment in one database. If a side effect was interrupted, the tool ledger may require human intervention instead of replaying it.
- Artifact tracking records declared tool/executor changes; it does not derive a complete filesystem diff automatically.
- Approval decisions have no user identity or cryptographic signature.
- Context visibility and role tools reduce accidental sharing; Loom is not a sandbox.
- Trace payloads do not receive general secret redaction.
- The deterministic eval harness measures runtime invariants, not model quality.

V1.1 deliberately does not provide multi-controller HA, distributed consensus or
storage, mesh/P2P networking, NAT traversal, or universal exactly-once external
side effects. Remote/distributed infrastructure remains a separate milestone.
