import type {ExecutionPhase,FailurePolicy,Plan,PlanTask} from "@loom/core";
import {StateStore} from "@loom/state";

export type TaskExecutionResult={result:string;artifacts?:Array<{path:string;operation:"created"|"modified"|"deleted"}>;failurePolicy?:FailurePolicy};
export type VerificationResult={passed:boolean;summary:string;failurePolicy?:FailurePolicy};
export interface TaskExecutor{execute(task:PlanTask,context:{agentId:string;goal:string}):Promise<TaskExecutionResult>}
export interface Reviewer{verify(task:PlanTask,context:{agentId:string;goal:string;tasks:PlanTask[]}):Promise<VerificationResult>}

export class PlanEngine{
  constructor(private readonly state:StateStore){}
  create(agentId:string,goal:string):Plan{
    const plan=this.state.createPlan(agentId,goal);
    const coding=/fix|test|bug|code|parser/i.test(goal);
    const specs:Array<[string,string,string[]]>=coding?
      [["inspect","Inspect repository",[]],["test","Run tests",["inspect"]],["diagnose","Diagnose failures",["test"]],["execute","Fix implementation",["diagnose"]],["verify_targeted","Run targeted tests",["execute"]],["verify_full","Run full suite",["verify_targeted"]],["review","Review diff",["verify_full"]]]:
      [["inspect","Inspect goal",[]],["execute","Execute goal",["inspect"]],["review","Verify result",["execute"]]];
    const ids=new Map(specs.map(([key])=>[key,`task_${plan.id}_${key}`]));
    specs.forEach(([key,title,deps],position)=>this.state.addPlanTask({id:ids.get(key),planId:plan.id,title,kind:key.startsWith("verify")||key==="review"?"verify":key,dependencies:deps.map(d=>ids.get(d)!),maxRetries:key==="execute"?2:1,position}));
    this.state.updatePlan(plan.id,"running","execute");
    this.state.addTrace(agentId,"plan.created",{planId:plan.id,tasks:specs.length});
    return this.state.getPlan(plan.id)!;
  }
}

export class TaskGraphRuntime{
  constructor(private readonly state:StateStore){}
  runnable(planId:string):PlanTask[]{
    const tasks=this.state.listPlanTasks(planId);
    const done=new Set(tasks.filter(t=>t.status==="completed").map(t=>t.id));
    for(const task of tasks.filter(t=>t.status==="pending")){
      const deps=task.dependencies.map(id=>tasks.find(t=>t.id===id));
      if(deps.some(d=>d?.status==="failed"||d?.status==="blocked"))this.state.updatePlanTask(task.id,"blocked",{failurePolicy:"blocked",blockedReason:"dependency failed"});
      else if(task.dependencies.every(id=>done.has(id)))this.state.updatePlanTask(task.id,"ready");
    }
    return this.state.listPlanTasks(planId).filter(t=>t.status==="ready");
  }
}

export class VerifiedExecutionRuntime{
  private readonly graph:TaskGraphRuntime;
  constructor(private readonly state:StateStore,private readonly executor:TaskExecutor,private readonly reviewer:Reviewer){this.graph=new TaskGraphRuntime(state);}

  async run(planId:string,options:{maxTasks?:number}={}):Promise<Plan>{
    const plan=this.state.getPlan(planId);if(!plan)throw new Error(`plan not found: ${planId}`);
    this.state.updateAgent(plan.agentId,"running");this.state.updatePlan(plan.id,"running","execute");
    let executed=0;
    while(true){
      const runnable=this.graph.runnable(plan.id);if(!runnable.length)break;
      for(const task of runnable){
        if(options.maxTasks!==undefined&&executed>=options.maxTasks){
          this.state.updatePlan(plan.id,"paused","execute");this.state.updateAgent(plan.agentId,"paused");
          this.state.addTrace(plan.agentId,"agent.paused",{planId:plan.id,currentTask:task.id});
          this.checkpoint(plan,task,"execute",{status:"paused"});
          return this.state.getPlan(plan.id)!;
        }
        this.state.updatePlanTask(task.id,"running");this.state.addTrace(plan.agentId,"task.started",{planId:plan.id,taskId:task.id,title:task.title});
        try{
          if(task.kind==="verify")await this.verifyTask(plan,task);else await this.executeTask(plan,task);
          this.state.addTrace(plan.agentId,"task.completed",{taskId:task.id});executed++;
        }catch(error){if(this.handleFailure(plan,task,error))return this.state.getPlan(plan.id)!;}
      }
    }
    const tasks=this.state.listPlanTasks(plan.id);
    if(tasks.every(t=>t.status==="completed")){
      this.state.updatePlan(plan.id,"completed","verify");this.state.updateAgent(plan.agentId,"completed","Verified execution complete");
      this.state.addTrace(plan.agentId,"plan.completed",{planId:plan.id});
    }
    return this.state.getPlan(plan.id)!;
  }

