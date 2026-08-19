import type {AgentResult} from "@loom/core";
import {AgentCoordinator,MultiAgentRuntime} from "@loom/coordinator";
import {PlanEngine,VerifiedExecutionRuntime} from "@loom/planner";
import {StateStore} from "@loom/state";
import {ToolExecutor,ToolRegistry} from "@loom/tools";
import {ModelAdaptivePlanner,MultiRoundExecutor,selectRole} from "@loom/adaptive";
import type {Provider,ProviderResponse} from "@loom/core";

export type EvalResult={name:string;passed:boolean;details:string};

async function graphScenario(name:string,options:{artifacts?:number;crash?:boolean;rejectOnce?:boolean;alwaysReject?:boolean}):Promise<EvalResult>{
  const state=new StateStore(":memory:");const agent=state.createAgent(name,`agent-${name}`);const plan=new PlanEngine(state).create(agent.id,"fix all failing tests");let reviews=0;
  const runtime=new VerifiedExecutionRuntime(state,{execute:async task=>({result:"done",artifacts:task.kind==="execute"?Array.from({length:options.artifacts??0},(_,index)=>({path:`src/file-${index}.ts`,operation:"modified" as const})):[]})},{verify:async()=>{reviews++;const passed=options.alwaysReject?false:options.rejectOnce?reviews>1:true;return {passed,summary:passed?"passed":"failed"};}});
  if(options.crash){const paused=await runtime.run(plan.id,{maxTasks:2});if(paused.status!=="paused")return {name,passed:false,details:"did not pause"};await runtime.resume(agent.id);}else await runtime.run(plan.id);
  const final=state.getPlan(plan.id)!;const expected=options.alwaysReject?"failed":"completed";const artifacts=state.listArtifacts(agent.id).length;
  return {name,passed:final.status===expected&&artifacts===(options.artifacts??0),details:`status=${final.status}; artifacts=${artifacts}`};
}

function multiSetup(goal="local multi-agent goal"){
  const state=new StateStore(":memory:");const root=state.createAgentRecord({id:"root",goal,role:"planner"});const plan=state.createPlan(root.id,goal);return {state,root,plan};
}
async function scenario(name:string,run:()=>Promise<string>):Promise<EvalResult>{try{return {name,passed:true,details:await run()};}catch(error){return {name,passed:false,details:error instanceof Error?error.message:String(error)};}}
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}

async function multiAgentScenarios():Promise<EvalResult[]>{
  const results:EvalResult[]=[];
  results.push(await scenario("v0.4 parent to coder",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"code",planId:plan.id,title:"modify file",kind:"execute",position:0});
    await new MultiAgentRuntime(state,{execute:async()=>({status:"completed",summary:"file changed",artifacts:[{path:"src/file.ts",operation:"modified"}]})}).run(root.id);
    const child=state.listChildren(root.id)[0];assert(child.role==="coder","coder was not spawned");assert(state.listArtifactsForRoot(root.id).length===1,"artifact was not handed off");return `child=${child.id}; status=${state.getAgent(root.id)?.status}`;
  }));
  results.push(await scenario("v0.4 researcher to coder handoff",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"research",planId:plan.id,title:"research behavior",kind:"inspect",position:0});state.addPlanTask({id:"code",planId:plan.id,title:"apply finding",kind:"execute",dependencies:["research"],position:1});let consumed=false;
    await new MultiAgentRuntime(state,{execute:async(agent,task,context)=>{if(task.id==="research"){state.putScopedMemory({agentId:agent.id,scope:"root-task",visibility:"team-visible",key:"finding",value:"use parser v2"});return {status:"completed",summary:"found parser behavior"};}consumed=context.memory.some(entry=>entry.key==="finding");return {status:"completed",summary:"implemented from finding"};}}).run(root.id);
    assert(consumed,"coder did not receive summarized research memory");return "research summary consumed by coder";
  }));
  results.push(await scenario("v0.4 coder reviewer repair",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"code",planId:plan.id,title:"fix parser",kind:"execute",maxRetries:2,position:0});state.addPlanTask({id:"review",planId:plan.id,title:"review diff",kind:"verify",dependencies:["code"],maxRetries:2,position:1});let reviews=0;let coding=0;
    await new MultiAgentRuntime(state,{execute:async(_agent,task):Promise<AgentResult>=>{if(task.kind==="execute"){coding++;return {status:"completed",summary:"fixed"};}reviews++;return reviews===1?{status:"failed",summary:"tests fail",failurePolicy:"retryable"}:{status:"completed",summary:"accepted"};}}).run(root.id);
    assert(reviews===2&&coding===2,"review rejection did not trigger repair");return `coding=${coding}; reviews=${reviews}`;
  }));
  results.push(await scenario("v0.4 bounded parallel tasks",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"one",planId:plan.id,title:"one",kind:"execute",position:0});state.addPlanTask({id:"two",planId:plan.id,title:"two",kind:"execute",position:1});let active=0;let peak=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    await new MultiAgentRuntime(state,{execute:async()=>{active++;peak=Math.max(peak,active);if(active===2)release();await gate;active--;return {status:"completed",summary:"done"};}},{maxConcurrent:2}).run(root.id);
    assert(peak===2,"independent tasks did not overlap");return `peak=${peak}`;
  }));
  results.push(await scenario("v0.4 child crash resume",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"work",planId:plan.id,title:"recover child",kind:"execute",position:0});state.updatePlanTask("work","running");const coordinator=new AgentCoordinator(state);const delegation=coordinator.delegate({parentAgentId:root.id,taskId:"work",goal:"recover child",role:"coder",childAgentId:"child"});state.acquireTaskLease("work",delegation.childAgentId,-1);state.updateDelegation(delegation.id,"running");state.updateAgent(delegation.childAgentId,"running");let calls=0;
    await new MultiAgentRuntime(state,{execute:async()=>{calls++;return {status:"completed",summary:"recovered"};}}).resume(root.id);
    assert(calls===1,"recovered task executed more than once");assert(state.listChildren(root.id).length===1,"duplicate child created");return `child=${delegation.childAgentId}; executions=${calls}`;
  }));
  results.push(await scenario("v0.4 parent crash before consume",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"work",planId:plan.id,title:"durable result",kind:"execute",position:0});let crashed=false;
    const first=new MultiAgentRuntime(state,{execute:async()=>({status:"completed",summary:"persisted"})},{afterResultPersisted:()=>{if(!crashed){crashed=true;throw new Error("parent crashed");}}});await first.run(root.id).catch(()=>undefined);
    await new MultiAgentRuntime(state,{execute:async()=>({status:"completed",summary:"duplicate"})}).resume(root.id);const delegation=state.listDelegations(root.id)[0];
    assert(state.getAgentResultByDelegation(delegation.id)?.summary==="persisted","persisted result was replaced");assert(state.getAgentMessage(`message_result_${delegation.id}`)?.acknowledgedAt,"result was not acknowledged");return "result consumed exactly once";
  }));
  results.push(await scenario("v0.4 cancellation hierarchy",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"work",planId:plan.id,title:"active",kind:"execute",position:0});const coordinator=new AgentCoordinator(state);const delegation=coordinator.delegate({parentAgentId:root.id,taskId:"work",goal:"active",role:"coder"});state.acquireTaskLease("work",delegation.childAgentId);coordinator.cancelAgent(root.id);
    assert(state.listAgents(root.id).every(agent=>agent.status==="cancelled"),"descendant was not cancelled");assert(state.listTaskLeases()[0].status==="cancelled","lease remained active");return "root and descendants cancelled";
  }));
  results.push(await scenario("v0.4 child approval resume",async()=>{
    const {state,root,plan}=multiSetup();state.addPlanTask({id:"work",planId:plan.id,title:"restricted",kind:"execute",position:0});let child="";
    const runtime=new MultiAgentRuntime(state,{execute:async agent=>{child=agent.id;const request=state.createApproval({agentId:agent.id,taskId:"work",toolCallId:"restricted-call",toolName:"shell",input:{command:"restricted"}});if(request.status!=="approved"){const error=new Error("approval required") as Error&{failurePolicy:"needs_approval"};error.failurePolicy="needs_approval";throw error;}return {status:"completed",summary:"approved"};}});
    assert((await runtime.run(root.id)).status==="waiting","root did not wait");state.resolveApproval(state.listApprovals(child)[0].id,"approved");assert((await runtime.resume(root.id)).status==="completed","approved child did not resume");assert(state.listChildren(root.id).length===1,"approval spawned a duplicate child");return `resumed=${child}`;
  }));
  return results;
}


