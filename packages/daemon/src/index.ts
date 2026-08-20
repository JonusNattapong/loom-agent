import {randomUUID} from "node:crypto";import os from "node:os";import type {Provider} from "@loom/core";import {AdaptiveOrchestrator} from "@loom/adaptive";import {StateStore} from "@loom/state";
export interface ControlPlaneLifecycle {start():Promise<void>;stop():Promise<void>}
export interface ScheduleInput {name?:string;kind:string;expression:string;timezone:string;payload:unknown;misfirePolicy?:string;overlapPolicy?:string;nextRunAt?:number;}
export interface DaemonOptions {heartbeatIntervalMs?:number;staleAfterMs?:number;leaseMs?:number;pollMs?:number;maxConcurrentJobs?:number;shutdownGraceMs?:number;provider?:Provider;jobRunner?:JobRunner;botSupervisor?:BotSupervisor;controlPlane?:ControlPlaneLifecycle;}
export interface BotSupervisor {start():Promise<void>;stop():Promise<void>;status?():unknown}
export interface ManagedBot {id:string;start():Promise<void>;stop():Promise<void>;status?():unknown}
export class ManagedBotSupervisor implements BotSupervisor {private states=new Map<string,any>();constructor(private readonly bots:ManagedBot[]){ }async start(){await Promise.all(this.bots.map(async bot=>{try{await bot.start();this.states.set(bot.id,{id:bot.id,status:"connected"});}catch(error){this.states.set(bot.id,{id:bot.id,status:"degraded",lastError:String(error)});}}));}async stop(){await Promise.all(this.bots.map(async bot=>{try{await bot.stop();}finally{this.states.set(bot.id,{...(this.states.get(bot.id)??{id:bot.id}),status:"stopped"});}}));}status(){return [...this.states.values()];}}
export interface JobRunner {run(job:any,daemon:Daemon):Promise<{status:"completed"|"failed"|"cancelled"|"waiting";rootAgentId?:string;summary?:string;retryable?:boolean;error?:string;waitingReason?:string;waitingRef?:string}>}
export interface DaemonStatus {running:boolean;daemonId?:string;startedAt?:number;heartbeatAt?:number;queue:{queued:number;running:number;retrying:number;failed:number};scheduler:{enabled:boolean;schedules:number;nextRunAt?:number};bots?:unknown}
export function nextScheduleAt(kind:string,expression:string,from=Date.now()):number|undefined {if(kind==="once")return Date.parse(expression);const m=/^(\d+)\s*(m|min|h|hour|d|day)s?$/i.exec(expression);if(m){const n=Number(m[1]),u=m[2].toLowerCase();return from+n*(u.startsWith("m")?60000:u.startsWith("h")?3600000:86400000);}if(kind==="cron"){const parts=expression.trim().split(/\s+/);if(parts.length!==5)throw new Error("cron requires 5 fields");const d=new Date(from);d.setSeconds(0,0);const minute=parts[0]==="*"?d.getMinutes()+1:Number(parts[0]),hour=parts[1]==="*"?d.getHours():Number(parts[1]);if(!Number.isInteger(minute)||minute<0||minute>59||!Number.isInteger(hour)||hour<0||hour>23)throw new Error("invalid cron time");d.setUTCHours(hour,minute,0,0);if(d.getTime()<=from)d.setUTCDate(d.getUTCDate()+1);return d.getTime();}throw new Error(`unsupported schedule kind: ${kind}`)}
export class DefaultJobRunner implements JobRunner {constructor(private readonly state:StateStore,private readonly provider:Provider){}async run(job:any):Promise<any>{const payload=typeof job.payload==="string"?JSON.parse(job.payload):job.payload;const root=job.rootAgentId??this.state.createAgentRecord({goal:payload.goal,role:"planner"}).id;if(!job.rootAgentId)this.state.updateJob(job.id,"claimed",{rootAgentId:root});const plan=await new AdaptiveOrchestrator(this.state,this.provider).run(root,payload.goal);const agent=this.state.getAgent(root);if(agent?.status==="waiting"){const approval=this.state.listApprovals(root).find((a:any)=>a.status==="pending");return {status:"waiting",rootAgentId:root,waitingRef:approval?.id,waitingReason:"approval"} as any;}if(agent?.status==="cancelled")return {status:"cancelled",rootAgentId:root};if(plan.status==="completed")return {status:"completed",rootAgentId:root,summary:agent?.result};return {status:"failed",rootAgentId:root,error:agent?.error??"agent execution failed",retryable:agent?.status!=="failed"};}}
export class Daemon {
 readonly daemonId=`daemon_${randomUUID()}`;
 private running=false;
 private stopping=false;
 private heartbeatTimer?:ReturnType<typeof setInterval>;
 private pollTimer?:ReturnType<typeof setInterval>;
 private active=0;
 private readonly options:Required<Pick<DaemonOptions,"heartbeatIntervalMs"|"staleAfterMs"|"leaseMs"|"pollMs"|"maxConcurrentJobs"|"shutdownGraceMs">>;
 private readonly runner?:JobRunner;
 private readonly botSupervisor?:BotSupervisor;
 private readonly controlPlane?:ControlPlaneLifecycle;

