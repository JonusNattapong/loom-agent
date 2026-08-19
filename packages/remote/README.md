# @loom/remote

Loom V0.8/V0.8.1 remote worker fabric. V0.8 provides versioned envelopes, normalized capabilities, deterministic policy routing, durable assignments and leases, fencing, ACK/replay, and the `RemoteFabricController`. V0.8.1 adds `WebSocketControllerTransport`, `WebSocketWorkerTransport`, `RemoteWorkerRuntime`, and `RemoteControllerService`. Workers authenticate and initiate outbound WebSocket connections; the existing protocol envelopes and durable recovery semantics remain authoritative.

Use `ws://127.0.0.1` only for local development. Use `wss://` or TLS termination for remote deployment.
