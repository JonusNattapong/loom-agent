#!/usr/bin/env node
import {promises as fs} from "node:fs";
import {join} from "node:path";
import type {Agent,AgentResult,PermissionLevel,Provider} from "@loom/core";
import {MultiAgentRuntime} from "@loom/coordinator";
import {StateStore} from "@loom/state";
import {MockProvider,OpenAICompatibleProvider} from "@loom/providers";
import {AgentLoop} from "@loom/runtime";
import {createNativeTools,ToolExecutor,ToolRegistry} from "@loom/tools";
import {SkillRuntime} from "@loom/skills";
import {McpClient,mcpTools} from "@loom/mcp";
import {PlanEngine,Reviewer,TaskExecutor,VerifiedExecutionRuntime} from "@loom/planner";
import {AdaptiveOrchestrator} from "@loom/adaptive";
import {Daemon,nextScheduleAt} from "@loom/daemon";

type Config={
  provider?:string;model?:string;context?:{maxChars?:number};permissions?:Record<string,PermissionLevel>;
  agents?:{maxConcurrent?:number;roles?:Record<string,{model?:string}>};
  planning?:{enabled?:boolean;maxTasks?:number;maxDepth?:number};
  execution?:{maxModelRoundsPerTask?:number;maxToolCallsPerTask?:number};
  review?:{enabled?:boolean;maxRepairRounds?:number};
  verification?:{targetedTests?:boolean;final?:"targeted"|"package"|"full"};
  daemon?:{maxConcurrentJobs?:number;heartbeatIntervalMs?:number;staleAfterMs?:number;shutdownGraceMs?:number};jobs?:{leaseMs?:number;renewEveryMs?:number;maxAttempts?:number};scheduler?:{enabled?:boolean;maxSleepMs?:number};
  mcpServers?:Record<string,{command:string;args?:string[];env?:Record<string,string>}>;
};

async function loadConfig():Promise<Config>{try{return JSON.parse(await fs.readFile(join(process.cwd(),".loom","config.json"),"utf8"));}catch{return {};}}
const cfg=await loadConfig();const argv=process.argv.slice(2);const command=argv[0];const json=argv.includes("--json");
const skillIndex=argv.indexOf("--skill");const maxTasksIndex=argv.indexOf("--max-tasks");const maxAgentsIndex=argv.indexOf("--max-agents");
const selectedSkills=skillIndex>=0?[argv[skillIndex+1]]:[];const maxTasks=maxTasksIndex>=0?Number(argv[maxTasksIndex+1]):undefined;
const maxAgents=maxAgentsIndex>=0?Number(argv[maxAgentsIndex+1]):cfg.agents?.maxConcurrent;
const skipped=new Set(["--json","--tree","--skill",skillIndex>=0?argv[skillIndex+1]:"","--max-tasks",maxTasksIndex>=0?argv[maxTasksIndex+1]:"","--max-agents",maxAgentsIndex>=0?argv[maxAgentsIndex+1]:""]);
const args=argv.slice(1).filter(value=>!skipped.has(value));const state=new StateStore();const registry=createNativeTools(process.cwd());

async function loadTools(){for(const [name,server] of Object.entries(cfg.mcpServers??{})){try{const client=await new McpClient(server,(type,data)=>console.error(`[${type}]`,data)).connect();for(const tool of mcpTools(client))registry.register(tool);}catch(error){console.error(`MCP server ${name} unavailable: ${error instanceof Error?error.message:error}`);}}return registry;}
function loadProvider():Provider{const name=process.env.LOOM_PROVIDER??cfg.provider??"mock";if(name==="openai")return new OpenAICompatibleProvider(undefined,process.env.LOOM_MODEL??cfg.model);return new MockProvider();}
function output(value:unknown,human?:string){console.log(json?JSON.stringify(value,null,2):human??(typeof value==="string"?value:JSON.stringify(value,null,2)));}
function usage(){console.log("loom run <goal> [--max-agents N] | daemon start|stop|status | jobs | job enqueue|inspect|cancel|retry <id> | schedules | schedule add|pause|resume|delete <id> | plan <id> | reviews <id> | ps | inspect <id> | resume <id> | trace <id> | agents | agent inspect|cancel <id> | delegations <id> | messages <id> | approve|deny <request-id>");}

