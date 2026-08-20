# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | ✅ |
| 0.9.x | ⚠️ security fixes only |
| < 0.9 | ❌ |

## Reporting a vulnerability

Do **not** open a public issue for security vulnerabilities. Report privately
to the maintainers via the repository's private advisory feature, or email the
security contact listed in the repository. Include:

- A description of the issue and its impact.
- Steps to reproduce (minimal, ideally without live credentials).
- Affected version(s) and environment.

You will receive an acknowledgement within a few business days.

## Security boundaries (V1.0)

- **Control plane** defaults to `127.0.0.1`. Non-local exposure requires
  explicit TLS + HTTPS + exact `allowedOrigins`. Never expose it over plain
  HTTP on a routable interface.
- **Operator tokens, worker credentials, provider keys, and session secrets**
  are never logged or returned in API/UI responses. Raw `Authorization`
  headers are not persisted.
- **Trace redaction** removes Bearer tokens, `sk-`/`pk-` keys, AWS `AKIA`/
  `ASIA`, GitHub/Slack tokens, JWTs, and PEM blocks before storage.
- **Agent / tool / trace output is treated as untrusted text.** The web UI
  escapes it; no raw HTML injection.
- **Logical identity** (`loom://worker/gpu-01`) is separate from route
  (connection/epoch) and from lease/fencing authority.
- **Remote workers** are fenced; a worker advertising a different
  `PROTOCOL_MAJOR` is rejected at the handshake.

## Scope exclusions

Loom V1.0 is not a distributed-systems security product: it does not implement
multi-controller HA, consensus, or a relay/mesh transport. Deploy behind your
own network controls for production exposure.
