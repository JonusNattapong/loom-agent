// Public SDK only. Starts the durable daemon. Recurring work is registered
// with `loom schedules add` (see docs/scheduler.md).
import {createLoomApp, defineAgent} from "@loom-agent/sdk";

const app = createLoomApp({
  name: "scheduled-example",
  provider: {id: process.env.LOOM_PROVIDER ?? "mock"},
  agents: [defineAgent({id: "main", role: "planner", goal: "Run the nightly report"})],
});

const handle = await app.start();
console.log("daemon started:", handle.daemonId, "control:", handle.controlUrl ?? "(not enabled)");
console.log("Register recurring work: loom schedules add --kind cron --expr '0 2 * * *' --goal 'nightly report'");
await new Promise((r) => setTimeout(r, 500));
await app.stop();
