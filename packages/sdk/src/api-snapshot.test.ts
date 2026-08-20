import {describe, it, expect} from "vitest";
import * as sdk from "./index.js";
import type {AgentRole,Provider,ToolDefinition,LoomEvent,LoomAddress,LoomRoute,WorkerCapability,WorldAdapter} from "./contracts.js";

/** Guards the public SDK contract: accidental removals fail CI. */
describe("@loom-agent/sdk public API snapshot", () => {
  const runtimeExports = [
    "defineAgent",
    "defineTool",
    "defineSkill",
    "defineBot",
    "createLoomApp",
    "defineLoomApp",
    "LoomApp",
    "SDK_API_VERSION",
    "PROTOCOL_MAJOR",
    "SCHEMA_VERSION",
    "FakeWorldAdapter",
    "LoomClient",
  ];
  for (const name of runtimeExports) {
    it(`exports ${name}`, () => {
      expect((sdk as Record<string, unknown>)[name]).toBeDefined();
    });
  }
});


/** Type-level contract presence (compiled by tsc; not executed). */
type _ContractTypesPresent =
  | AgentRole | Provider | ToolDefinition | LoomEvent | LoomAddress | LoomRoute | WorkerCapability | WorldAdapter | WorldAdapter<unknown, unknown>;
const _typeGuard: _ContractTypesPresent | null = null;
void _typeGuard;
