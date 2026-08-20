# Contributing

Thanks for contributing to Loom.

## Development

```bash
bun install        # or npm ci
npm run build      # tsc -b across all packages
npm test           # vitest across all packages
npm run eval       # capability/eval scenarios
npm audit          # dependency audit (must be 0 vulns before merge)
```

## API stability rules

- **Public** exports in `@loom-agent/sdk` are a promise (see `docs/versioning.md`).
  Removing or renaming one is a breaking change: bump the major and document it
  in `CHANGELOG.md`. The public API snapshot test will fail CI if you remove a
  stable export by accident.
- **Experimental** APIs must be marked `@experimental` in code and docs.
- **Internal** code lives under `dist/internal` or `*-private`; never import it
  from another package or from examples.

## Pull requests

1. Branch from `main` (e.g. `agent/loom-v1`).
2. Keep changes focused; add or update tests.
3. Run `npm run build && npm test && npm run eval && npm audit` green.
4. Run `loom doctor` against a scratch workspace if you touched the CLI/config.
5. Open a Draft PR; move to Ready only after the hardening review
   (API/SDK, packaging, security, migration, docs).

## Commit style

Conventional, small, and reviewable. Reference issues where relevant.