class AdaptiveEvalProvider implements Provider { readonly name="adaptive-eval"; private round=0; async complete():Promise<ProviderResponse>{this.round++; return this.round===1?{content:JSON.stringify({summary:"cycle",tasks:[{id:"a",title:"a",description:"a",role:"coder",dependencies:["b"]},{id:"b",title:"b",description:"b",role:"coder",dependencies:["a"]}]})}:{content:"done"};} }
async function adaptiveScenarios():Promise<EvalResult[]> {
 const planner=new ModelAdaptivePlanner({provider:new AdaptiveEvalProvider(),maxTasks:20,maxDepth:5}); const proposal=await planner.plan({goal:"fix tests",availableRoles:["researcher","coder","tester"]});
 const routed=selectRole(["code-editing","testing"],[{role:"researcher",capabilities:["research"]},{role:"coder",capabilities:["code-editing","testing"]}]);
 let calls=0; const execution=await new MultiRoundExecutor({name:"rounds",complete:async()=>({content:"done"})},{tool:async()=>{calls++;return "ok"}},{maxModelRounds:2}).run({taskId:"eval",goal:"fix",messages:[{role:"user",content:"fix"}]});
 return [{name:"v0.6 planner fallback",passed:proposal.source==="fallback"&&proposal.tasks.length===3,details:`source=${proposal.source}; tasks=${proposal.tasks.length}`},{name:"v0.6 capability routing",passed:routed.role==="coder",details:`role=${routed.role}`},{name:"v0.6 execution bounds",passed:execution.status==="completed"&&calls===0,details:`status=${execution.status}; rounds=${execution.rounds}`}];
}

export async function runEvalHarness():Promise<EvalResult[]>{
  const results=await Promise.all([graphScenario("fix failing tests",{rejectOnce:true}),graphScenario("create file",{artifacts:1}),graphScenario("modify multiple files",{artifacts:3}),graphScenario("crash + resume",{crash:true}),graphScenario("failed verification",{alwaysReject:true})]);
  const registry=new ToolRegistry().register({name:"danger",description:"danger",execute:async()=>"unexpected"});
  try{await new ToolExecutor(registry,{permissions:{danger:"deny"}}).execute("danger",{});results.push({name:"denied tool call",passed:false,details:"tool executed"});}catch{results.push({name:"denied tool call",passed:true,details:"denied"});}
  return [...results,...await multiAgentScenarios(),...await adaptiveScenarios()];
}
