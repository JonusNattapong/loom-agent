import type {
  Agent,AgentMessage,AgentMessageType,AgentResult,AgentRole,Delegation,FailurePolicy,
  Plan,PlanTask,RoleDefinition,ToolDefinition,Visibility,
} from "@loom-agent/core";
import {ContextCompiler} from "@loom-agent/context";
import {TaskGraphRuntime} from "@loom-agent/planner";
import {StateStore} from "@loom-agent/state";
import {RoleRegistry} from "./roles.js";

export {RoleRegistry} from "./roles.js";

export type SpawnAgentInput={parentAgentId?:string;rootAgentId?:string;role:AgentRole;goal:string;id?:string};
export type DelegationInput={parentAgentId:string;taskId?:string;goal:string;role:AgentRole;childAgentId?:string;delegationId?:string};
export type AgentExecutionContext={rootAgentId:string;goal:string;assignedTask:PlanTask;role:RoleDefinition;system:string;memory:Array<{key:string;value:string}>;incomingMessages:AgentMessage[];parentContext?:string;allowedTools:ToolDefinition[]};
export interface AgentWorker{execute(agent:Agent,task:PlanTask,context:AgentExecutionContext):Promise<AgentResult>}

function policyFrom(error:unknown):FailurePolicy|"cancelled"{
  return ((error as {failurePolicy?:FailurePolicy})?.failurePolicy??"retryable");
}
function roleFor(task:PlanTask):AgentRole{
  if(task.kind==="execute")return "coder";
  if(task.kind==="verify")return /review/i.test(task.title)?"reviewer":"tester";
  if(task.kind==="test")return "tester";
  if(task.kind==="inspect"||task.kind==="diagnose")return "researcher";
  return "general";
}

export class AgentMessageBus{
  constructor(private readonly state:StateStore){}
  send(input:{fromAgentId:string;toAgentId:string;type:AgentMessageType;payload:unknown;visibility?:Visibility;id?:string}){
    const message=this.state.sendAgentMessage(input);
    this.state.addTrace(input.fromAgentId,"message.sent",{toAgentId:input.toAgentId,type:input.type},{messageId:message.id});
    return message;
  }
  receive(agentId:string){const messages=this.state.receiveAgentMessages(agentId);for(const message of messages)this.state.addTrace(agentId,"message.delivered",{fromAgentId:message.fromAgentId,type:message.type},{messageId:message.id});return messages;}
  acknowledge(agentId:string,messageId:string){const message=this.state.getAgentMessage(messageId);if(!message||message.toAgentId!==agentId)throw new Error("message not found for agent");this.state.acknowledgeAgentMessage(messageId);this.state.addTrace(agentId,"message.acknowledged",{messageId},{messageId});}
  list(agentId:string){return this.state.listAgentMessages(agentId);}
}

export class AgentContextCompiler{
  constructor(private readonly state:StateStore,private readonly roles=new RoleRegistry(),private readonly compiler=new ContextCompiler()){}
  async compile(agent:Agent,task:PlanTask,input:{parentContext?:string;tools?:ToolDefinition[];maxChars?:number}={}):Promise<AgentExecutionContext>{
    const role=await this.roles.load(agent.role);
    const incoming=this.state.receiveAgentMessages(agent.id).filter(message=>message.visibility!=="private"||message.toAgentId===agent.id);
    for(const message of incoming){this.state.addTrace(agent.id,"message.delivered",{fromAgentId:message.fromAgentId,type:message.type},{taskId:task.id,messageId:message.id});this.state.acknowledgeAgentMessage(message.id);this.state.addTrace(agent.id,"message.acknowledged",{messageId:message.id},{taskId:task.id,messageId:message.id});}
    const memory=this.state.listVisibleMemory(agent.id);
    const allowedTools=(input.tools??[]).filter(tool=>role.allowedTools.includes(tool.name));
    const system=`Role: ${role.role}\n${role.instructions}\nCompletion criteria:\n${role.completionCriteria.map(item=>`- ${item}`).join("\n")}`;
    const compiled=await this.compiler.compile({
      system,goal:agent.goal,runtimeState:`root=${agent.rootAgentId}; agent=${agent.id}; role=${agent.role}; task=${task.id}: ${task.title}`,
      messages:incoming.map(message=>({role:"user",content:`A2A ${message.type} from ${message.fromAgentId}: ${JSON.stringify(message.payload)}`})),
      memory,files:input.parentContext?[`Parent context summary:\n${input.parentContext}`]:[],tools:allowedTools,maxChars:input.maxChars,
      trace:(type,data)=>this.state.addTrace(agent.id,type,data,{taskId:task.id}),
    });
    return {rootAgentId:agent.rootAgentId,goal:agent.goal,assignedTask:task,role,system:compiled.text,memory:memory.map(entry=>({key:entry.key,value:entry.value})),incomingMessages:incoming,parentContext:input.parentContext,allowedTools};
  }
}

