import type {AgentRole, Message, Provider, ProviderRequest, ProviderResponse, ToolCall} from "@loom/core";

export interface CompletionCriterion {type:"file_exists"|"test_passes"|"review";path?:string;command?:string;}
export type Capability = "repository-reading"|"code-editing"|"testing"|"research"|"review"|"shell"|"MCP"|"filesystem";
export interface PlannedTask {id:string; title:string; description:string; role?:AgentRole; dependencies:string[]; requiredCapabilities?:Capability[]; expectedArtifacts?:string[]; verification?:VerificationHint[]; priority?:number; completionCriteria?:CompletionCriterion[];}
export interface VerificationHint {type:"test"|"file"|"review"; value:string;}
export interface PlanProposal {summary:string;tasks:PlannedTask[];source:"model"|"fallback";version?:number;}
export interface PlanningInput {goal:string;currentState?:string;repositoryContext?:string;availableRoles:AgentRole[];availableTools?:string[];relevantMemory?:string[];}
export interface PlanValidation {valid:boolean;errors:string[];depth:number;cycles:string[][];}
export interface AdaptivePlanner {plan(input:PlanningInput):Promise<PlanProposal>}
export interface PlannerOptions {maxTasks?:number;maxDepth?:number;provider?:Provider;}

const fallback=(input:PlanningInput):PlanProposal=>({source:"fallback",summary:`Deterministic plan for: ${input.goal}`,tasks:[
 {id:"inspect",title:"Inspect repository and current state",description:"Inspect relevant files and existing tests.",role:"researcher",dependencies:[],requiredCapabilities:["repository-reading"],verification:[{type:"test",value:"baseline"}]},
 {id:"execute",title:"Implement the requested change",description:input.goal,role:"coder",dependencies:["inspect"],requiredCapabilities:["code-editing"]},
 {id:"verify",title:"Verify the implementation",description:"Run targeted and final verification.",role:"tester",dependencies:["execute"],requiredCapabilities:["testing"],verification:[{type:"test",value:"full"}]}
]});

export function validatePlan(proposal:PlanProposal,input:PlanningInput,options:Pick<PlannerOptions,"maxTasks"|"maxDepth">={}):PlanValidation {
 const errors:string[]=[]; const maxTasks=options.maxTasks??20,maxDepth=options.maxDepth??5; const ids=new Set<string>();
 if(!proposal.tasks.length) errors.push("plan has no tasks"); if(proposal.tasks.length>maxTasks) errors.push(`task count exceeds ${maxTasks}`);
 for(const t of proposal.tasks){if(ids.has(t.id)) errors.push(`duplicate task id: ${t.id}`); ids.add(t.id); if(!input.availableRoles.includes(t.role??"general")) errors.push(`invalid role: ${t.role}`);}
 for(const t of proposal.tasks) for(const d of t.dependencies) if(d===t.id) errors.push(`self dependency: ${t.id}`); else if(!ids.has(d)) errors.push(`missing dependency: ${t.id} -> ${d}`);
 const by=new Map(proposal.tasks.map(t=>[t.id,t.dependencies])); const visiting=new Set<string>(),done=new Set<string>(),cycles:string[][]=[];
 const walk=(id:string,path:string[]):number=>{if(visiting.has(id)){cycles.push([...path,id]);return 0}if(done.has(id))return 0;visiting.add(id);let depth=1;for(const d of by.get(id)??[])depth=Math.max(depth,1+walk(d,[...path,id]));visiting.delete(id);done.add(id);return depth};
 let depth=0; for(const t of proposal.tasks)depth=Math.max(depth,walk(t.id,[])); if(cycles.length)errors.push("dependency cycle detected"); if(depth>maxDepth)errors.push(`plan depth exceeds ${maxDepth}`);
 return {valid:errors.length===0,errors,depth,cycles};
}

export class ModelAdaptivePlanner implements AdaptivePlanner {
 constructor(private readonly options:PlannerOptions={}){}
 async plan(input:PlanningInput):Promise<PlanProposal>{
  const fallbackPlan=fallback(input); const p=this.options.provider;
  if(!p)return fallbackPlan;
  try { const request:ProviderRequest={system:"Return ONLY JSON matching {summary:string,tasks:Array<{id,title,description,role,dependencies,requiredCapabilities,verification}>}. Never invent permissions or tools.",messages:[{role:"user",content:JSON.stringify(input)}]}; const response=p.generate?await p.generate(request):await p.complete(request.messages); const parsed=JSON.parse(response.content) as PlanProposal; const proposal={...parsed,source:"model" as const}; const v=validatePlan(proposal,input,this.options); if(v.valid)return proposal; return fallbackPlan;
  } catch { return fallbackPlan; }
 }
}

