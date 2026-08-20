# Remote recovery

Controller restart recovery uses the durable worker registry, assignments, leases, protocol cursors, and outbound journal. A new worker connection may replay unacknowledged messages without creating a new logical assignment. Worker process restart uses a new instance/connection epoch; old envelopes cannot regain authority. If a lease expires, recovery requires a new lease and fencing token. This is resumable logical coordination, not exactly-once network delivery, exactly-once remote execution, HA controller consensus, or generic process resume.


## Execution recovery

The worker persists assignment result state and the existing ToolExecutor ledger in its local worker database. Replayed completed assignments return their prior result. A process crash during an in-flight tool call is not presented as generic process resume: the controller lease may expire and a later generation must pass fencing, while stable tool-call IDs protect completed idempotent effects. Controller cancellation is replayable and stale completion is rejected by lease validation.
