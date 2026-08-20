// Public SDK only. Role-scoped agents + a registered tool.
import {createLoomApp, defineAgent, defineTool} from "@loom-agent/sdk";

const app = createLoomApp({
  name: "multi-example",
  provider: {id: process.env.LOOM_PROVIDER ?? "mock"},
  agents: [
    defineAgent({id: "planner", role: "planner", goal: "Plan the work", tools: ["word_count"]}),
    defineAgent({id: "coder", role: "coder", goal: "Implement the work"}),
  ],
  tools: [
    defineTool({
      name: "word_count",
      description: "Count words in a string",
      inputSchema: {type: "object", properties: {text: {type: "string"}}, required: ["text"]},
      execute: async (input) => `words: ${String(input.text ?? "").split(/\s+/).filter(Boolean).length}`
    }),
  ],
});

const planner = await app.run({goal: "Plan the work", agent: "planner"});
console.log("planner status:", planner.status);
await app.stop();
