# Remote workers

V0.8 treats worker identity as durable and connections as temporary. A reconnect keeps the same `workerId`, but receives a new `connectionId` and monotonically increasing epoch. The controller binds inbound envelopes to the attached instance/epoch and rejects unbound or stale traffic. Worker capabilities are normalized and routed only when the worker is connected, within capacity, and policy eligible. A worker is a separate trust boundary; authentication and authorization remain explicit and worker-local secrets are not replicated.

## Current transport boundary

`WorkerTransport` is intentionally pluggable and the CI fabric uses a test-backed abstraction. A production reverse WebSocket/TLS adapter and token provisioning are V0.8.1 work; the controller still requires a transport-bound connection callback and never treats a worker ID string alone as authority.

```text
                   Loom Controller
                         |
              Registry / Policy / Journal
                         |
                 Controller Transport
                         |
          outbound worker channel (test-backed)
                 /          |          \
            Worker A     Worker B     Worker C
```

There is no worker-to-worker mesh, NAT traversal, or overlay network in V0.8.