 constructor(readonly state:StateStore,options:DaemonOptions={}){
  this.options={heartbeatIntervalMs:5000,staleAfterMs:20000,leaseMs:30000,pollMs:1000,maxConcurrentJobs:4,shutdownGraceMs:15000,...options};
  this.runner=options.jobRunner??(options.provider?new DefaultJobRunner(state,options.provider):undefined);
  this.botSupervisor=options.botSupervisor;
  this.controlPlane=options.controlPlane;
 }

 async start(){
  if(this.running)return;
  this.state.startDaemon({daemonId:this.daemonId,pid:process.pid,hostname:os.hostname(),version:"0.7.0",staleAfterMs:this.options.staleAfterMs});
  this.running=true;
  this.stopping=false;
  this.state.recoverStaleJobs(Date.now()+this.options.leaseMs,Date.now());
  this.state.addTrace("daemon","daemon.started",{daemonId:this.daemonId});
  try{
   await this.botSupervisor?.start();
   await this.controlPlane?.start();
   this.heartbeatTimer=setInterval(()=>{if(this.running)this.state.heartbeatDaemon(this.daemonId)},this.options.heartbeatIntervalMs);
   this.pollTimer=setInterval(()=>void this.tick(),this.options.pollMs);
   await this.tick();
  }catch(error){
   await this.controlPlane?.stop().catch(()=>undefined);
   await this.botSupervisor?.stop().catch(()=>undefined);
   this.state.stopDaemon(this.daemonId);
   this.running=false;
   this.state.addTrace("daemon","daemon.start_failed",{daemonId:this.daemonId,error:String(error)});
   throw error;
  }
 }

 async tick(){
  if(!this.running||this.stopping)return;
  this.wakeWaitingJobs();
  this.materializeSchedules();
  while(this.active<this.options.maxConcurrentJobs){
   const job=this.state.claimNextJob(this.daemonId,this.options.leaseMs);
   if(!job)break;
   this.active++;
   void this.execute(job).finally(()=>{this.active--;});
  }
 }

 cancelJob(id:string){
  const existing=this.state.getJob(id);
  if(!existing)throw new Error(`job not found: ${id}`);
  const job=this.state.cancelJob(id);
  if(!job)throw new Error(`job cannot be cancelled from status: ${existing.status}`);
  this.recordControl("job.cancelled","job",id,{previousStatus:existing.status,rootAgentId:job.rootAgentId});
  this.state.addTrace("daemon","job.cancelled",{jobId:id,previousStatus:existing.status,rootAgentId:job.rootAgentId});
  return job;
 }

 retryJob(id:string){
  const existing=this.state.getJob(id);
  if(!existing)throw new Error(`job not found: ${id}`);
  const job=this.state.retryJob(id);
  if(!job)throw new Error(`job cannot be retried from status: ${existing.status}`);
  this.recordControl("job.retried","job",id,{previousStatus:existing.status,rootAgentId:job.rootAgentId});
  this.state.addTrace("daemon","job.retried",{jobId:id,previousStatus:existing.status,rootAgentId:job.rootAgentId});
  void this.tick();
  return job;
 }