export class AgentCoordinator{
  readonly messages:AgentMessageBus;
  constructor(private readonly state:StateStore){this.messages=new AgentMessageBus(state);}
  spawnAgent(input:SpawnAgentInput):Agent{
    const agent=this.state.createAgentRecord({id:input.id,goal:input.goal,role:input.role,parentAgentId:input.parentAgentId,rootAgentId:input.rootAgentId});
    this.state.addTrace(agent.id,"agent.spawned",{role:agent.role,goal:agent.goal});return agent;
  }
  delegate(input:DelegationInput):Delegation{
    const created=this.state.createChildAndDelegation(input);
    this.state.addTrace(created.agent.id,"agent.spawned",{role:created.agent.role,goal:created.agent.goal},{taskId:input.taskId,delegationId:created.delegation.id});
    this.state.addTrace(input.parentAgentId,"delegation.created",{childAgentId:created.agent.id,goal:input.goal},{taskId:input.taskId,delegationId:created.delegation.id});
    this.state.addTrace(input.parentAgentId,"delegation.assigned",{childAgentId:created.agent.id},{taskId:input.taskId,delegationId:created.delegation.id});
    return created.delegation;
  }
  cancelAgent(agentId:string):void{
    const agent=this.state.getAgent(agentId);if(!agent)throw new Error(`agent not found: ${agentId}`);
    const sender=this.state.getAgent(agent.parentAgentId??agent.rootAgentId)!;
    const descendants=this.state.listAgents(agent.rootAgentId).filter(candidate=>candidate.id===agent.id||this.isDescendant(candidate,agent.id)).reverse();
    for(const target of descendants){
      if(["completed","failed","cancelled"].includes(target.status))continue;
      const cancelMessageId=`message_cancel_${agent.id}_${target.id}`;if(sender.id!==target.id&&!this.state.getAgentMessage(cancelMessageId))this.messages.send({id:cancelMessageId,fromAgentId:sender.id,toAgentId:target.id,type:"cancel",payload:{requestedAgentId:agent.id},visibility:"private"});
      for(const delegation of this.state.listDelegations(target.id).filter(item=>item.childAgentId===target.id&&!["completed","failed","cancelled"].includes(item.status))){this.state.updateDelegation(delegation.id,"cancelled",{failurePolicy:"cancelled",failureReason:"ancestor cancelled"});if(delegation.taskId)this.state.releaseTaskLease(delegation.taskId,"cancelled");}
      this.state.updateAgent(target.id,"cancelled",undefined,"cancelled");this.state.addTrace(target.id,"agent.cancelled",{requestedAgentId:agentId});
    }
  }
  private isDescendant(agent:Agent,ancestorId:string){let parent=agent.parentAgentId;while(parent){if(parent===ancestorId)return true;parent=this.state.getAgent(parent)?.parentAgentId;}return false;}
}

export type MultiAgentRuntimeOptions={maxConcurrent?:number;leaseTtlMs?:number;tools?:ToolDefinition[];maxContextChars?:number;afterResultPersisted?:(delegation:Delegation)=>void|Promise<void>};

export class MultiAgentRuntime{
  private readonly graph:TaskGraphRuntime;private readonly coordinator:AgentCoordinator;private readonly contexts:AgentContextCompiler;
  private readonly maxConcurrent:number;private readonly leaseTtlMs:number;
  constructor(private readonly state:StateStore,private readonly worker:AgentWorker,private readonly options:MultiAgentRuntimeOptions={}){
    this.graph=new TaskGraphRuntime(state);this.coordinator=new AgentCoordinator(state);this.contexts=new AgentContextCompiler(state);
    const requested=options.maxConcurrent??2;this.maxConcurrent=Number.isFinite(requested)&&requested>0?Math.floor(requested):2;this.leaseTtlMs=options.leaseTtlMs??30000;
  }