export interface RoleCandidate {role:AgentRole;capabilities:Capability[];load?:number;failureCount?:number;model?:string;allowedTools?:string[]}
export interface RoleSelection {role:AgentRole;score:number;model?:string;reason:string}
export function selectRole(required:Capability[],candidates:RoleCandidate[]):RoleSelection {return candidates.map(c=>{const matched=required.filter(x=>c.capabilities.includes(x)).length;const score=matched*100-(c.load??0)*5-(c.failureCount??0)*10;return {role:c.role,score,model:c.model,reason:`matched ${matched}/${required.length} capabilities`}}).sort((a,b)=>b.score-a.score)[0]??{role:"general",score:0,reason:"no candidates"};}

export interface ExecutionLimits {maxModelRounds?:number;maxToolCalls?:number}
export interface ExecutionContext {taskId:string;goal:string;messages:Message[];tools?:unknown[]}
export interface ExecutionHooks {tool(call:ToolCall):Promise<string>;checkpoint?(state:{round:number;messages:Message[]}):Promise<void>;trace?(type:string,data:Record<string,unknown>):void}
export interface ExecutionResult {status:"completed"|"failed"|"limited";summary:string;rounds:number;toolCalls:number;messages:Message[];error?:string}
export class MultiRoundExecutor {
 constructor(private readonly provider:Provider,private readonly hooks:ExecutionHooks,private readonly limits:ExecutionLimits={}){}
 async run(context:ExecutionContext):Promise<ExecutionResult>{let messages=[...context.messages],rounds=0,toolCalls=0;const maxRounds=this.limits.maxModelRounds??12,maxTools=this.limits.maxToolCalls??30;
  for(;rounds<maxRounds;rounds++){this.hooks.trace?.("execution.round_started",{taskId:context.taskId,round:rounds+1});const response:ProviderResponse=this.provider.generate?await this.provider.generate({messages,tools:context.tools as any}):await this.provider.complete(messages);messages.push({role:"assistant",content:response.content});if(!response.toolCalls?.length){await this.hooks.checkpoint?.({round:rounds+1,messages});return {status:"completed",summary:response.content,rounds:rounds+1,toolCalls,messages};}for(const call of response.toolCalls){if(toolCalls>=maxTools)return {status:"limited",summary:"tool call limit reached",rounds:rounds+1,toolCalls,messages};const result=await this.hooks.tool(call);toolCalls++;messages.push({role:"tool",content:JSON.stringify({id:call.id,result})});await this.hooks.checkpoint?.({round:rounds+1,messages});}this.hooks.trace?.("execution.round_completed",{taskId:context.taskId,round:rounds+1});}
  return {status:"limited",summary:"model round limit reached",rounds,toolCalls,messages};}
}

export interface ReviewIssue {code:string;message:string;severity:"low"|"medium"|"high";repair?:string}
export interface ReviewResult {verdict:"accept"|"reject"|"needs_human";summary:string;issues:ReviewIssue[];round:number}
export interface ReviewInput {goal:string;task:PlannedTask;artifacts?:string[];diff?:string;testResults?:string[];agentResult:string}
export interface ReviewerOptions {maxRepairRounds?:number;provider?:Provider}
export class SemanticReviewer {constructor(private readonly options:ReviewerOptions={}){}
 async review(input:ReviewInput,round=1):Promise<ReviewResult>{if(this.options.provider){try{const r=await (this.options.provider.generate?this.options.provider.generate({system:"Return JSON {verdict:accept|reject|needs_human,summary:string,issues:Array<{code,message,severity,repair}>}",messages:[{role:"user",content:JSON.stringify(input)}]}):this.options.provider.complete([{role:"user",content:JSON.stringify(input)}]));const x=JSON.parse(r.content);if(["accept","reject","needs_human"].includes(x.verdict)&&Array.isArray(x.issues))return {...x,round};}catch{/* deterministic fallback below */}}
 const evidence=(input.testResults??[]).length>0;return {verdict:evidence?"accept":"needs_human",summary:evidence?"Deterministic evidence is present":"No verification evidence was supplied",issues:[],round};}
}

export interface TestSelectionInput {changedFiles:string[];knownTestFiles:string[];task:PlannedTask}
export interface TestSelection {level:"targeted"|"package"|"full";files:string[];reason:string}
export function selectTests(input:TestSelectionInput):TestSelection {const files=input.knownTestFiles.filter(t=>input.changedFiles.some(f=>{const base=f.replace(/\.(ts|tsx|js|jsx)$/,""),test=t.replace(/\.(test|spec)?\.(ts|tsx|js|jsx)$/g,"");return test.includes(base)||base.includes(test)}));return {level:files.length?"targeted":"full",files,reason:files.length?"matched changed paths to test paths":"no deterministic test match"};}
