# Remote routing

Routing is deterministic: requirements and role are filtered first, then trust/allowed-worker policy, connectivity, capabilities, and capacity; ties use stable worker ID ordering. No eligible worker leaves work queued for explicit policy handling; Loom does not silently route to an unauthorized worker.
