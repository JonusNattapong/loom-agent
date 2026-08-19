---
title: Known limitations
version: 0.3
category: explanation
---

# Known limitations

- Plan topology is rule-based, not model-generated.
- “Targeted tests” currently run the full Vitest suite.
- Diff review checks whitespace/errors and statistics; it is not a semantic code-review model pass.
- OpenAI-compatible execution supports one tool round and no streaming.
- Skills are discoverable, but V0.3 graph execution does not inject `--skill` instructions or enforce skill tool lists.
- MCP supports basic line-delimited stdio JSON-RPC only.
- Approval decisions are local CLI records without user identity or cryptographic signing.
- SQLite access is synchronous and single-process oriented; no daemon or distributed coordination exists.
- Artifact tracking records provider `write_file` calls and executor-declared artifacts. It does not derive a complete filesystem diff automatically.
- The eval harness uses deterministic test doubles and is not a model-quality benchmark.
- Loom is not a sandbox and does not redact arbitrary secrets from traces.

Suitable V0.4 work includes model-assisted planning, real targeted-test selection, semantic review, multi-round provider/tool loops, stronger approval identity, and richer MCP lifecycle handling. Multi-agent orchestration should remain deferred until these single-agent controls are mature.
