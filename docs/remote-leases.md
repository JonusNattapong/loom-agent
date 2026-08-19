# Remote leases

Assignment ownership is durable in SQLite. Lease expiry is authoritative for ownership; heartbeats only indicate presence. Each takeover receives a monotonically increasing database fencing token. Results/events must match assignment, worker, lease, and fencing token and are rejected after expiry or takeover. Fencing prevents a disconnected or restarted worker generation from overwriting current state.
