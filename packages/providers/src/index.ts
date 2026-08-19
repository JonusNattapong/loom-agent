import type {Message,Provider} from "@loom/core";
export class MockProvider implements Provider {
  readonly name="mock";
  async complete(messages:Message[]):Promise<{content:string}>{const task=messages.find(m=>m.role==="user")?.content??"";return {content:`Completed task: ${task}`};}
}
