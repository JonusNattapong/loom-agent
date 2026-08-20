import {describe,it,expect} from "vitest";
import {AgentLoop} from "./index.js";
import {StateStore} from "@loom-agent/state";
import {MockProvider} from "@loom-agent/providers";
describe("AgentLoop",()=>{it("runs and resumes a durable agent",async()=>{const s=new StateStore(":memory:");const loop=new AgentLoop(s,new MockProvider());const a=await loop.run("ship it");expect(a.status).toBe("completed");expect(s.getCheckpoint(a.id)?.result).toContain("ship it");const resumed=await loop.resume(a.id);expect(resumed.status).toBe("completed");expect(s.getTrace(a.id).some(x=>x.type==="agent.started")).toBe(true);});});
