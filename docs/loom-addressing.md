# V0.9 `loom://` addressing

A Loom address is a stable logical resource identity. Its canonical grammar is:

```text
loom://<kind>/<id>
```

The supported, case-sensitive kinds are:

```text
worker | agent | job | bot | schedule | controller
```

Examples:

```text
loom://worker/gpu-01
loom://agent/root-123
loom://schedule/nightly
loom://bot/oracle%20alpha
```

## Canonical form

- The scheme is exactly lowercase `loom`.
- The kind is exactly one of the values above and acts as the URI authority.
- There is exactly one non-empty ID path segment.
- A decoded ID is 1–256 Unicode characters. It cannot be `.` or `..`, contain `/`, `\`, control characters, or invalid Unicode.
- IDs use the single canonical `encodeURIComponent` representation, with `!'()*` percent-encoded using uppercase hex. The encoded segment is limited to 1,024 characters.
- Credentials, ports, query strings, and fragments are forbidden.
- Non-canonical encodings are rejected rather than normalized. For example, `%67pu-01` is not accepted in place of `gpu-01`.

`parseLoomAddress`, `formatLoomAddress`, `isLoomAddress`, and `sameLoomAddress` are exported by `@loom-agent/network`. Parsed addresses are immutable.

## Identity is not a route

`loom://worker/gpu-01` identifies the logical worker; it is not a WebSocket URL, IP address, DNS name, or connection identifier. A node can remain registered while it is offline and has no usable route. Reconnecting can replace its current route without changing its Loom identity.

This separation prevents transient connection details from becoming durable foreign keys. See [Routes](routes.md).

The grammar reserves stable kinds for current resources, but it does not imply a universal name service or network. V0.9 provides no NAT traversal, P2P transport, VPN, relay transport, mesh, consensus, or distributed storage.
