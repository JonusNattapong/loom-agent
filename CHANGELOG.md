# Changelog

All notable changes to Loom are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and Loom adheres to its own
public/experimental/internal API tiers (see `docs/versioning.md`).

## [1.1.0] — Unreleased

### Added

- Cross-platform process recovery coverage for Windows and POSIX hosts.
- Ubuntu and Windows CI coverage on Node 22 and Node 24.
- Publish metadata and a coordinated `1.1.0` package graph.
- Unified adaptive tool definitions for CLI and SDK daemon execution.

### Changed

- Remote process fixtures use portable `file:` URLs and stdin control messages.
- SDK daemon jobs route tool calls through durable permissions, approvals,
  idempotency, tracing, and artifact recording.

## [1.0.0] — V1.0 Unified Agent Platform

**Stabilization / productization / public-contract / developer-experience
milestone.** V1.0 makes existing durable capabilities a stable, installable
platform with versioned public developer contracts. It does **not** add another
large distributed-systems subsystem.

### Added
- `@loom/sdk` (1.0.0): stable public developer SDK — `defineAgent`,
  `defineTool`, `defineSkill`, `defineBot`, `createLoomApp`, `defineLoomApp`,
  `LoomApp`, plus stable contract types. Heavy runtime packages are optional
  peer dependencies loaded lazily.
- `@loom/config` (1.0.0): versioned config schema (`schemaVersion: 1`),
  helpful validation errors with JSON-pointer-style paths, precedence
  (CLI > env > project > user > defaults), and `writeStarterConfig`.
- CLI productization: `loom init`, `loom doctor` (`--json`), `loom version` /
  `--version`, `loom config validate`, `--json` on inspection commands, and a
  `doctor` compatibility report.
- Control API `/api/v1` contract hardened with an OpenAPI 3.0 document
  (`packages/control/openapi.json`).
- `LoomClient` HTTP client for `/api/v1`.
- Agent Arena `WorldAdapter` / `FakeWorldAdapter` foundation (experimental).
- Remote-worker protocol bumped to `PROTOCOL_MAJOR = 1`; mismatched major is
  rejected at the handshake.
- Public API snapshot test guarding stable SDK exports.
- Examples (`examples/`) using only public SDK APIs.

### Changed
- All packages versioned to `1.0.0`; root `loom` meta-package `1.0.0`.
- Control plane and remote worker require TLS + HTTPS + exact `allowedOrigins`
  for any non-loopback exposure (unchanged security boundary from V0.9).
- Config shape is now `{schemaVersion, name, provider: {id, model}, ...}`;
  the legacy flat shape is rejected by validation with a clear error.

### Preserved (unchanged guarantees)
- `ToolExecutor`: permissions, approval, idempotency, tracing.
- Recovery (SQLite authoritative), scheduler, cancellation, leases/fencing.
- Remote worker recovery, logical addressing (`loom://worker/...`), route
  abstraction, secure-cookie auth, trace redaction.

### Known limitations
See `docs/versioning.md` and `docs/limitations.md`. V1.0 does not provide HA,
distributed consensus/storage, mesh/overlay networking, NAT traversal, or
universal exactly-once external side effects.
