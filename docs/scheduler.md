# Persistent scheduler

Schedules are stored in SQLite and materialized transactionally into jobs. V0.7 supports one-shot ISO timestamps, minute/hour/day intervals, and a bounded five-field cron form. Timezone is persisted with each schedule. Due occurrence identity is `scheduleId + intendedRunAt`, preventing duplicate logical jobs after restart. Paused schedules are disabled; one-shot schedules disable after materialization.

```bash
loom schedule add --at "2026-08-20T09:00:00+07:00" --goal "Inspect failures"
loom schedule add --every 30m --goal "Check pending work"
loom schedule add --cron "0 8 * * *" --timezone Asia/Bangkok --goal "Daily status"
loom schedules
loom schedule pause <id>
loom schedule resume <id>
loom schedule delete <id>
```

The local implementation uses `run_once`-style bounded materialization; advanced catch-up/DST semantics remain future work.
