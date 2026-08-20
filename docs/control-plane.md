# V0.9 control plane

Loom V0.9 includes a small operator control plane served by `loom daemon start`. It serves the built web application, a versioned JSON API, and an authenticated server-sent event (SSE) stream from the same listener. The daemon and SQLite state store remain authoritative; the web application is an operator view over that local runtime.

## Quick start

From this repository:

```bash
npm ci
npm run build
npm run loom -- operator token create --name local-admin
npm run loom -- daemon start
```

The token is shown once. Keep the daemon running, open <http://127.0.0.1:4777>, and paste the token into the login page. Installed/package users can use the equivalent `loom operator token create` and `loom daemon start` commands.

By default the control plane is enabled on `127.0.0.1:4777`. State, operator credentials, sessions, audit entries, and control events use the same `.loom/loom.db` database (or the database selected by `LOOM_DB`).

## Configuration

Add `controlPlane` to `.loom/config.json`:

```json
{
  "controlPlane": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 4777,
    "readOnly": false,
    "sessionTtlMs": 28800000,
    "sessionIdleMs": 1800000
  }
}
```

`LOOM_CONTROL_HOST` and `LOOM_CONTROL_PORT` override `controlPlane.host` and `controlPlane.port`. `enabled: false` prevents the listener from starting. `readOnly: true` rejects API mutations except logout. The default absolute session lifetime is eight hours and the default idle limit is 30 minutes.

### Non-local listeners

A host other than `127.0.0.1`, `::1`, or `localhost` is rejected at startup unless **all** of the following are configured:

- native TLS, using both `tlsCertFile` and `tlsKeyFile`;
- an `https://` `publicOrigin`;
- `cookieSecure: true`; and
- `allowedOrigins` containing that exact normalized origin (scheme, host, and port).

Example:

```json
{
  "controlPlane": {
    "host": "0.0.0.0",
    "port": 4777,
    "tlsCertFile": "/etc/loom/tls/cert.pem",
    "tlsKeyFile": "/etc/loom/tls/key.pem",
    "publicOrigin": "https://loom.example.com:4777",
    "allowedOrigins": ["https://loom.example.com:4777"],
    "cookieSecure": true
  }
}
```

The certificate and private-key files are read when the daemon starts. `allowedOrigins` is an exact allowlist, not a wildcard or suffix list. A reverse proxy does not replace the listener's current native-TLS requirement for non-local binding.

## Runtime boundaries

The control plane exposes current daemon data and a bounded set of actions: job cancellation/retry, schedule changes, and approval decisions. It applies request and login rate limits, JSON/body limits, session expiry, origin checks, CSRF checks, security headers, audit logging, and a capacity limit for SSE clients.

V0.9 is not a general remote-management or distributed-control system. Its route view describes current controller-to-worker reachability. It does **not** implement NAT traversal, P2P transport, a VPN, relay transport, a mesh, consensus, or distributed storage.

See [Operator authentication](operator-auth.md), [Control API](control-api.md), [Loom addressing](loom-addressing.md), and [Routes](routes.md).
