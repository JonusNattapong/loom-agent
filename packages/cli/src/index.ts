#!/usr/bin/env node
import {promises as fs} from "node:fs";
import {randomBytes} from "node:crypto";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import type {Agent,AgentResult,PermissionLevel,Provider} from "@loom-agent/core";
import {MultiAgentRuntime} from "@loom-agent/coordinator";
import {StateStore} from "@loom-agent/state";
import {createProvider,OpenAICompatibleProvider,AnthropicProvider,GoogleProvider,MistralProvider} from "@loom-agent/providers";
import {AgentLoop} from "@loom-agent/runtime";
import {createNativeTools,ToolExecutor,ToolRegistry} from "@loom-agent/tools";
import {SkillRuntime} from "@loom-agent/skills";
import {McpClient,mcpTools} from "@loom-agent/mcp";
import {PlanEngine,Reviewer,TaskExecutor,VerifiedExecutionRuntime} from "@loom-agent/planner";
import {AdaptiveOrchestrator} from "@loom-agent/adaptive";
import {Daemon,nextScheduleAt} from "@loom-agent/daemon";
import {RemoteWorkerRuntime,loadOrCreateWorkerId,RemoteControllerService,hashWorkerToken} from "@loom-agent/remote";
import {ControlPlaneService,ControlServer,hashOperatorToken} from "@loom-agent/control";
import {loadConfig as loadLoomConfig,validateConfig,assertValid,writeStarterConfig} from "@loom-agent/config";
import {SDK_API_VERSION,PROTOCOL_MAJOR,SCHEMA_VERSION} from "@loom-agent/sdk";
import {LoomReplSession} from "@loom-agent/tui";

type Config={
  provider?:{id?:string;model?:string}|string;model?:string;context?:{maxChars?:number};permissions?:Record<string,PermissionLevel>;
  agents?:{maxConcurrent?:number;roles?:Record<string,{model?:string}>};
  planning?:{enabled?:boolean;maxTasks?:number;maxDepth?:number};
  execution?:{maxModelRoundsPerTask?:number;maxToolCallsPerTask?:number};
  review?:{enabled?:boolean;maxRepairRounds?:number};
  verification?:{targetedTests?:boolean;final?:"targeted"|"package"|"full"};
  daemon?:{maxConcurrentJobs?:number;heartbeatIntervalMs?:number;staleAfterMs?:number;shutdownGraceMs?:number};jobs?:{leaseMs?:number;renewEveryMs?:number;maxAttempts?:number};scheduler?:{enabled?:boolean;maxSleepMs?:number};
  mcpServers?:Record<string,{command:string;args?:string[];env?:Record<string,string>}>;
  worker?:{id?:string;controller?:string;tokenEnv?:string;capabilities?:string[];allowedTools?:string[];allowShell?:boolean;workspace?:string;workspaceId?:string;stateFile?:string};
  remote?:{enabled?:boolean;listen?:{host?:string;port?:number;path?:string};tokenEnv?:string;workerId?:string;trust?:"untrusted"|"trusted"|"approved";maxMessageBytes?:number;authTimeoutMs?:number;tlsCertFile?:string;tlsKeyFile?:string};
  controlPlane?:{enabled?:boolean;host?:string;port?:number;readOnly?:boolean;sessionTtlMs?:number;sessionIdleMs?:number;publicOrigin?:string;allowedOrigins?:string[];cookieSecure?:boolean;tlsCertFile?:string;tlsKeyFile?:string};
};

async function loadConfig():Promise<Config>{
  try{
    const {config,source}=await loadLoomConfig({cwd:process.cwd()});
    // validate but do not hard-fail on warnings; surface errors clearly
    const issues=validateConfig(config).filter(i=>i.severity==="error");
    if(issues.length){const lines=issues.map(i=>`  - ${i.path}: ${i.message}`).join("\n");console.error(`Config loaded from ${source} has issues:\n${lines}`);}
    return config as Config;
  }catch{return {};}
}
const cfg=await loadConfig();const argv=process.argv.slice(2);const command=argv[0];const json=argv.includes("--json");
const skillIndex=argv.indexOf("--skill");const maxTasksIndex=argv.indexOf("--max-tasks");const maxAgentsIndex=argv.indexOf("--max-agents");
const selectedSkills=skillIndex>=0?[argv[skillIndex+1]]:[];const maxTasks=maxTasksIndex>=0?Number(argv[maxTasksIndex+1]):undefined;
const maxAgents=maxAgentsIndex>=0?Number(argv[maxAgentsIndex+1]):cfg.agents?.maxConcurrent;
const skipped=new Set(["--json","--tree","--skill",skillIndex>=0?argv[skillIndex+1]:"","--max-tasks",maxTasksIndex>=0?argv[maxTasksIndex+1]:"","--max-agents",maxAgentsIndex>=0?argv[maxAgentsIndex+1]:""]);
const args=argv.slice(1).filter(value=>!skipped.has(value));const state=new StateStore();const registry=createNativeTools(process.cwd());