  private async executeTask(plan:Plan,task:PlanTask){
    const result=await this.executor.execute(task,{agentId:plan.agentId,goal:plan.goal});
    this.state.updatePlanTask(task.id,"completed",{result:result.result});
    const checkpoint=this.checkpoint(plan,task,"execute",{status:"completed",result:result.result});
    for(const artifact of result.artifacts??[])this.state.addArtifact({agentId:plan.agentId,taskId:task.id,checkpointId:checkpoint.id,path:artifact.path,operation:artifact.operation});
  }

  private async verifyTask(plan:Plan,task:PlanTask){
    this.state.updatePlan(plan.id,"running","verify");
    const review=await this.reviewer.verify(task,{agentId:plan.agentId,goal:plan.goal,tasks:this.state.listPlanTasks(plan.id)});
    if(review.passed){
      this.state.updatePlanTask(task.id,"completed",{result:review.summary});this.checkpoint(plan,task,"verify",{status:"completed",summary:review.summary});
      this.state.addTrace(plan.agentId,"verification.passed",{taskId:task.id,summary:review.summary});return;
    }
    this.state.updatePlanTask(task.id,"failed",{result:review.summary,failurePolicy:review.failurePolicy??"retryable"});
    const dependency=task.dependencies.at(-1);
    if(dependency){const target=this.state.getPlanTask(dependency)!;if(target.retryCount<target.maxRetries){this.state.updatePlanTask(target.id,"ready",{incrementRetry:true,blockedReason:"verification rejected"});this.state.updatePlanTask(task.id,"pending");this.state.addTrace(plan.agentId,"verification.rejected",{taskId:task.id,retryTaskId:target.id,summary:review.summary});this.checkpoint(plan,task,"verify",{status:"rejected",retryTaskId:target.id});return;}}
    const error=new Error(review.summary) as Error&{failurePolicy:FailurePolicy};error.failurePolicy=review.failurePolicy??"non_retryable";throw error;
  }

  private handleFailure(plan:Plan,task:PlanTask,error:unknown){
    const message=error instanceof Error?error.message:String(error);const current=this.state.getPlanTask(task.id)!;
    const policy=(error as any)?.failurePolicy as FailurePolicy|undefined??"retryable";
    if(policy==="retryable"&&current.retryCount<current.maxRetries){this.state.updatePlanTask(task.id,"ready",{failurePolicy:policy,blockedReason:message,incrementRetry:true});this.state.addTrace(plan.agentId,"task.retrying",{taskId:task.id,retry:current.retryCount+1,error:message});this.checkpoint(plan,task,"execute",{status:"retrying",error:message});return false;}
    const status=policy==="needs_approval"?"needs_approval":policy==="blocked"||policy==="needs_human"?"blocked":"failed";
    this.state.updatePlanTask(task.id,status,{failurePolicy:policy,blockedReason:message});this.state.updatePlan(plan.id,status==="needs_approval"?"waiting":"failed","execute");this.state.updateAgent(plan.agentId,status==="needs_approval"?"waiting":"failed",undefined,message);this.checkpoint(plan,task,"execute",{status,error:message,failurePolicy:policy});return true;
  }

  private checkpoint(plan:Plan,task:PlanTask,phase:ExecutionPhase,snapshot:Record<string,unknown>){
    const step=this.state.listPlanTasks(plan.id).filter(t=>t.status==="completed").length;
    return this.state.createTaskCheckpoint({agentId:plan.agentId,planId:plan.id,taskId:task.id,phase,step,snapshot});
  }

  async resume(agentId:string,options:{maxTasks?:number}={}){
    const plan=this.state.getPlanForAgent(agentId);if(!plan)throw new Error(`plan not found for agent: ${agentId}`);
    let denied=false;
    for(const task of this.state.listPlanTasks(plan.id).filter(t=>t.status==="needs_approval")){
      const approvals=this.state.listApprovals(agentId).filter(a=>a.taskId===task.id);
      if(approvals.some(a=>a.status==="approved"))this.state.updatePlanTask(task.id,"ready",{blockedReason:"approval granted"});
      else if(approvals.some(a=>a.status==="denied")){this.state.updatePlanTask(task.id,"failed",{failurePolicy:"non_retryable",blockedReason:"approval denied"});denied=true;}
    }
    if(denied){this.state.updatePlan(plan.id,"failed","execute");this.state.updateAgent(agentId,"failed",undefined,"approval denied");return this.state.getPlan(plan.id)!;}
    this.state.updateAgent(agentId,"recovering");this.state.addTrace(agentId,"agent.recovering",{planId:plan.id});
    return this.run(plan.id,options);
  }
}