function scopedPermissions(tools:ToolRegistry,allowedTools?:string[]):Record<string,PermissionLevel>{
  const permissions={...(cfg.permissions??{})};
  if(allowedTools)for(const tool of tools.list())if(!allowedTools.includes(tool.name))permissions[tool.name]="deny";
  return permissions;
}

function executionServices(provider:Provider,tools:ToolRegistry,scope?:{agentId:string;taskId:string;system?:string;allowedTools?:string[]}){
  const trace=(type:string,data:Record<string,unknown>)=>{if(scope)state.addTrace(scope.agentId,type,data,{taskId:scope.taskId,toolCallId:typeof data.toolCallId==="string"?data.toolCallId:undefined});};
  const toolExecutor=new ToolExecutor(tools,{permissions:scopedPermissions(tools,scope?.allowedTools),ledger:state,approvals:state,artifacts:state,trace});
  const executor:TaskExecutor={async execute(task,context){
    if(task.kind==="inspect")return {result:await toolExecutor.execute("shell",{command:"git status --short"},{agentId:context.agentId,taskId:task.id,toolCallId:`${task.id}:inspect`})};
    if(task.kind==="test"){try{return {result:await toolExecutor.execute("shell",{command:"bun x vitest run --config vitest.config.ts"},{agentId:context.agentId,taskId:task.id,toolCallId:`${task.id}:baseline-tests`})};}catch(error){if((error as {failurePolicy?:string}).failurePolicy)throw error;return {result:`Tests currently failing: ${error instanceof Error?error.message:error}`};}}
    const messages=[{role:"user" as const,content:`Goal: ${context.goal}\nCurrent task: ${task.title}`}];
    let response=provider.generate?await provider.generate({messages,tools:tools.definitions().filter(tool=>!scope?.allowedTools||scope.allowedTools.includes(tool.name)),system:scope?.system}):await provider.complete(messages);
    const artifacts:Array<{path:string;operation:"modified"}>=[];const toolResults:string[]=[];
    for(const [index,call] of (response.toolCalls??[]).entries()){
      const result=await toolExecutor.execute(call.name,call.input,{agentId:context.agentId,taskId:task.id,toolCallId:call.id??`${task.id}:provider:${index}`});toolResults.push(`${call.name}: ${result}`);
      if(call.name==="write_file"&&typeof call.input.path==="string")artifacts.push({path:call.input.path,operation:"modified"});
    }
    if(toolResults.length&&provider.generate)response=await provider.generate({messages:[...messages,{role:"assistant",content:response.content},{role:"tool",content:toolResults.join("\n")}],tools:tools.definitions(),system:scope?.system});
    return {result:[response.content,...toolResults].filter(Boolean).join("\n"),artifacts};
  }};
  const reviewer:Reviewer={async verify(task,context){const shellCommand=/review/i.test(task.title)?"git diff --check && git diff --stat":"bun x vitest run --config vitest.config.ts";try{const result=await toolExecutor.execute("shell",{command:shellCommand},{agentId:context.agentId,taskId:task.id,toolCallId:`${task.id}:verification`});return {passed:true,summary:result};}catch(error){if((error as {failurePolicy?:string}).failurePolicy==="needs_approval")throw error;return {passed:false,summary:error instanceof Error?error.message:String(error),failurePolicy:"retryable"};}}};
  return {executor,reviewer};
}

async function verifiedRuntime(){const provider=loadProvider();const tools=await loadTools();const services=executionServices(provider,tools);return new VerifiedExecutionRuntime(state,services.executor,services.reviewer);}
async function multiAgentRuntime(){
  const provider=loadProvider();const tools=await loadTools();
  return new MultiAgentRuntime(state,{async execute(agent,task,context):Promise<AgentResult>{
    const services=executionServices(provider,tools,{agentId:agent.id,taskId:task.id,system:context.system,allowedTools:context.role.allowedTools});
    if(task.kind==="verify"){const review=await services.reviewer.verify(task,{agentId:agent.id,goal:context.goal,tasks:state.listPlanTasks(task.planId)});return review.passed?{status:"completed",summary:review.summary}:{status:"failed",summary:review.summary,error:review.summary,failurePolicy:review.failurePolicy??"retryable"};}
    const result=await services.executor.execute(task,{agentId:agent.id,goal:context.goal});return {status:"completed",summary:result.result,artifacts:result.artifacts};
  }},{maxConcurrent:maxAgents,tools:tools.definitions(),maxContextChars:cfg.context?.maxChars});
}

