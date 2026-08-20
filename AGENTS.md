# Repository Guidelines

## Project Structure & Module Organization

Loom is a TypeScript npm workspace. Public packages live under `packages/` (for example, `packages/sdk`, `packages/cli`, `packages/runtime`, and `packages/providers`); each package keeps source and colocated tests in `src/`. Shared documentation is in `docs/`, runnable examples are in `examples/`, build/check scripts are in `scripts/`, and GitHub Actions are in `.github/workflows/`. Keep package boundaries intact and add dependencies through the workspace manifests rather than importing private implementation files.

## Build, Test, and Development Commands

Run these from the repository root:

- `npm ci` — install the locked dependency graph.
- `npm run build` — compile TypeScript project references and build the web package.
- `npm test` — run the Vitest suite once (use `npm run test:watch` while developing).
- `npm run eval` — execute the evaluation harness in `packages/evals`.
- `npm run check:packages` — validate publishable package metadata and dependency references.
- `npm run loom -- <args>` — run the CLI locally through `tsx`.

Before a pull request, run at least `npm run check:packages`, `npm run build`, and `npm test`.

## Coding Style & Naming Conventions

Use TypeScript with strict project settings, two-space indentation, semicolons, and single-quoted strings where the surrounding file follows that style. Use `camelCase` for variables/functions, `PascalCase` for types/classes, and kebab-case for CLI flags and documentation filenames. Keep tests beside the implementation as `*.test.ts`. Ensure `git diff --check` is clean; no repository-wide formatter is currently required.

## Testing Guidelines

Vitest is the test framework. Name tests after the behavior or module under test and prefer deterministic unit tests; platform-specific process tests should guard Windows versus POSIX behavior. Add or update tests with every behavior change and run `npm test` before committing.

## Commit & Pull Request Guidelines

Use Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `build:`, `ci:`, and `chore:` (examples: `fix(build): ...`, `ci: ...`). Pull requests should explain the user-visible impact, summarize validation commands, call out platform or package changes, and link relevant issues. Include screenshots only when changing the web UI.

## Releases and Security

For publishable changes, run `npx changeset` and commit the generated file in `.changeset/`; the release workflow creates the version/changelog PR. Never commit tokens or credentials. npm publishing uses the GitHub `NPM_TOKEN` secret and requires the npm scope to grant the repository publish access.
