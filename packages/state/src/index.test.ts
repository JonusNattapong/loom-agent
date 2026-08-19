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
    try{const state=new StateStore(filename);expect(state.getSchemaVersion()).toBe(6);expect(state.getAgent("legacy")).toMatchObject({goal:"legacy goal",role:"general",rootAgentId:"legacy",result:"done"});expect(state.listDelegations("legacy")).toEqual([]);state.close();}
    finally{rmSync(filename,{force:true});}
  });
});
