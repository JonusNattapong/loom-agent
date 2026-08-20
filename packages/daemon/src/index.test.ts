import {describe,expect,it} from "vitest";import {Daemon,nextScheduleAt,ManagedBotSupervisor} from "./index.js";import {StateStore} from "@loom/state";
const wait=async(ms:number)=>new Promise(r=>setTimeout(r,ms));
describe("V0.7 daemon",()=>{it("claims and completes a durable adaptive job",async()=>{const state=new StateStore(":memory:");const daemon=new Daemon(state,{pollMs:10,maxConcurrentJobs:1,jobRunner:{run:async (job:any)=>({status:"completed",rootAgentId:job.rootAgentId??"root",summary:"ok"})}});await daemon.start();const job=state.enqueueJob({type:"agent_run",payload:{goal:"status"},idempotencyKey:"manual:1"});await wait(60);expect(state.getJob(job.id).status).toBe("completed");await daemon.stop();expect(state.getDaemon(daemon.daemonId).status).toBe("stopped");state.close();});it("refuses a second active daemon and materializes one schedule occurrence",async()=>{const state=new StateStore(":memory:");const first=new Daemon(state);await first.start();await expect(new Daemon(state).start()).rejects.toThrow(/daemon already running/);const schedule=state.createSchedule({kind:"interval",expression:"1m",timezone:"UTC",payload:{goal:"x"},nextRunAt:1000});const a=state.materializeSchedule(schedule.id,1000,{goal:"x"}),b=state.materializeSchedule(schedule.id,1000,{goal:"x"});expect(a.id).toBe(b.id);expect(state.listJobs()).toHaveLength(1);await first.stop();state.close();});it("computes bounded schedule times",()=>{expect(nextScheduleAt("interval","5m",0)).toBe(300000);expect(nextScheduleAt("once","1970-01-01T00:00:01Z",0)).toBe(1000);expect(nextScheduleAt("cron","0 8 * * *",0)).toBe(28800000);expect(()=>nextScheduleAt("cron","bad",0)).toThrow();});});

it("moves approval-gated work to waiting and resumes the same root",async()=>{const state=new StateStore(":memory:");let calls=0,root="";const daemon=new Daemon(state,{pollMs:5,maxConcurrentJobs:1,jobRunner:{run:async job=>{calls++;root=job.rootAgentId??state.createAgentRecord({goal:"approval",role:"coder"}).id;if(!job.rootAgentId)state.updateJob(job.id,"claimed",{rootAgentId:root});if(calls===1){const approval=state.createApproval({agentId:root,taskId:"approval-task",toolCallId:"approval-call",toolName:"write_file",input:{path:"x"}});state.updateAgent(root,"waiting");return {status:"waiting",rootAgentId:root,waitingReason:"approval",waitingRef:approval.id};}state.updateAgent(root,"completed","done");return {status:"completed",rootAgentId:root,summary:"done"};}}});await daemon.start();const job=state.enqueueJob({type:"agent_run",payload:{goal:"approval"},idempotencyKey:"approval:e2e"});await wait(50);let waiting=state.getJob(job.id);expect(waiting.status).toBe("waiting");expect(waiting.attempt).toBe(0);const approval=state.listApprovals(root)[0];state.resolveApproval(approval.id,"approved");await wait(50);expect(state.getJob(job.id).status).toBe("completed");expect(state.getJob(job.id).rootAgentId).toBe(root);expect(calls).toBe(2);await daemon.stop();state.close();});

it("isolates a failing bot from daemon and healthy bot",async()=>{const state=new StateStore(":memory:");let healthy=false;const supervisor=new ManagedBotSupervisor([{id:"bad",start:async()=>{throw new Error("connect failed")},stop:async()=>{}},{id:"good",start:async()=>{healthy=true},stop:async()=>{}}]);const daemon=new Daemon(state,{botSupervisor:supervisor,pollMs:5,jobRunner:{run:async()=>({status:"completed",summary:"ok"})}});await daemon.start();expect(healthy).toBe(true);expect(supervisor.status()).toEqual(expect.arrayContaining([expect.objectContaining({id:"bad",status:"degraded"}),expect.objectContaining({id:"good",status:"connected"})]));const job=state.enqueueJob({type:"agent_run",payload:{goal:"x"}});await wait(30);expect(state.getJob(job.id).status).toBe("completed");expect(state.getDaemon(daemon.daemonId).status).toBe("running");await daemon.stop();state.close();});


