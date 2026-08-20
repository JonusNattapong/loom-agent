// Public SDK only. Registers a bot with a custom BotTransport adapter.
import {createLoomApp, defineAgent, defineBot, type BotTransport} from "@loom-agent/sdk";

class ConsoleTransport implements BotTransport {
  private handler?: (event: unknown) => void;
  async start() { console.log("[bot] transport started"); }
  async stop() { console.log("[bot] transport stopped"); }
  async send(message: unknown) { console.log("[bot] send:", JSON.stringify(message)); }
  onEvent(handler: (event: unknown) => void) { this.handler = handler; }
}

const app = createLoomApp({
  name: "bot-example",
  provider: {id: process.env.LOOM_PROVIDER ?? "mock"},
  agents: [defineAgent({id: "assistant", role: "general", goal: "Answer questions"})],
  bots: [
    defineBot({
      id: "cli-bot",
      agent: "assistant",
      transport: new ConsoleTransport(),
      description: "Echoes outbound messages to the console.",
    }),
  ],
});

console.log("bot example registered ok");
await app.stop();
