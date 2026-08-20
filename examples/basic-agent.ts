// Public SDK only. Runs a single agent goal with the embedded runtime.
import {createLoomApp, defineAgent} from "@loom/sdk";

const app = createLoomApp({
  name: "basic-example",
  provider: {id: process.env.LOOM_PROVIDER ?? "mock"},
  agents: [
    defineAgent({
      id: "main",
      role: "planner",
      goal: "Summarize the project README in three bullet points.",
      maxRounds: 4,
    }),
  ],
});

const agent = await app.run({goal: "Summarize the project README in three bullet points.", agent: "main"});
console.log("status:", agent.status);
console.log("result:", agent.result);
await app.stop();
