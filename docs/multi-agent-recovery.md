---
title: Multi-agent recovery and cancellation
version: 0.4
category: how-to
---

# Multi-agent recovery and cancellation

Resume from the root id:

```bash
npm run loom -- inspect <root-agent-id>
npm run loom -- resume <root-agent-id>
```

Loom reconstructs the agent tree, graph, ownership, leases, delegations, results, A2A messages, checkpoints, artifacts, approvals, and tool ledger from SQLite.

## Recovery rules

1. Consume a child result that was persisted before the parent stopped.
2. Acknowledge that result exactly once.
3. Reuse an unfinished child and delegation rather than spawning duplicates.
4. Release an expired or interrupted lease before the same child resumes.
5. Keep a task waiting if its child needs approval.
6. Refuse automatic replay when the tool ledger cannot prove that a side effect is safe.

`--max-tasks` remains a deterministic interruption point for testing:

```bash
npm run loom -- run "create a release note" --max-agents 2 --max-tasks 1
npm run loom -- resume <root-agent-id>
```

## Approval recovery

The approval record includes the child id, role, task, tool, argument summary, and reason. Approve or deny by request id, then resume the root. Loom resumes the affected child.

```bash
npm run loom -- approvals <root-agent-id>
npm run loom -- approve <request-id>
npm run loom -- resume <root-agent-id>
```

## Cancellation

```bash
npm run loom -- agent cancel <agent-id>
```

Cancelling a child cancels that subtree. Cancelling a root cancels all active descendants and leases and marks the root plan cancelled. Detached children are not supported.
