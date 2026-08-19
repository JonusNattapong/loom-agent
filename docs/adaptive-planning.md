# Adaptive planning

Loom V0.6 adds model-assisted structured planning through `@loom/adaptive`. A provider may propose JSON tasks, but Loom validates roles, task limits, dependencies, cycles, and graph depth before execution. Invalid, unavailable, or malformed model output uses a deterministic inspect → execute → verify fallback. Plans are proposals; they do not mutate durable state directly.

Planning is bounded by `maxTasks` (20) and `maxDepth` (5). Applications should persist the accepted proposal and its version alongside their existing plan/task checkpoints when wiring it into a durable run.

## Runtime integration

`AdaptiveOrchestrator` is now used by `loom run`: it persists a plan revision, materializes the durable task graph, executes through bounded provider/tool rounds, records execution checkpoints, and records semantic review results. If a process stops after a proposal was persisted, the next run materializes missing tasks from that revision rather than creating another plan.
