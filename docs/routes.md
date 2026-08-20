# V0.9 routes

A route is the current, transient way the controller can reach a stable [`loom://` identity](loom-addressing.md). Identity and reachability have separate lifetimes: invalidating or replacing a route does not delete its registered logical node.

## Route descriptors

`@loom/network` defines descriptors with:

- `target`: a structured Loom address;
- `transport`: `controller-websocket`, `relay`, or `direct`;
- `state`: `available`, `degraded`, or `unavailable`;
- optional `connectionId`, `relayId`, and non-negative finite `cost`;
- optional registry-assigned `revision`.

The registry atomically replaces a target's current route. Revisions and expected connection IDs allow delayed disconnects to be ignored instead of deleting a newer binding. Immutable snapshots preserve point-in-time resolution.

## What V0.9 actually routes

The running remote-worker controller registers `loom://worker/<worker-id>` nodes. An authenticated outbound worker WebSocket creates an `available` `controller-websocket` route. Disconnecting invalidates that connection's route while retaining the worker node; route listing then reports it as `unavailable`. Only worker targets are resolved by the current remote controller.

The `relay` and `direct` transport values are future-facing descriptor vocabulary and registry validation only. V0.9 does **not** implement relay transport or direct/P2P connections. It also does not implement NAT traversal, a VPN, a mesh, consensus, or distributed storage.

## Control-plane view

With remote execution enabled, authenticated operators can inspect routes:

```http
GET /api/v1/routes
GET /api/v1/routes/loom://worker/gpu-01
```

The list is empty when no remote controller is enabled. A known offline worker resolves to an `unavailable` descriptor; an unknown or non-worker target returns 404. Route endpoints are read-only and do not create routes or establish connections.