function rootOf(agent:Agent){return state.getAgent(agent.rootAgentId)??agent;}
function agentTree(rootAgentId:string){return state.listAgents(rootAgentId).map(agent=>({id:agent.id,parentAgentId:agent.parentAgentId,role:agent.role,status:agent.status,goal:agent.goal}));}
function inspectData(agentId:string){
  const agent=state.getAgent(agentId);if(!agent)throw new Error("agent not found");const root=rootOf(agent);const plan=state.getPlanForAgent(root.id);
  const agents=state.listAgents(root.id);const taskCheckpoint=agents.map(item=>state.latestTaskCheckpoint(item.id)).filter(item=>item!==undefined).sort((left,right)=>right.createdAt.localeCompare(left.createdAt))[0];
  return {...agent,root,checkpoint:state.getCheckpoint(agent.id),taskCheckpoint,plan,tasks:plan?state.listPlanTasks(plan.id):[],agents:agentTree(root.id),delegations:state.listDelegationsForRoot(root.id),messages:state.listAgentMessages(agent.id),artifacts:state.listArtifactsForRoot(root.id),approvals:state.listApprovalsForRoot(root.id)};
}
function inspectHuman(agentId:string){
  const data=inspectData(agentId);const tasks=data.tasks;const current=tasks.find(task=>["running","ready","needs_approval"].includes(task.status))??tasks.find(task=>task.status==="pending");const marks:Record<string,string>={completed:"✓",running:"→",ready:"→",pending:"○",waiting:"◌",blocked:"!",failed:"×",needs_approval:"?"};
  const tree=data.agents.map(agent=>`${agent.parentAgentId?"├─":"root"} ${agent.id}\t${agent.role}\t${agent.status}`).join("\n");
  return [`Goal: ${data.root.goal}`,`Status: ${data.root.status}`,data.plan?`Phase: ${data.plan.phase}`:"","","Agents:",tree,"","Tasks",...tasks.map(task=>`${marks[task.status]??"○"} ${task.title}${task.ownerAgentId?` [${task.ownerAgentId}]`:""}${task.retryCount?` (retry ${task.retryCount}/${task.maxRetries})`:""}${task.blockedReason?` — ${task.blockedReason}`:""}`),"",`Current task: ${current?.title??"none"}`,`Checkpoint: ${data.taskCheckpoint?.id??data.checkpoint?.checkpointId??(data.checkpoint?`step_${data.checkpoint.step}`:"none")}`,`Modified: ${data.artifacts.map(artifact=>artifact.path).join(", ")||"none"}`,`Pending approvals: ${data.approvals.filter(request=>request.status==="pending").length}`].join("\n");
}