 createSchedule(input:ScheduleInput){
  const nextRunAt=input.nextRunAt??nextScheduleAt(input.kind,input.expression);
  if(nextRunAt===undefined||!Number.isFinite(nextRunAt))throw new Error("invalid schedule expression");
  const schedule=this.state.createSchedule({...input,nextRunAt});
  this.recordControl("schedule.created","schedule",schedule.id,{kind:schedule.kind,nextRunAt:schedule.nextRunAt});
  this.state.addTrace("daemon","schedule.created",{scheduleId:schedule.id,kind:schedule.kind,nextRunAt:schedule.nextRunAt});
  void this.tick();
  return schedule;
 }

 pauseSchedule(id:string){
  const existing=this.requireSchedule(id);
  const schedule=this.state.updateSchedule(id,{enabled:false});
  this.recordControl("schedule.paused","schedule",id,{previouslyEnabled:Boolean(existing.enabled)});
  this.state.addTrace("daemon","schedule.paused",{scheduleId:id});
  return schedule;
 }

 resumeSchedule(id:string){
  const existing=this.requireSchedule(id);
  const nextRunAt=nextScheduleAt(existing.kind,existing.expression);
  if(nextRunAt===undefined||!Number.isFinite(nextRunAt))throw new Error("invalid schedule expression");
  const schedule=this.state.updateSchedule(id,{enabled:true,nextRunAt,errorMessage:null});
  this.recordControl("schedule.resumed","schedule",id,{nextRunAt});
  this.state.addTrace("daemon","schedule.resumed",{scheduleId:id,nextRunAt});
  void this.tick();
  return schedule;
 }

 deleteSchedule(id:string){
  const schedule=this.state.deleteSchedule(id);
  if(!schedule)throw new Error(`schedule not found: ${id}`);
  this.recordControl("schedule.deleted","schedule",id,{kind:schedule.kind});
  this.state.addTrace("daemon","schedule.deleted",{scheduleId:id});
  return schedule;
 }

 async decideApproval(id:string,decision:"approved"|"denied"){
  const existing=this.state.getApproval(id);
  if(!existing)throw new Error(`approval not found: ${id}`);
  const approval=this.state.resolveApprovalIfPending(id,decision);
  if(!approval)throw new Error(`approval already decided: ${id}`);
  const agent=this.state.getAgent(approval.agentId);
  this.recordControl(`approval.${decision}`,"approval",id,{agentId:approval.agentId,rootAgentId:agent?.rootAgentId,taskId:approval.taskId});
  this.state.addTrace(approval.agentId,`approval.${decision}`,{requestId:id},{taskId:approval.taskId,toolCallId:approval.toolCallId});
  await this.tick();
  return approval;
 }

 private requireSchedule(id:string){
  const schedule=this.state.getSchedule(id);
  if(!schedule)throw new Error(`schedule not found: ${id}`);
  return schedule;
 }

 private recordControl(type:string,resourceType:string,resourceId:string,data:unknown){
  this.state.appendControlEvent({type,resourceType,resourceId,data});
 }

 private wakeWaitingJobs(){
  for(const job of this.state.listJobs("waiting")){
   if(!job.waitingRef)continue;
   const approval=this.state.getApproval(job.waitingRef);
   if(!approval)continue;
   const approvalAgent=this.state.getAgent(approval.agentId);
   if(job.rootAgentId&&approvalAgent?.rootAgentId!==job.rootAgentId)continue;
   if(approval.status==="approved")this.state.wakeWaitingJob(job.id);
   else if(approval.status==="denied")this.state.updateJob(job.id,"failed",{errorMessage:"approval denied"});
  }
 }