async function loadTools(){for(const [name,server] of Object.entries(cfg.mcpServers??{})){try{const client=await new McpClient(server,(type,data)=>console.error(`[${type}]`,data)).connect();for(const tool of mcpTools(client))registry.register(tool);}catch(error){console.error(`MCP server ${name} unavailable: ${error instanceof Error?error.message:error}`);}}return registry;}
function loadProvider():Provider{return createProvider(cfg.provider??process.env.LOOM_PROVIDER);}
function output(value:unknown,human?:string){console.log(json?JSON.stringify(value,null,2):human??(typeof value==="string"?value:JSON.stringify(value,null,2)));}
function getVersionInfo(){return {loom:"1.0.0",sdk:SDK_API_VERSION,protocol:PROTOCOL_MAJOR,schema:SCHEMA_VERSION,node:process.version};}

interface DoctorCheck {name:string;ok:boolean;detail?:string;severity?: "error"|"warning";}
interface DoctorReport {status:"ok"|"degraded"|"error";loomVersion:string;nodeVersion:string;checks:DoctorCheck[];}

async function portReachable(host:string,port:number):Promise<boolean>{
  const net=await import("node:net");
  return new Promise<boolean>((resolve)=>{const sock=net.createConnection({host,port});const done=(v:boolean)=>{sock.destroy();resolve(v);};sock.once("connect",()=>done(true));sock.once("error",()=>done(false));setTimeout(()=>done(false),500);});
}

async function doctor():Promise<DoctorReport>{
  const checks:DoctorCheck[]=[];
  const push=(name:string,ok:boolean,detail?:string,severity:"error"|"warning"="error")=>checks.push({name,ok,detail,severity});
  const info=getVersionInfo();
  // Node version
  const major=Number(process.versions.node.split(".")[0]);
  push("Node >= 18.18", major>=18 && !(major===18 && Number(process.versions.node.split(".")[1])<18), `node ${process.versions.node}`);
  push("Loom version", true, `loom ${info.loom} · sdk ${info.sdk}`);
  // Database access
  let dbOk=false, dbDetail="";
  try{const probe=new StateStore();dbOk=probe.getSchemaVersion()>=0;dbDetail=`schema ${probe.getSchemaVersion()}`;probe.close();}catch(error){dbDetail=String(error instanceof Error?error.message:error);}
  push("Database access", dbOk, dbDetail);
  // Migration status
  try{const probe=new StateStore();push("Migration applied", probe.getSchemaVersion()===SCHEMA_VERSION, `schema ${probe.getSchemaVersion()} / expected ${SCHEMA_VERSION}`);probe.close();}catch{/* db check already covers */}
  // Config validity
  try{const {config,source}=await loadLoomConfig({cwd:process.cwd()});const issues=validateConfig(config).filter(i=>i.severity==="error");push("Config valid", issues.length===0, issues.length?`${issues.length} error(s) in ${source}`:source);}catch(error){push("Config valid", false, String(error instanceof Error?error.message:error));}
  // Provider configuration (never print keys)
  const providerId=(process.env.LOOM_PROVIDER??(typeof cfg.provider==="string"?cfg.provider:cfg.provider?.id)??"unconfigured").toLowerCase();
  if(providerId==="openai"){push("Provider OPENAI_API_KEY set", Boolean(process.env.OPENAI_API_KEY), process.env.OPENAI_API_KEY?"configured":"OPENAI_API_KEY not set");}
  else if(providerId==="anthropic"||providerId==="claude"){push("Provider ANTHROPIC_API_KEY set", Boolean(process.env.ANTHROPIC_API_KEY), process.env.ANTHROPIC_API_KEY?"configured":"ANTHROPIC_API_KEY not set");}
  else if(providerId==="google"||providerId==="gemini"){const key=process.env.GEMINI_API_KEY??process.env.GOOGLE_API_KEY;push("Provider GEMINI_API_KEY set", Boolean(key), key?"configured":"GEMINI_API_KEY not set");}
  else if(providerId==="mistral"){push("Provider MISTRAL_API_KEY set", Boolean(process.env.MISTRAL_API_KEY), process.env.MISTRAL_API_KEY?"configured":"MISTRAL_API_KEY not set");}
  else if(providerId==="unconfigured") push("Provider configured", false, "set LOOM_PROVIDER or configure .loom/config.json");
  else push("Provider configured", true, `provider=${providerId}`);
  // Workspace
  try{const ws=process.cwd();const st=await fs.stat(ws);push("Workspace readable", st.isDirectory(), ws);}catch(error){push("Workspace readable", false, String(error instanceof Error?error.message:error));}
  // Control plane config
  if(cfg.controlPlane?.enabled){push("Control plane configured", Boolean(cfg.controlPlane.port), `port ${cfg.controlPlane.port}`);}
  else push("Control plane", true, "disabled (default)");
  // Remote config
  if(cfg.remote?.enabled){push("Remote worker listener", Boolean(cfg.remote.listen?.port||cfg.remote.listen?.host), `host ${cfg.remote.listen?.host??"127.0.0.1"} port ${cfg.remote.listen?.port??4778}`);}
  else push("Remote worker listener", true, "disabled");
  // Required env vars for worker token if configured
  if(cfg.worker?.tokenEnv){push(`Env ${cfg.worker.tokenEnv}`, Boolean(process.env[cfg.worker.tokenEnv]), process.env[cfg.worker.tokenEnv]?"set":"missing");}
  const errors=checks.filter(c=>!c.ok&&c.severity==="error");
  const warnings=checks.filter(c=>!c.ok&&c.severity==="warning");
  const status=errors.length?"error":warnings.length?"degraded":"ok";
  return {status,loomVersion:info.loom,nodeVersion:process.versions.node,checks};
}