it("starts the control plane after bots and stops it before bots",async()=>{
 const state=new StateStore(":memory:"),events:string[]=[];
 const daemon=new Daemon(state,{pollMs:1000,botSupervisor:{start:async()=>{events.push("bots:start")},stop:async()=>{events.push("bots:stop")}},controlPlane:{start:async()=>{events.push("control:start")},stop:async()=>{events.push("control:stop")}}});
 await daemon.start();
 expect(events).toEqual(["bots:start","control:start"]);
 await daemon.stop();
 expect(events).toEqual(["bots:start","control:start","control:stop","bots:stop"]);
 state.close();
});

it("does not overwrite a concurrently cancelled running job",async()=>{
 const state=new StateStore(":memory:");
 let finish!:()=>void;
 const blocked=new Promise<void>(resolve=>{finish=resolve});
 const daemon=new Daemon(state,{pollMs:5,maxConcurrentJobs:1,jobRunner:{run:async()=>{await blocked;return {status:"completed",summary:"late completion"}}}});
 await daemon.start();
 const created=state.enqueueJob({type:"agent_run",payload:{goal:"cancel me"}});
 for(let i=0;i<30&&state.getJob(created.id)?.status!=="running";i++)await wait(5);
 expect(state.getJob(created.id)?.status).toBe("running");
 daemon.cancelJob(created.id);
 finish();
 await wait(25);
 expect(state.getJob(created.id)?.status).toBe("cancelled");
 expect(state.listControlEvents().some((event:any)=>event.type==="job.cancelled"&&event.resourceId===created.id)).toBe(true);
 await daemon.stop();
 state.close();
});

it("applies schedule, retry, and approval control actions through guarded transitions",async()=>{
 const state=new StateStore(":memory:");
 const daemon=new Daemon(state,{pollMs:1000,maxConcurrentJobs:1,jobRunner:{run:async job=>({status:"completed",rootAgentId:job.rootAgentId,summary:"resumed"})}});
 await daemon.start();
 const schedule=daemon.createSchedule({kind:"interval",expression:"5m",timezone:"UTC",payload:{goal:"scheduled"}});
 expect(daemon.pauseSchedule(schedule.id).enabled).toBe(0);
 expect(daemon.resumeSchedule(schedule.id).enabled).toBe(1);
 expect(daemon.deleteSchedule(schedule.id).id).toBe(schedule.id);
 expect(state.getSchedule(schedule.id)).toBeUndefined();
 const failed=state.enqueueJob({type:"agent_run",payload:{goal:"retry"},availableAt:Date.now()+60_000});
 state.updateJob(failed.id,"failed",{errorMessage:"first failure"});
 expect(daemon.retryJob(failed.id).status).toBe("queued");
 const root=state.createAgentRecord({goal:"root",role:"planner"});
 const child=state.createAgentRecord({goal:"child",role:"coder",parentAgentId:root.id});
 const approval=state.createApproval({agentId:child.id,taskId:"task",toolCallId:"call",toolName:"write_file",input:{path:"x"}});
 const waiting=state.enqueueJob({type:"agent_run",payload:{goal:"approval"},rootAgentId:root.id,availableAt:Date.now()+60_000});
 state.setJobWaiting(waiting.id,"approval",approval.id);
 await daemon.decideApproval(approval.id,"approved");
 expect(state.getApproval(approval.id)?.status).toBe("approved");
 expect(["queued","claimed","running","completed"]).toContain(state.getJob(waiting.id)?.status);
 await expect(daemon.decideApproval(approval.id,"denied")).rejects.toThrow(/already decided/);
 await daemon.stop();
 state.close();
});