 private materializeSchedules(){
  const now=Date.now();
  for(const schedule of this.state.listSchedules()){
   if(!schedule.enabled||!schedule.nextRunAt||schedule.nextRunAt>now)continue;
   try{
    this.state.materializeSchedule(schedule.id,schedule.nextRunAt,JSON.parse(schedule.payload));
    const next=nextScheduleAt(schedule.kind,schedule.expression,schedule.nextRunAt);
    this.state.updateSchedule(schedule.id,{lastRunAt:schedule.nextRunAt,nextRunAt:schedule.kind==="once"?undefined:next,enabled:schedule.kind!=="once"});
    this.state.addTrace("daemon","schedule.materialized",{scheduleId:schedule.id,intendedRunAt:schedule.nextRunAt});
   }catch(error){
    this.state.updateSchedule(schedule.id,{errorMessage:String(error),enabled:false});
   }
  }
 }

 private async execute(job:any){
  this.state.updateJob(job.id,"running",{claimedBy:this.daemonId,leaseExpiresAt:Date.now()+this.options.leaseMs});
  try{
   if(!this.runner)throw new Error("daemon provider/job runner is not configured");
   const result=await this.runner.run(job,this);
   if(this.state.getJob(job.id)?.status==="cancelled")return;
   if(result.status==="waiting"){
    this.state.setJobWaiting(job.id,result.waitingReason??"approval",result.waitingRef);
    this.state.addTrace("daemon","job.waiting",{jobId:job.id,rootAgentId:result.rootAgentId,approvalId:result.waitingRef});
    return;
   }
   if(result.status==="completed")this.state.updateJob(job.id,"completed",{rootAgentId:result.rootAgentId,resultSummary:result.summary});
   else if(result.status==="cancelled")this.state.updateJob(job.id,"cancelled",{rootAgentId:result.rootAgentId,errorMessage:result.error});
   else if(result.retryable&&job.attempt<job.maxAttempts)this.state.updateJob(job.id,"retry_wait",{rootAgentId:result.rootAgentId,errorMessage:result.error,availableAt:Date.now()+Math.min(30000,5000*2**Math.max(0,job.attempt-1))});
   else this.state.updateJob(job.id,"failed",{rootAgentId:result.rootAgentId,errorMessage:result.error});
  }catch(error){
   if(this.state.getJob(job.id)?.status==="cancelled")return;
   if(job.attempt<job.maxAttempts)this.state.updateJob(job.id,"retry_wait",{availableAt:Date.now()+Math.min(30000,5000*2**Math.max(0,job.attempt-1)),errorMessage:String(error)});
   else this.state.updateJob(job.id,"failed",{errorMessage:String(error)});
  }
 }

 async stop(){
  if(!this.running||this.stopping)return;
  this.stopping=true;
  this.state.addTrace("daemon","daemon.stopping",{daemonId:this.daemonId});
  let lifecycleError:unknown;
  try{await this.controlPlane?.stop();}catch(error){lifecycleError=error;this.state.addTrace("daemon","control_plane.stop_failed",{daemonId:this.daemonId,error:String(error)});}
  if(this.pollTimer)clearInterval(this.pollTimer);
  if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);
  try{await this.botSupervisor?.stop();}catch(error){lifecycleError??=error;this.state.addTrace("daemon","bot_supervisor.stop_failed",{daemonId:this.daemonId,error:String(error)});}
  const deadline=Date.now()+this.options.shutdownGraceMs;
  while(this.active>0&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
  this.state.stopDaemon(this.daemonId);
  this.running=false;
  this.stopping=false;
  this.state.addTrace("daemon","daemon.stopped",{daemonId:this.daemonId});
  if(lifecycleError)throw lifecycleError;
 }

 async status():Promise<DaemonStatus>{
  const jobs=this.state.listJobs();
  const schedules=this.state.listSchedules();
  const d=this.state.getDaemon(this.daemonId);
  return {running:this.running,daemonId:this.daemonId,startedAt:d?.startedAt,heartbeatAt:d?.heartbeatAt,queue:{queued:jobs.filter(j=>j.status==="queued").length,running:jobs.filter(j=>j.status==="running"||j.status==="claimed").length,retrying:jobs.filter(j=>j.status==="retry_wait").length,failed:jobs.filter(j=>j.status==="failed").length},scheduler:{enabled:true,schedules:schedules.length,nextRunAt:schedules.filter(s=>s.enabled).map(s=>s.nextRunAt).filter(Boolean).sort((a,b)=>a-b)[0]},bots:this.botSupervisor?.status?.()};
 }
}