  async run(rootAgentId:string,options:{maxTasks?:number}={}):Promise<Plan>{
    const root=this.requireRoot(rootAgentId);const plan=this.state.getPlanForAgent(root.id);if(!plan)throw new Error(`plan not found for agent: ${root.id}`);
    this.state.updateAgent(root.id,"running");this.state.updatePlan(plan.id,"running","execute");this.state.addTrace(root.id,"agent.started",{resumed:root.status!=="created"});
    this.recoverInFlight(root,plan);let executed=0;
    while(true){
      this.consumeCompletedResults(root,plan);
      const tasks=this.state.listPlanTasks(plan.id);
      if(tasks.every(task=>task.status==="completed")){this.state.updatePlan(plan.id,"completed","verify");this.state.updateAgent(root.id,"completed","Multi-agent verified execution complete");this.state.addTrace(root.id,"agent.completed",{planId:plan.id});return this.state.getPlan(plan.id)!;}
      if(options.maxTasks!==undefined&&executed>=options.maxTasks){this.state.updatePlan(plan.id,"paused","execute");this.state.updateAgent(root.id,"paused");this.state.addTrace(root.id,"agent.paused",{planId:plan.id,executed});return this.state.getPlan(plan.id)!;}
      const runnable=this.graph.runnable(plan.id);
      if(!runnable.length){
        const waiting=this.state.listPlanTasks(plan.id).some(task=>task.status==="needs_approval"||task.status==="waiting");
        if(waiting){this.state.updatePlan(plan.id,"waiting","execute");this.state.updateAgent(root.id,"waiting");}
        else if(this.state.listPlanTasks(plan.id).some(task=>task.status==="failed"||task.status==="blocked")){this.state.updatePlan(plan.id,"failed","execute");this.state.updateAgent(root.id,"failed",undefined,"delegated task failed");}
        return this.state.getPlan(plan.id)!;
      }
      const remaining=options.maxTasks===undefined?this.maxConcurrent:Math.min(this.maxConcurrent,options.maxTasks-executed);
      const batch=runnable.slice(0,remaining);await Promise.all(batch.map(task=>this.executeTask(root,plan,task)));executed+=batch.length;
    }
  }

  async resume(rootAgentId:string,options:{maxTasks?:number}={}):Promise<Plan>{
    const root=this.requireRoot(rootAgentId);const plan=this.state.getPlanForAgent(root.id);if(!plan)throw new Error(`plan not found for agent: ${root.id}`);
    this.state.updateAgent(root.id,"recovering");this.state.addTrace(root.id,"agent.recovering",{planId:plan.id,agents:this.state.listAgents(root.id).length});
    for(const task of this.state.listPlanTasks(plan.id).filter(item=>item.status==="needs_approval")){
      const delegation=this.state.getActiveDelegationForTask(root.id,task.id);if(!delegation)continue;
      const approvals=this.state.listApprovals(delegation.childAgentId).filter(request=>request.taskId===task.id);
      if(approvals.some(request=>request.status==="approved")){this.state.updatePlanTask(task.id,"ready");this.state.updateDelegation(delegation.id,"assigned");this.state.updateAgent(delegation.childAgentId,"recovering");this.state.recordCoordinationDecision({rootAgentId:root.id,agentId:root.id,taskId:task.id,delegationId:delegation.id,decision:"resume-child",reason:"approval granted"});}
      else if(approvals.some(request=>request.status==="denied")){this.state.updatePlanTask(task.id,"failed",{failurePolicy:"non_retryable",blockedReason:"approval denied"});this.state.updateDelegation(delegation.id,"failed",{failurePolicy:"non_retryable",failureReason:"approval denied"});this.state.updateAgent(delegation.childAgentId,"failed",undefined,"approval denied");}
    }
    return this.run(root.id,options);
  }

  cancel(rootOrChildAgentId:string){this.coordinator.cancelAgent(rootOrChildAgentId);const agent=this.state.getAgent(rootOrChildAgentId);if(agent&&agent.id===agent.rootAgentId){const plan=this.state.getPlanForAgent(agent.id);if(plan)this.state.updatePlan(plan.id,"cancelled","execute");}}

