---
title: Local A2A message bus
version: 0.4
category: reference
---

# Local A2A message bus

V0.4 provides an internal, SQLite-backed agent-to-agent bus. It is separate from provider conversation messages and has no network transport.

Messages contain an id, root, sender, recipient, type, JSON payload, visibility, creation time, delivery time, and acknowledgement time.

Types are:

- `request`: parent assignment or detail request.
- `response`: successful result notification.
- `status`: lifecycle update.
- `artifact`: artifact notification.
- `error`: failed result notification.
- `cancel`: cancellation notice.

`AgentMessageBus` supports `send`, `receive`, `acknowledge`, and `list`. Cross-root messages are rejected. Delivery and acknowledgement are durable and traced.

```bash
npm run loom -- messages <agent-id>
npm run loom -- messages <agent-id> --json
```

V0.4 does not implement network A2A, remote agents, WebSockets, broker queues, or protocol interoperability with external agent systems.