function usage(){console.log("loom repl | loom operator token create [--name NAME] | loom worker start --controller URL --token-env ENV [--id ID] | loom run <goal> [--max-agents N] | daemon start|stop|status | jobs | job enqueue|inspect|cancel|retry <id> | schedules | schedule add|pause|resume|delete <id> | plan <id> | reviews <id> | ps | inspect <id> | resume <id> | trace <id> | agents | agent inspect|cancel <id> | delegations <id> | messages <id> | approve|deny <request-id>");}

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
  if(command==="repl"||command==="interactive"||command==="chat"){
    const provider=loadProvider();
    const tools=await loadTools();
    const providerId=(typeof cfg.provider==="string"?cfg.provider:cfg.provider?.id)??process.env.LOOM_PROVIDER??"";
    const providerDefaultModel:Record<string,string>={anthropic:"claude-3-7-sonnet",claude:"claude-3-7-sonnet",google:"gemini-2.5-flash",gemini:"gemini-2.5-flash",openai:"gpt-4o",mistral:"mistral-large-latest",groq:"llama-3.3-70b-versatile",deepseek:"deepseek-chat",openrouter:"anthropic/claude-3.7-sonnet",opencode:"opencode"};
    const resolvedModel=process.env.LOOM_MODEL??(typeof cfg.provider==="object"?cfg.provider.model:undefined)??cfg.model??providerDefaultModel[providerId.toLowerCase()]??(process.env.ANTHROPIC_API_KEY?"claude-3-7-sonnet":(process.env.GEMINI_API_KEY??process.env.GOOGLE_API_KEY)?"gemini-2.5-flash":process.env.OPENAI_API_KEY?"gpt-4o":process.env.MISTRAL_API_KEY?"mistral-large":"unconfigured");
    const session=new LoomReplSession({
      state,
      provider,
      tools,
      permissions:cfg.permissions,
      modelName:resolvedModel,
      version:getVersionInfo().loom,
      cwd:process.cwd(),
      mcpServersCount:Object.keys(cfg.mcpServers??{}).length,
      onDoctor:()=>doctor(),
    });
    await session.start();
    await new Promise<void>(()=>{});
  }else if(command==="--version"||command==="version"){const info=getVersionInfo();output(info,`loom ${info.loom} · sdk ${info.sdk} · schema ${info.schema} · protocol ${info.protocol} · ${info.node}`);}
  else if(command==="init"){const name=argv[1]??(await import("node:path")).basename(process.cwd());const path=await writeStarterConfig(process.cwd(),name);output({created:path,name},`Created ${path}`);const skillsDir=join(process.cwd(),".loom","skills");await fs.mkdir(skillsDir,{recursive:true});}
  else if(command==="config"&&args[0]==="validate"){const path=join(process.cwd(),".loom","config.json");try{const raw=JSON.parse(await fs.readFile(path,"utf8"));assertValid(raw);output({ok:true,source:path},`Config valid: ${path}`);}catch(error){output({ok:false,error:String(error instanceof Error?error.message:error)},`Config invalid: ${path}`);process.exitCode=1;}}
  else if(command==="doctor"){const report=await doctor();const code=report.status==="ok"?0:1;if(json)output(report);else{for(const line of report.checks)console.log(`${line.ok?"✓":"✗"} ${line.name}${line.detail?`: ${line.detail}`:""}`);console.log(`\nDoctor: ${report.status}`);}process.exitCode=code;}
  else if(command==="operator"&&args[0]==="token"&&args[1]==="create"){const nameIndex=argv.indexOf("--name"),name=nameIndex>=0?argv[nameIndex+1]:"local-admin",token=randomBytes(32).toString("base64url"),credential=state.createOperatorCredential({name,tokenHash:hashOperatorToken(token),role:"operator"});output({operatorId:credential.id,token},`Operator token (store securely; shown once): ${token}`);}
  else if(command==="worker"&&args[0]==="token"&&args[1]==="create"){const token=randomBytes(32).toString("base64url");output({token,tokenHash:hashWorkerToken(token)},"Token (store securely; shown once): "+token);}
  else if(command==="worker"&&args[0]==="start"){
    const value=(name:string)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;};
    const controller=value("--controller")??cfg.worker?.controller;if(!controller)throw new Error("worker controller is required");
    const tokenEnv=value("--token-env")??cfg.worker?.tokenEnv??"LOOM_WORKER_TOKEN";const token=process.env[tokenEnv];if(!token)throw new Error(`worker token environment variable is missing: ${tokenEnv}`);
    const workerId=value("--id")??cfg.worker?.id??loadOrCreateWorkerId(cfg.worker?.stateFile??join(process.cwd(),".loom","worker.json"));const workspace=value("--workspace")??cfg.worker?.workspace;const capabilities=[...(cfg.worker?.capabilities??[]),...argv.flatMap((item,index)=>item==="--capability"&&argv[index+1]?[argv[index+1]]:[])];
    const runtime=new RemoteWorkerRuntime({url:controller,token,workerId,capabilities,allowedTools:cfg.worker?.allowedTools??[],allowShell:cfg.worker?.allowShell===true,workspaceRoot:workspace,workspaceId:cfg.worker?.workspaceId,stateFile:cfg.worker?.stateFile});
    const stop=()=>{void runtime.stop().finally(()=>process.exit(0));};process.once("SIGINT",stop);process.once("SIGTERM",stop);await runtime.start();output(runtime.status(),`Worker ${workerId} connected to ${controller}`);await new Promise<void>(()=>{});
  }else if(command==="run"){
    const goal=args.join(" ");if(!goal)throw new Error("goal is required");const agent=state.createAgentRecord({goal,role:"planner"});state.addTrace(agent.id,"agent.created",{goal});const provider=loadProvider();const tools=await loadTools();const toolExecutor=new ToolExecutor(tools,{permissions:scopedPermissions(tools),ledger:state,approvals:state,artifacts:state,trace:(type,data)=>state.addTrace(agent.id,type,data)});const adaptive=new AdaptiveOrchestrator(state,provider,{maxModelRounds:12,maxToolCalls:30,provider,tools:tools.definitions(),tool:(call,agentId,taskId)=>toolExecutor.execute(call.name,call.input,{agentId,taskId,toolCallId:call.id??`${taskId}:${call.name}`})});const result=await adaptive.run(agent.id,goal);const plan=state.getPlanForAgent(agent.id);output({agent:state.getAgent(agent.id),plan:result,tasks:plan?state.listPlanTasks(plan.id):[],agents:agentTree(agent.id),delegations:state.listDelegations(agent.id)},`Agent: ${agent.id}\nPlan: ${plan?.id??"none"}\nStatus: ${result.status}`);
  }else if(command==="daemon"&&args[0]==="start"){
    const remoteTls=cfg.remote?.tlsCertFile&&cfg.remote?.tlsKeyFile?{cert:await fs.readFile(cfg.remote.tlsCertFile),key:await fs.readFile(cfg.remote.tlsKeyFile)}:undefined;const remote=cfg.remote?.enabled?new RemoteControllerService(state,{tls:remoteTls,host:cfg.remote.listen?.host??"127.0.0.1",port:cfg.remote.listen?.port??4778,path:cfg.remote.listen?.path??"/v1/workers/connect",maxMessageBytes:cfg.remote.maxMessageBytes,authTimeoutMs:cfg.remote.authTimeoutMs,credentials:(process.env[cfg.remote.tokenEnv??"LOOM_WORKER_TOKEN"]?[{workerId:cfg.remote.workerId,tokenHash:hashWorkerToken(process.env[cfg.remote.tokenEnv??"LOOM_WORKER_TOKEN"]!),trust:cfg.remote.trust??"untrusted"}]:[])}):undefined;await remote?.start();try{
    let daemon!:Daemon;const controlEnabled=cfg.controlPlane?.enabled??true,controlHost=process.env.LOOM_CONTROL_HOST??cfg.controlPlane?.host??"127.0.0.1",controlPort=Number(process.env.LOOM_CONTROL_PORT??cfg.controlPlane?.port??4777);const controlService=new ControlPlaneService(state,{daemonStatus:()=>daemon.status(),routes:()=>remote?.listRoutes()??[],route:target=>remote?.resolveRoute(target),actions:{cancelJob:id=>daemon.cancelJob(id),retryJob:id=>daemon.retryJob(id),createSchedule:input=>daemon.createSchedule(input),pauseSchedule:id=>daemon.pauseSchedule(id),resumeSchedule:id=>daemon.resumeSchedule(id),deleteSchedule:id=>daemon.deleteSchedule(id),decideApproval:(id,decision)=>daemon.decideApproval(id,decision)}});const controlTls=cfg.controlPlane?.tlsCertFile&&cfg.controlPlane?.tlsKeyFile?{cert:await fs.readFile(cfg.controlPlane.tlsCertFile),key:await fs.readFile(cfg.controlPlane.tlsKeyFile)}:undefined;const control=controlEnabled?new ControlServer(controlService,{host:controlHost,port:controlPort,tls:controlTls,allowedOrigins:cfg.controlPlane?.allowedOrigins,readOnly:cfg.controlPlane?.readOnly,sessionTtlMs:cfg.controlPlane?.sessionTtlMs,sessionIdleMs:cfg.controlPlane?.sessionIdleMs,publicOrigin:cfg.controlPlane?.publicOrigin??`${controlTls?"https":"http"}://${controlHost}:${controlPort}`,cookieSecure:cfg.controlPlane?.cookieSecure,webRoot:fileURLToPath(new URL("../../web/dist/public",import.meta.url))}):undefined;
    daemon=new Daemon(state,{provider:loadProvider(),maxConcurrentJobs:cfg.daemon?.maxConcurrentJobs,heartbeatIntervalMs:cfg.daemon?.heartbeatIntervalMs,staleAfterMs:cfg.daemon?.staleAfterMs,leaseMs:cfg.jobs?.leaseMs,pollMs:1000,controlPlane:control});await daemon.start();output({...await daemon.status(),controlPlane:control?.address()},`Daemon ${daemon.daemonId} running${control?` · control ${controlTls?"https":"http"}://${controlHost}:${controlPort}`:""}`);const shutdown=async()=>{try{await daemon.stop();}finally{await remote?.stop();process.exit(0);}};process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);await new Promise<void>(()=>{});}catch(error){await remote?.stop();throw error}
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
  }else if(command==="config")output({...cfg,provider:process.env.LOOM_PROVIDER??cfg.provider,model:process.env.LOOM_MODEL??cfg.model,agents:{...cfg.agents,maxConcurrent:cfg.agents?.maxConcurrent??2}});
  else{usage();process.exitCode=1;}
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
