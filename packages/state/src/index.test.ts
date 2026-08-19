import {describe,it,expect} from "vitest";
import {StateStore} from "./index.js";
describe("StateStore",()=>{it("persists agents, checkpoints, and traces",()=>{const s=new StateStore(":memory:");const a=s.createAgent("hello","agent-1");s.saveCheckpoint({agentId:a.id,step:1,messages:[{role:"user",content:"hello"}],status:"running"});s.addTrace(a.id,"test.event",{ok:true});expect(s.getCheckpoint(a.id)?.step).toBe(1);expect(s.getTrace(a.id)).toHaveLength(1);s.updateAgent(a.id,"completed","done");expect(s.getAgent(a.id)?.status).toBe("completed");});});
