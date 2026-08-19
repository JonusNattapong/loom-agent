# Adaptive planning

Loom V0.6 adds model-assisted structured planning through `@loom/adaptive`. A provider may propose JSON tasks, but Loom validates roles, task limits, dependencies, cycles, and graph depth before execution. Invalid, unavailable, or malformed model output uses a deterministic inspect → execute → verify fallback. Plans are proposals; they do not mutate durable state directly.

Planning is bounded by `maxTasks` (20) and `maxDepth` (5). Applications should persist the accepted proposal and its version alongside their existing plan/task checkpoints when wiring it into a durable run.
