# Background runtime and recovery

The daemon is an execution host, not a second agent runtime. Every background agent job enters `AdaptiveOrchestrator`, preserving planning, tool policy, checkpoints, review, repair, approvals, and verification. Bot/event integrations can enqueue jobs rather than performing long work inside ephemeral callbacks.

Recovery distinguishes daemon ownership from agent task leases. A stale daemon heartbeat allows a new local daemon to claim work; stale job leases return to the queue. Existing `rootAgentId` mappings are retained, avoiding duplicate roots. A process-level test kills the daemon after a persisted side-effect marker and verifies the resumed job completes with the same root.
