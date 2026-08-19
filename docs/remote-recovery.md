# Remote recovery

Controller restart recovery uses the durable worker registry, assignments, leases, protocol cursors, and outbound journal. A new worker connection may replay unacknowledged messages without creating a new logical assignment. Worker process restart uses a new instance/connection epoch; old envelopes cannot regain authority. If a lease expires, recovery requires a new lease and fencing token. This is resumable logical coordination, not exactly-once network delivery, exactly-once remote execution, HA controller consensus, or generic process resume.
