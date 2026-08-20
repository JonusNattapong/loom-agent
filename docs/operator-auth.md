# V0.9 operator authentication

The V0.9 control plane uses a one-time bearer-token exchange followed by an HttpOnly cookie session and CSRF protection. The long-lived operator token is not used as the API session credential.

## Create and exchange a token

```bash
loom operator token create --name local-admin
# In this repository: npm run loom -- operator token create --name local-admin
```

Loom prints the random token once and stores only its SHA-256 hash. Treat the printed value as a secret.

The login page sends it only in the `Authorization` header:

```http
POST /api/v1/auth/login
Authorization: Bearer <operator-token>
```

On success, the server creates a durable session, returns a CSRF token in JSON, and sets an HttpOnly, `SameSite=Strict` cookie. Local HTTP uses `loom_session`; secure HTTPS uses the `Secure` `__Host-loom_session` cookie. The browser UI keeps the operator token only for the exchange and clears its input afterward.

The default absolute lifetime is eight hours and the default idle limit is 30 minutes. They are configurable as `controlPlane.sessionTtlMs` and `controlPlane.sessionIdleMs`.

## Session and CSRF flow

After login:

1. Send the session cookie on API requests.
2. `GET /api/v1/auth/session` validates the session, rotates the CSRF secret, and returns the new `csrfToken`.
3. For `POST`, `PATCH`, or `DELETE` mutations, send both `Origin: <exact allowed origin>` and `X-CSRF-Token: <current token>`.
4. `POST /api/v1/auth/logout` also requires the exact origin and CSRF token; it revokes the session and expires the cookie.

Reads require the cookie but not CSRF. Login accepts an `Origin`-less non-browser request, but rejects a supplied origin that is not allowed. Mutations always require an allowed Origin. The SSE stream requires the cookie and validates Origin when one is supplied.

Example with curl on the default listener:

```bash
origin=http://127.0.0.1:4777
curl -i -c cookies.txt -H "Authorization: Bearer $LOOM_OPERATOR_TOKEN"   -X POST "$origin/api/v1/auth/login"
# Copy csrfToken from the JSON response.
curl -b cookies.txt -H "Origin: $origin" -H "X-CSRF-Token: $CSRF"   -X POST "$origin/api/v1/jobs/JOB_ID/cancel"
```

## Security notes

- Never put the operator token in a URL, query string, JSON body, log, or committed config file.
- Non-local binding is refused without native TLS, an HTTPS public origin, secure cookies, and an exact allowlist containing that origin. See [Control plane](control-plane.md).
- Session and CSRF values are random; their hashes are stored in SQLite.
- Login failures use a generic invalid-credentials response and login attempts have a stricter rate limit.
- Successful login/logout and control mutations create audit records available to authenticated operators at `GET /api/v1/audit`.

V0.9's CLI creates operator credentials. It does not currently provide CLI commands to list, rotate, disable, or revoke operator credentials.