  private async executeTask(root:Agent,plan:Plan,task:PlanTask){
    let delegation=this.state.getActiveDelegationForTask(root.id,task.id);
    if(!delegation)delegation=this.coordinator.delegate({parentAgentId:root.id,taskId:task.id,goal:task.title,role:roleFor(task)});
    const child=this.state.getAgent(delegation.childAgentId)!;const lease=this.state.acquireTaskLease(task.id,child.id,this.leaseTtlMs);
    if(!lease){this.state.updatePlanTask(task.id,"waiting",{blockedReason:"task lease held by another agent"});return;}
    this.state.updatePlanTask(task.id,"running",{ownerAgentId:child.id});this.state.updateAgent(child.id,"running");this.state.updateDelegation(delegation.id,"running");
    this.state.addTrace(child.id,"agent.started",{role:child.role},{taskId:task.id,delegationId:delegation.id});this.state.addTrace(child.id,"task.leased",{leaseId:lease.id,expiresAt:lease.expiresAt},{taskId:task.id,delegationId:delegation.id});
    const requestId=`message_request_${delegation.id}`;
    if(!this.state.getAgentMessage(requestId))this.coordinator.messages.send({id:requestId,fromAgentId:root.id,toAgentId:child.id,type:"request",payload:{taskId:task.id,goal:task.title},visibility:"private"});
    try{
      const context=await this.contexts.compile(child,task,{parentContext:`Root goal: ${root.goal}`,tools:this.options.tools,maxChars:this.options.maxContextChars});
      const result=await this.worker.execute(child,task,context);const persisted=this.state.completeDelegationWithResult(delegation.id,result);
      this.state.addTrace(child.id,result.status==="completed"?"agent.completed":"agent.failed",{summary:result.summary},{taskId:task.id,delegationId:delegation.id});
      this.state.addTrace(root.id,"result.handoff",{childAgentId:child.id,resultId:persisted.id,status:persisted.status},{taskId:task.id,delegationId:delegation.id,messageId:`message_result_${delegation.id}`});
      await this.options.afterResultPersisted?.(delegation);
      if(result.status==="failed")this.handleFailure(root,plan,task,delegation,result.failurePolicy??"retryable",result.error??result.summary);
    }catch(error){
      if(this.state.getAgentResultByDelegation(delegation.id)?.status==="completed")throw error;
      const failurePolicy=policyFrom(error);const message=error instanceof Error?error.message:String(error);
      if(failurePolicy==="needs_approval"){this.state.updateDelegation(delegation.id,"waiting",{failurePolicy,failureReason:message});this.state.updateAgent(child.id,"waiting",undefined,message);this.state.updatePlanTask(task.id,"needs_approval",{failurePolicy,blockedReason:message});this.state.updateAgent(root.id,"waiting");this.state.addTrace(child.id,"agent.failed",{failurePolicy,error:message},{taskId:task.id,delegationId:delegation.id});}
      else{this.state.completeDelegationWithResult(delegation.id,{status:"failed",summary:message,error:message,failurePolicy});this.handleFailure(root,plan,task,delegation,failurePolicy,message);}
    }finally{this.state.releaseTaskLease(task.id);this.state.addTrace(child.id,"task.released",{taskId:task.id},{taskId:task.id,delegationId:delegation.id});}
  }

  private handleFailure(root:Agent,plan:Plan,task:PlanTask,delegation:Delegation,failurePolicy:FailurePolicy|"cancelled",reason:string){
    const current=this.state.getPlanTask(task.id)!;
    if(failurePolicy==="retryable"&&current.retryCount<current.maxRetries){
      const repair=task.kind==="verify"?this.findRepairTask(plan.id,task):undefined;
      if(repair){for(const candidate of this.state.listPlanTasks(plan.id).filter(item=>item.position>=repair.position))this.state.updatePlanTask(candidate.id,candidate.id===repair.id?"ready":"pending",candidate.id===repair.id?{incrementRetry:true,blockedReason:`review rejected: ${reason}`}:{blockedReason:`waiting for repair after review rejection`});}
      else this.state.updatePlanTask(task.id,"ready",{failurePolicy:"retryable",blockedReason:reason,incrementRetry:true,ownerAgentId:null});
      this.state.recordCoordinationDecision({rootAgentId:root.id,agentId:root.id,taskId:task.id,delegationId:delegation.id,decision:repair?"repair-and-review":"reassign",reason});
      this.state.addTrace(root.id,"delegation.failed",{childAgentId:delegation.childAgentId,failurePolicy,retry:true,reason},{taskId:task.id,delegationId:delegation.id});return;
    }
    const status=failurePolicy==="blocked"||failurePolicy==="needs_human"?"blocked":"failed";this.state.updatePlanTask(task.id,status,{failurePolicy:failurePolicy==="cancelled"?"non_retryable":failurePolicy,blockedReason:reason});
    this.state.recordCoordinationDecision({rootAgentId:root.id,agentId:root.id,taskId:task.id,delegationId:delegation.id,decision:status==="blocked"?"request-human":"fail-task",reason});this.state.addTrace(root.id,"delegation.failed",{childAgentId:delegation.childAgentId,failurePolicy,retry:false,reason},{taskId:task.id,delegationId:delegation.id});
  }

