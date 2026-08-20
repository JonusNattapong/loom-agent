import {randomUUID} from "node:crypto";
import {rmSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe,it,expect} from "vitest";
import {StateStore} from "./index.js";

describe("StateStore",()=>{
  it("persists agents, checkpoints, traces, memory, and ledger",()=>{
    const state=new StateStore(":memory:");const agent=state.createAgent("hello","agent-1");
    state.saveCheckpoint({agentId:agent.id,step:1,messages:[{role:"user",content:"hello"}],status:"running"});state.addTrace(agent.id,"test.event",{ok:true});state.putMemory(agent.id,"fact","value");state.recordToolExecution("call-1",agent.id,"shell",{command:"echo ok"},"succeeded","ok");
    expect(state.getCheckpoint(agent.id)?.step).toBe(1);expect(state.getTrace(agent.id)).toHaveLength(1);expect(state.listMemory(agent.id)[0].value).toBe("value");expect(state.getToolExecution("call-1")?.status).toBe("succeeded");state.updateAgent(agent.id,"completed","done");expect(state.getAgent(agent.id)?.status).toBe("completed");
  });

  it("upgrades an existing V0.3 database without losing agents",()=>{
    const filename=join(tmpdir(),`loom-v03-${randomUUID()}.db`);const require=createRequire(import.meta.url);const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(filename);
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,'now'),(2,'now'),(3,'now'),(4,'now');
      CREATE TABLE agents (id TEXT PRIMARY KEY,task TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,result TEXT,error TEXT); INSERT INTO agents VALUES ('legacy','legacy goal','completed','now','now','done',NULL);
      CREATE TABLE traces (id INTEGER PRIMARY KEY AUTOINCREMENT,agent_id TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE checkpoints (agent_id TEXT PRIMARY KEY,step INTEGER NOT NULL,messages TEXT NOT NULL,status TEXT NOT NULL,result TEXT);
      CREATE TABLE working_memory (agent_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(agent_id,key)); CREATE TABLE tool_execution_ledger (tool_call_id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,tool_name TEXT NOT NULL,input TEXT NOT NULL,status TEXT NOT NULL,result TEXT,error TEXT,updated_at TEXT NOT NULL);
      CREATE TABLE plans (id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,goal TEXT NOT NULL,status TEXT NOT NULL,phase TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE plan_tasks (id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,dependencies TEXT NOT NULL,retry_count INTEGER NOT NULL,max_retries INTEGER NOT NULL,failure_policy TEXT,blocked_reason TEXT,result TEXT,position INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE approval_requests (id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,task_id TEXT,tool_call_id TEXT,tool_name TEXT NOT NULL,input TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,decided_at TEXT); CREATE TABLE artifacts (id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,task_id TEXT,checkpoint_id TEXT,path TEXT NOT NULL,operation TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE task_checkpoints (id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,plan_id TEXT NOT NULL,task_id TEXT,phase TEXT NOT NULL,step INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL);
    `);db.close();
    try{const state=new StateStore(filename);expect(state.getSchemaVersion()).toBe(13);expect(state.getAgent("legacy")).toMatchObject({goal:"legacy goal",role:"general",rootAgentId:"legacy",result:"done"});expect(state.listDelegations("legacy")).toEqual([]);state.close();}
    finally{rmSync(filename,{force:true});}
  });

  it("persists remote workers, assignments, leases, and protocol state",()=>{
    const state=new StateStore(":memory:");
    state.registerWorker({workerId:"w1",name:"worker",capabilities:["chat"]});
    state.assignRemote({workerId:"w1",payload:{x:1},id:"e1"});
    expect(state.acquireRemoteLease("e1","w1",1000)).toBeTruthy();
    expect(state.getRemoteAssignment("e1")).toMatchObject({id:"e1",workerId:"w1"});
    expect(state.getWorker("w1")).toMatchObject({workerId:"w1",status:"online"}); state.close();
  });

  it("persists operator sessions, audit events, control cursors, and guarded actions",()=>{
    const state=new StateStore(":memory:");
    expect(state.getSchemaVersion()).toBe(13);
    const credential=state.createOperatorCredential({id:"operator-1",name:"Admin",tokenHash:"hash"});
    expect(state.findOperatorCredentialByTokenHash("hash")).toMatchObject({id:credential?.id,enabled:true});
    state.createOperatorSession({id:"session-1",credentialId:"operator-1",sessionHash:"session-hash",csrfHash:"csrf-hash",createdAt:1,lastSeenAt:1,expiresAt:100});
    expect(state.getOperatorSession("session-hash")).toMatchObject({credentialId:"operator-1",csrfHash:"csrf-hash"});
    state.rotateOperatorSessionCsrf("session-1","csrf-next",2);expect(state.getOperatorSession("session-hash")?.csrfHash).toBe("csrf-next");
    state.recordOperatorAudit({requestId:"request-1",actorId:"operator-1",action:"job.cancel",resourceType:"job",resourceId:"job-1",outcome:"success",httpStatus:200,details:{safe:true},createdAt:3});
    expect(state.listOperatorAudit()).toMatchObject([{action:"job.cancel",details:{safe:true}}]);
    const event=state.appendControlEvent({type:"job.updated",resourceType:"job",resourceId:"job-1",data:{status:"queued"},createdAt:4});
    expect(state.listControlEvents({afterId:event.id-1})).toMatchObject([{id:event.id,type:"job.updated"}]);
    const job=state.enqueueJob({id:"job-1",type:"agent_run",payload:{goal:"safe"}});expect(job?.status).toBe("queued");expect(state.cancelJob("job-1")?.status).toBe("cancelled");expect(state.cancelJob("job-1")).toBeUndefined();expect(state.retryJob("job-1")?.status).toBe("queued");
    state.revokeOperatorSession("session-1",5);expect(state.getOperatorSession("session-hash")?.revokedAt).toBe(5);state.close();
  });

  it("upgrades a migration 12 database to control-plane schema 13 without reset",()=>{
    const filename=join(tmpdir(),`loom-v12-${randomUUID()}.db`);const initial=new StateStore(filename);initial.enqueueJob({id:"preserved-job",type:"agent_run",payload:{goal:"preserve"}});initial.db.prepare("DELETE FROM schema_migrations WHERE version=13").run();initial.db.exec("DROP TABLE operator_credentials; DROP TABLE operator_sessions; DROP TABLE operator_audit; DROP TABLE control_events; DROP TABLE worker_connection_epochs;");initial.close();
    try{const upgraded=new StateStore(filename);expect(upgraded.getSchemaVersion()).toBe(13);expect(upgraded.getJob("preserved-job")?.id).toBe("preserved-job");expect(upgraded.listOperatorAudit()).toEqual([]);upgraded.close();}finally{rmSync(filename,{force:true});}
  });

});
