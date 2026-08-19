# @loom/remote

Controller-centric V0.8 remote worker protocol primitives: versioned envelopes, normalized capabilities, deterministic routing, leases with fencing, cumulative ACK/replay journals, and `RemoteFabricController`. Workers connect outbound through the `WorkerTransport` abstraction; controller state remains authoritative.
