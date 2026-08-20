---
title: Versioning and API stability
version: 1.1
category: reference
---

# Versioning and API stability

Loom V1.1 separates three API tiers so application code never depends on
internal implementation details.

## Public / Experimental / Internal

- **Public** — stable contracts. Listed in `docs/sdk.md`. Breaking changes
  require a major version bump and a documented migration window.
- **Experimental** — marked `@experimental` in code and docs (e.g. the Agent
  Arena `WorldAdapter` foundation). May change within a minor release; opt in
  explicitly.
- **Internal** — anything in `@loom/*/dist/internal/...` or `*/private`. Not
  covered by any compatibility promise. Applications that import these will
  break without notice.

## Version axes

| Axis | Constant | V1.1 value | Meaning |
| --- | --- | --- | --- |
| SDK / npm | `SDK_API_VERSION` | `1.1.0` | Public SDK surface. |
| Remote protocol major | `PROTOCOL_MAJOR` | `1` | Worker/controller wire compatibility. |
| State schema | `SCHEMA_VERSION` | `13` | SQLite migration level. |

## Upgrade policy

1. Read `CHANGELOG.md` for the target version.
2. Run `loom doctor` to surface config/schema/provider issues before upgrading.
3. Back up the database: `loom db backup` (or copy `.loom/loom.db`).
4. Apply the new version; migrations run automatically on first start.
5. Run your SDK / integration tests; the public API snapshot test fails CI if a
   stable export is removed accidentally.

## Explicit non-goals (V1.1)

Loom V1.1 does **not** provide: multi-controller high availability, distributed
consensus or storage, a full mesh/overlay network, NAT traversal, STUN/TURN/ICE
relay transport, or a universal exactly-once guarantee for external side
effects. Logical addressing and route abstraction are supported; distributed
systems primitives are out of scope.
