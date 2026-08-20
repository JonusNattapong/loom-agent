import {describe,expect,it} from "vitest";
import type {AgentResult,PlanTask} from "@loom-agent/core";
import {PlanEngine} from "@loom-agent/planner";
import {StateStore} from "@loom-agent/state";
import {AgentCoordinator,MultiAgentRuntime} from "./index.js";

function setup(goal="create file"){
  const state=new StateStore(":memory:");
  const root=state.createAgentRecord({id:"root",goal,role:"planner"});
  const plan=new PlanEngine(state).create(root.id,goal);
  return {state,root,plan};
}

describe("multi-agent coordinator",()=>{
  it("persists child identity, delegation, messages, leases, results, and artifacts",async()=>{
    const {state,root}=setup();
    const runtime=new MultiAgentRuntime(state,{execute:async(_agent,task):Promise<AgentResult>=>({status:"completed",summary:`done ${task.title}`,artifacts:task.kind==="execute"?[{path:"result.txt",operation:"created"}]:[]})});
    const result=await runtime.run(root.id);
    expect(result.status).toBe("completed");
    expect(state.listAgents(root.id).length).toBe(4);
    expect(state.listDelegations(root.id)).toHaveLength(3);
    expect(state.listArtifactsForRoot(root.id)[0].path).toBe("result.txt");
    expect(state.listTaskLeases().every(lease=>lease.status==="released")).toBe(true);
    expect(state.getTrace(root.id,true).some(event=>event.type==="result.handoff")).toBe(true);
  });

  it("runs independent tasks with bounded concurrency",async()=>{
    const state=new StateStore(":memory:");const root=state.createAgentRecord({id:"root",goal:"parallel",role:"planner"});const plan=state.createPlan(root.id,root.goal);
    state.addPlanTask({id:"one",planId:plan.id,title:"one",kind:"execute",position:0});state.addPlanTask({id:"two",planId:plan.id,title:"two",kind:"execute",position:1});
    let active=0;let peak=0;
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const runtime=new MultiAgentRuntime(state,{execute:async()=>{active++;peak=Math.max(peak,active);if(active===2)release();await gate;active--;return {status:"completed",summary:"done"};}},{maxConcurrent:2});
    await runtime.run(root.id);expect(peak).toBe(2);expect(state.getPlan(plan.id)?.status).toBe("completed");
  });

  it("recovers a persisted child result exactly once after parent interruption",async()=>{
    const {state,root}=setup("simple goal");let interrupted=false;
    const crashing=new MultiAgentRuntime(state,{execute:async()=>({status:"completed",summary:"durable"})},{afterResultPersisted:()=>{if(!interrupted){interrupted=true;throw new Error("simulated parent crash");}}});
    await expect(crashing.run(root.id)).rejects.toThrow("simulated parent crash");
    const resumed=new MultiAgentRuntime(state,{execute:async()=>({status:"completed",summary:"unexpected duplicate"})});
    await resumed.resume(root.id);
    const first=state.listDelegations(root.id)[0];expect(state.getAgentResultByDelegation(first.id)?.summary).toBe("durable");
    expect(state.getAgentMessage(`message_result_${first.id}`)?.acknowledgedAt).toBeTruthy();
  });

  it("resumes the same child after approval",async()=>{
    const {state,root}=setup("simple goal");let calls=0;let childId="";
    const runtime=new MultiAgentRuntime(state,{execute:async(agent,task)=>{calls++;if(task.kind==="inspect"){childId=agent.id;const request=state.createApproval({agentId:agent.id,taskId:task.id,toolCallId:`${task.id}:restricted`,toolName:"shell",input:{command:"restricted"}});if(request.status!=="approved"){const error=new Error("approval required") as Error&{failurePolicy:"needs_approval"};error.failurePolicy="needs_approval";throw error;}}return {status:"completed",summary:"approved"};}});
    expect((await runtime.run(root.id)).status).toBe("waiting");const approval=state.listApprovals(childId)[0];state.resolveApproval(approval.id,"approved");
    expect((await runtime.resume(root.id)).status).toBe("completed");expect(calls).toBe(4);expect(state.listAgents(root.id).filter(agent=>agent.parentAgentId).map(agent=>agent.id)).toContain(childId);
  });

  it("cancels an agent subtree and active lease safely",()=>{
    const {state,root,plan}=setup();const coordinator=new AgentCoordinator(state);const task=state.listPlanTasks(plan.id)[0];const delegation=coordinator.delegate({parentAgentId:root.id,taskId:task.id,goal:task.title,role:"researcher"});state.acquireTaskLease(task.id,delegation.childAgentId);state.updateAgent(delegation.childAgentId,"running");
    coordinator.cancelAgent(root.id);
    expect(state.listAgents(root.id).every(agent=>agent.status==="cancelled")).toBe(true);expect(state.listTaskLeases()[0].status).toBe("cancelled");
  });
});