  private consumeCompletedResults(root:Agent,plan:Plan){
    for(const delegation of this.state.listDelegations(root.id).filter(item=>item.parentAgentId===root.id&&item.status==="completed"&&item.taskId)){
      const task=this.state.getPlanTask(delegation.taskId!);const result=this.state.getAgentResultByDelegation(delegation.id);const resultMessage=this.state.getAgentMessage(`message_result_${delegation.id}`);if(!task||!result||task.status==="completed"||resultMessage?.acknowledgedAt)continue;
      for(const artifact of result.artifacts??[])this.state.addArtifact({agentId:delegation.childAgentId,taskId:task.id,checkpointId:artifact.checkpointId,path:artifact.path,type:artifact.type,operation:artifact.operation,visibility:artifact.visibility});
      this.state.updatePlanTask(task.id,"completed",{result:result.summary,ownerAgentId:delegation.childAgentId});this.state.releaseTaskLease(task.id);
      if(resultMessage){this.state.addTrace(root.id,"message.delivered",{fromAgentId:resultMessage.fromAgentId,type:resultMessage.type},{taskId:task.id,delegationId:delegation.id,messageId:resultMessage.id});this.coordinator.messages.acknowledge(root.id,resultMessage.id);}
      this.state.createTaskCheckpoint({agentId:delegation.childAgentId,planId:plan.id,taskId:task.id,phase:task.kind==="verify"?"verify":"execute",step:this.state.listPlanTasks(plan.id).filter(item=>item.status==="completed").length,snapshot:{delegationId:delegation.id,resultId:result.id,status:"completed"}});
      this.state.addTrace(root.id,"delegation.completed",{childAgentId:delegation.childAgentId,summary:result.summary},{taskId:task.id,delegationId:delegation.id});
    }
  }

  private recoverInFlight(root:Agent,plan:Plan){
    this.consumeCompletedResults(root,plan);
    for(const task of this.state.listPlanTasks(plan.id).filter(item=>item.status==="running"||item.status==="waiting")){
      const delegation=this.state.getActiveDelegationForTask(root.id,task.id);if(!delegation)continue;
      if(this.state.getAgentResultByDelegation(delegation.id))continue;
      this.state.releaseTaskLease(task.id);this.state.updatePlanTask(task.id,"ready",{ownerAgentId:delegation.childAgentId,blockedReason:"recovered unfinished delegation"});this.state.updateDelegation(delegation.id,"assigned");this.state.updateAgent(delegation.childAgentId,"recovering");
      this.state.addTrace(root.id,"task.reassigned",{childAgentId:delegation.childAgentId,reason:"recovery"},{taskId:task.id,delegationId:delegation.id});
    }
  }
  private findRepairTask(planId:string,task:PlanTask):PlanTask|undefined{const tasks=this.state.listPlanTasks(planId);const visit=(candidate:PlanTask):PlanTask|undefined=>{if(candidate.kind==="execute")return candidate;for(const dependency of candidate.dependencies){const found=tasks.find(item=>item.id===dependency);if(found){const repair=visit(found);if(repair)return repair;}}};return visit(task);}
  private requireRoot(rootAgentId:string){const root=this.state.getAgent(rootAgentId);if(!root)throw new Error(`agent not found: ${rootAgentId}`);if(root.rootAgentId!==root.id)throw new Error(`root agent required: ${rootAgentId}`);return root;}
}
