# Loom Implementation State

This file is the durable handoff for the current Loom v1.1 work.

## Product direction

Loom is moving toward reliable distribution, unified execution, portable TUI behavior, and a conversational chat-style REPL. Runtime self-capabilities are opt-in and must not persist secrets or make code changes without approval.

## Completed runtime/UI work

- `npm run start` runs the interactive REPL; `npm run dev` preserves TTY input and hot-reloads through `scripts/dev.mjs`.
- Mock is removed from runtime defaults. Tests may still use `MockProvider`.
- Provider key setup switches the active provider automatically and opens model selection sequentially.
- API-key modal owns keyboard input, supports bracketed clipboard paste, and prevents input/Ctrl+C leaking to the editor.
- Model picker filters to the active provider; MCP picker no longer shows fake entries.
- REPL uses a conversational transcript (`Waiting...`, assistant response, transient notifications) instead of exposing the execution tree by default.
- Retry policy distinguishes transient failures from auth, permission, and invalid-request failures.

## Self-capability foundation

`packages/runtime/src/index.ts` contains `SelfRuntime`, `SelfRuntimePolicy`, `SelfGrowthEngine`, `SelfToolGuard`, `SelfDesigner`, `SelfPlanner`, `SelfRouter`, `SelfEvaluator`, `SelfTester`, `SelfCorrection`, `SelfRecovery`, `SelfMonitor`, `SelfGovernance`, `SelfSecurity`, `SelfOptimizer`, and `SelfDocumenter`.

Self-growth observes explicit preferences, creates pending suggestions, redacts secrets, and requires approval before writing memory. The engine is connected to `AgentLoop` through `selfGrowth` and `onLearningSuggestion` options.

## Important commits

Recent milestones include `c049411` (TTY-preserving dev runner), `ebf36e4` (runtime mock removal), `f14ba9e` (modal input routing), `9c02299` (clipboard paste), `aafdf08` (chat REPL), `2f4d3bc` (growth integration), `d844c47` (self-design), `3585ebb` (transient notices/OpenCode timeout), and `f215e6e` (provider model filtering and real MCP list).

## Verification

Runtime self-capability tests live in `packages/runtime/src/index.test.ts`. Full repository builds may be affected by unrelated uncommitted companion UI work; do not overwrite those changes.