try{
  if(command==="run"){
    const goal=args.join(" ");if(!goal)throw new Error("goal is required");const agent=state.createAgentRecord({goal,role:"planner"});state.addTrace(agent.id,"agent.created",{goal});const provider=loadProvider();const tools=await loadTools();const toolExecutor=new ToolExecutor(tools,{permissions:scopedPermissions(tools),ledger:state,approvals:state,artifacts:state,trace:(type,data)=>state.addTrace(agent.id,type,data)});const adaptive=new AdaptiveOrchestrator(state,provider,{maxModelRounds:12,maxToolCalls:30,provider,tool:(call,agentId,taskId)=>toolExecutor.execute(call.name,call.input,{agentId,taskId,toolCallId:call.id??`${taskId}:${call.name}`})});const result=await adaptive.run(agent.id,goal);const plan=state.getPlanForAgent(agent.id);output({agent:state.getAgent(agent.id),plan:result,tasks:plan?state.listPlanTasks(plan.id):[],agents:agentTree(agent.id),delegations:state.listDelegations(agent.id)},`Agent: ${agent.id}\nPlan: ${plan?.id??"none"}\nStatus: ${result.status}`);
  }else if(command==="daemon"&&args[0]==="start"){
    const daemon=new Daemon(state,{provider:loadProvider(),maxConcurrentJobs:cfg.daemon?.maxConcurrentJobs,heartbeatIntervalMs:cfg.daemon?.heartbeatIntervalMs,staleAfterMs:cfg.daemon?.staleAfterMs,leaseMs:cfg.jobs?.leaseMs,pollMs:1000});await daemon.start();output(await daemon.status(),`Daemon ${daemon.daemonId} running`);const shutdown=async()=>{await daemon.stop();process.exit(0);};process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);await new Promise<void>(()=>{});
  }else if(command==="daemon"&&args[0]==="status"){
    const daemons=state.listDaemons();const active=daemons.find(d=>d.status==="running"&&d.heartbeatAt>Date.now()-(cfg.daemon?.staleAfterMs??20000));const jobs=state.listJobs();output({running:Boolean(active),daemon:active,jobs,schedules:state.listSchedules()});
  }else if(command==="daemon"&&args[0]==="stop"){
    const active=state.listDaemons().find(d=>d.status==="running"&&d.heartbeatAt>Date.now()-(cfg.daemon?.staleAfterMs??20000));if(active)state.stopDaemon(active.daemonId);output({stopped:active?.daemonId??null});
  }else if(command==="jobs"){
    const statusIndex=args.indexOf("--status");output(state.listJobs(statusIndex>=0?args[statusIndex+1]:undefined));
  }else if(command==="job"&&args[0]==="enqueue"){
    const goal=args.slice(1).filter(a=>!a.startsWith("--")).join(" ");if(!goal)throw new Error("goal is required");output(state.enqueueJob({type:"agent_run",payload:{goal},idempotencyKey:`manual:${goal}`}));
  }else if(command==="job"&&args[0]==="inspect"){
    const job=state.getJob(args[1]);if(!job)throw new Error(`job not found: ${args[1]}`);output(job);
  }else if(command==="job"&&(args[0]==="cancel"||args[0]==="retry")){
    const job=state.getJob(args[1]);if(!job)throw new Error(`job not found: ${args[1]}`);if(args[0]==="cancel")state.updateJob(job.id,"cancelled",{errorMessage:"cancelled by user"});else state.updateJob(job.id,"queued",{availableAt:Date.now(),errorMessage:null});output(state.getJob(job.id));
  }else if(command==="schedules"){
    output(state.listSchedules());
  }else if(command==="schedule"&&args[0]==="add"){
    const goal=args.slice(1).filter(a=>!a.startsWith("--")).join(" ");const everyIndex=args.indexOf("--every"),atIndex=args.indexOf("--at"),cronIndex=args.indexOf("--cron"),tzIndex=args.indexOf("--timezone");const kind=everyIndex>=0?"interval":atIndex>=0?"once":cronIndex>=0?"cron":"once";const expression=everyIndex>=0?args[everyIndex+1]:atIndex>=0?args[atIndex+1]:cronIndex>=0?args[cronIndex+1]:new Date(Date.now()+60000).toISOString();const timezone=tzIndex>=0?args[tzIndex+1]:"UTC";const next=nextScheduleAt(kind,expression);if(!next||Number.isNaN(next))throw new Error("invalid schedule expression");output(state.createSchedule({kind,expression,timezone,payload:{goal},nextRunAt:next}));
  }else if(command==="schedule"&&(args[0]==="pause"||args[0]==="resume"||args[0]==="delete")){
    const schedule=state.getSchedule(args[1]);if(!schedule)throw new Error(`schedule not found: ${args[1]}`);if(args[0]==="delete")state.updateSchedule(schedule.id,{enabled:false,errorMessage:"deleted"});else state.updateSchedule(schedule.id,{enabled:args[0]==="resume",nextRunAt:args[0]==="resume"?nextScheduleAt(schedule.kind,schedule.expression):undefined});output(state.getSchedule(schedule.id));
  }else if(command==="plan"){
    const agent=state.getAgent(args[0]);if(!agent)throw new Error("agent not found");const plan=state.getPlanForAgent(agent.rootAgentId);output({plan,revisions:plan?state.listPlanRevisions(plan.id):[],tasks:plan?state.listPlanTasks(plan.id):[]});
  }else if(command==="reviews"){
    const agent=state.getAgent(args[0]);if(!agent)throw new Error("agent not found");const plan=state.getPlanForAgent(agent.rootAgentId);const tasks=plan?state.listPlanTasks(plan.id):[];output(tasks.flatMap(task=>state.listReviews(task.id)));
  }else if(command==="ps"){
    const agents=state.listAgents().filter(agent=>agent.id===agent.rootAgentId);output(agents,agents.map(agent=>`${agent.id}\t${agent.status}\t${agent.task}`).join("\n"));
  }else if(command==="agents"){
    const agents=args[0]?state.listAgents(state.getAgent(args[0])?.rootAgentId??args[0]):state.listAgents();output(agents,agents.map(agent=>`${agent.id}\t${agent.role}\t${agent.status}\t${agent.parentAgentId??"root"}\t${agent.goal}`).join("\n"));
  }else if(command==="agent"&&args[0]==="inspect"){
    output(inspectData(args[1]),inspectHuman(args[1]));
  }else if(command==="agent"&&args[0]==="cancel"){
    const target=state.getAgent(args[1]);if(!target)throw new Error("agent not found");const runtime=await multiAgentRuntime();runtime.cancel(target.id);output(state.getAgent(target.id),`Cancelled: ${target.id}`);
  }else if(command==="inspect"){
    output(inspectData(args[0]),inspectHuman(args[0]));
  }else if(command==="resume"){
    const agent=state.getAgent(args[0]);if(!agent)throw new Error("agent not found");const root=rootOf(agent);
    if(root.role==="planner"){const result=await (await multiAgentRuntime()).resume(root.id,{maxTasks});output(result,`Plan: ${result.id}\nStatus: ${result.status}`);}
    else{const plan=state.getPlanForAgent(agent.id);if(plan){const result=await (await verifiedRuntime()).resume(agent.id,{maxTasks});output(result,`Plan: ${result.id}\nStatus: ${result.status}`);}else{const loop=new AgentLoop(state,loadProvider(),await loadTools(),{skills:new SkillRuntime(),selectedSkills,maxChars:cfg.context?.maxChars,toolPolicy:{permissions:cfg.permissions,approvals:state,artifacts:state}});output(await loop.resume(agent.id));}}
  }else if(command==="trace"){
    const agent=state.getAgent(args[0]);if(!agent)throw new Error("agent not found");output(state.getTrace(agent.rootAgentId,agent.id===agent.rootAgentId));
  }else if(command==="delegations"){
    const agent=state.getAgent(args[0]);if(!agent)throw new Error("agent not found");output(agent.id===agent.rootAgentId?state.listDelegationsForRoot(agent.id):state.listDelegations(agent.id));
  }else if(command==="messages"){
    if(!state.getAgent(args[0]))throw new Error("agent not found");output(state.listAgentMessages(args[0]));
  }else if(command==="approve"||command==="deny"){
    const request=state.getApproval(args[0]);if(!request)throw new Error("approval request not found");state.resolveApproval(request.id,command==="approve"?"approved":"denied");state.addTrace(request.agentId,`approval.${command==="approve"?"approved":"denied"}`,{requestId:request.id},{taskId:request.taskId,toolCallId:request.toolCallId});output(state.getApproval(request.id),`${command==="approve"?"Approved":"Denied"}: ${request.id}`);
  }else if(command==="approvals"){
    const agent=args[0]?state.getAgent(args[0]):undefined;output(agent&&agent.id===agent.rootAgentId?state.listApprovalsForRoot(agent.id):state.listApprovals(args[0]));
  }else if(command==="skills"){
    const all=await new SkillRuntime().discover();if(args[0]==="show"){const skill=all.find(item=>item.name===args[1]);if(!skill)throw new Error("skill not found");output(skill);}else output(all);
  }else if(command==="tools")output((await loadTools()).definitions());
  else if(command==="memory"){
    if(args[0]==="set"){state.putMemory(args[1],args[2],args.slice(3).join(" "));state.addTrace(args[1],"memory.updated",{key:args[2]});output({ok:true});}
    else if(args[0]==="delete"){state.deleteMemory(args[1],args[2]);output({ok:true});}else output(state.listVisibleMemory(args[0]));
  }else if(command==="config")output({...cfg,provider:process.env.LOOM_PROVIDER??cfg.provider??"mock",model:process.env.LOOM_MODEL??cfg.model,agents:{...cfg.agents,maxConcurrent:cfg.agents?.maxConcurrent??2}});
  else{usage();process.exitCode=1;}
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
