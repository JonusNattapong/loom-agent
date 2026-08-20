# Loom V1.0 Examples

These examples use **only the public `@loom-agent/sdk` and `@loom-agent/config` APIs**.
They never import `@loom-agent/*/dist/internal/...` or any `*/private` path.

Run an example from this directory after building the workspace:

```bash
npm run build          # from repo root
cd examples
npm install
npx tsx basic-agent.ts
```

The default provider is `mock` (deterministic, no network). Set
`LOOM_PROVIDER=openai` and `LOOM_API_KEY=...` for real model output.

| Example | Shows |
| --- | --- |
| `basic-agent.ts` | `createLoomApp` + `defineAgent` + `app.run(goal)` (embedded runtime) |
| `multi-agent.ts` | role-scoped agents + tool/skill registration |
| `scheduled-agent.ts` | daemon + scheduler via `app.start()` and the CLI schedule commands |
| `remote-worker.ts` | remote worker connect + dispatch through the coordinator |
| `bot.ts` | `defineBot` with a `BotTransport` adapter |
| `world-adapter.ts` | Agent Arena `FakeWorldAdapter` foundation (experimental) |
