# Remote worker security

Workers are separate trust boundaries. Authentication uses a high-entropy pre-shared token supplied by environment reference; raw tokens are not persisted or logged. Credentials can be scoped to a worker ID and disabled by changing the configured credential. TLS certificate verification is enabled by the Node WebSocket client for `wss://`; plaintext `ws://` is intended only for localhost development.

After authentication, the controller binds the socket to worker ID, worker instance ID, connection ID, and epoch. Old connections lose authority when superseded. Protocol validation, durable ACK/replay, lease expiry, and fencing remain authoritative. A stolen valid credential is usable until rotated/revoked and must be treated as compromised.
