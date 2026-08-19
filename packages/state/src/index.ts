import {mkdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import type {Agent, AgentStatus, Checkpoint, MemoryEntry, Message, TraceEvent} from "@loom/core";
type Statement = {run(...args:unknown[]):unknown;get(...args:unknown[]):unknown;all(...args:unknown[]):unknown[]};
type Database = {exec(sql:string):void;prepare(sql:string):Statement;pragma(sql:string):unknown;close?():void};
function loadDatabase(filename:string):Database { const req=createRequire(import.meta.url); const mod=process.versions.bun?req("bun:sqlite"):req("node:sqlite"); if(process.versions.bun){const db=new mod.Database(filename);return {exec:(sql)=>db.run(sql),prepare:(sql)=>db.query(sql),pragma:()=>undefined};} const db=new mod.DatabaseSync(filename);return {exec:(sql)=>db.exec(sql),prepare:(sql)=>db.prepare(sql),pragma:()=>undefined}; }

export class StateStore {
  readonly db: Database;
  constructor(filename = process.env.LOOM_DB ?? ".loom/loom.db") {
    if (filename !== ":memory:") { const dir = filename.replace(/[\\/][^\\/]+$/, ""); if (dir) mkdirSync(dir,{recursive:true}); }
    this.db = loadDatabase(filename); this.db.pragma("journal_mode = WAL");
    this.migrate();
  }
  private migrate(){this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`);this.applyMigration(1,`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, task TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT, error TEXT); CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS checkpoints (agent_id TEXT PRIMARY KEY, step INTEGER NOT NULL, messages TEXT NOT NULL, status TEXT NOT NULL, result TEXT);`);this.applyMigration(2,`CREATE TABLE IF NOT EXISTS working_memory (agent_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(agent_id,key)); CREATE TABLE IF NOT EXISTS tool_execution_ledger (tool_call_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, tool_name TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, updated_at TEXT NOT NULL);`);}
  private applyMigration(version:number,sql:string){if(!this.db.prepare("SELECT version FROM schema_migrations WHERE version=?").get(version)){this.db.exec(sql);this.db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(version,new Date().toISOString());}}
  createAgent(task:string,id:string=randomUUID()):Agent {const now=new Date().toISOString();this.db.prepare("INSERT INTO agents VALUES (?,?,?,?,?,NULL,NULL)").run(id,task,"created",now,now);return this.getAgent(id)!;}
  getAgent(id:string):Agent|undefined{return this.db.prepare("SELECT id,task,status,created_at as createdAt,updated_at as updatedAt,result,error FROM agents WHERE id=?").get(id) as Agent|undefined;}
  listAgents():Agent[]{return this.db.prepare("SELECT id,task,status,created_at as createdAt,updated_at as updatedAt,result,error FROM agents ORDER BY created_at DESC").all() as Agent[];}
  updateAgent(id:string,status:AgentStatus,result?:string,error?:string):void{this.db.prepare("UPDATE agents SET status=?,result=COALESCE(?,result),error=COALESCE(?,error),updated_at=? WHERE id=?").run(status,result??null,error??null,new Date().toISOString(),id);}
  saveCheckpoint(c:Checkpoint):void{this.db.prepare("INSERT OR REPLACE INTO checkpoints VALUES (?,?,?,?,?)").run(c.agentId,c.step,JSON.stringify(c.messages),c.status,c.result??null);}
  getCheckpoint(id:string):Checkpoint|undefined{const r=this.db.prepare("SELECT agent_id as agentId,step,messages,status,result FROM checkpoints WHERE agent_id=?").get(id) as (Omit<Checkpoint,"messages">&{messages:string})|undefined;return r?{...r,messages:JSON.parse(r.messages) as Message[]}:undefined;}
  addTrace(agentId:string,type:string,data:Record<string,unknown>):void{this.db.prepare("INSERT INTO traces(agent_id,type,data,created_at) VALUES(?,?,?,?)").run(agentId,type,JSON.stringify(data),new Date().toISOString());}
  getTrace(id:string):TraceEvent[]{return (this.db.prepare("SELECT id,agent_id as agentId,type,data,created_at as createdAt FROM traces WHERE agent_id=? ORDER BY id").all(id) as Array<TraceEvent&{data:string}>).map(x=>({...x,data:JSON.parse(x.data)}));}
  listMemory(agentId:string):MemoryEntry[]{return this.db.prepare("SELECT agent_id as agentId,key,value,updated_at as updatedAt FROM working_memory WHERE agent_id=? ORDER BY key").all(agentId) as MemoryEntry[];}
  putMemory(agentId:string,key:string,value:string):void{this.db.prepare("INSERT OR REPLACE INTO working_memory VALUES (?,?,?,?)").run(agentId,key,value,new Date().toISOString());}
  deleteMemory(agentId:string,key:string):void{this.db.prepare("DELETE FROM working_memory WHERE agent_id=? AND key=?").run(agentId,key);}
  clearMemory(agentId:string):void{this.db.prepare("DELETE FROM working_memory WHERE agent_id=?").run(agentId);}
  getToolExecution(id:string){return this.db.prepare("SELECT tool_call_id as toolCallId,agent_id as agentId,tool_name as toolName,input,status,result,error,updated_at as updatedAt FROM tool_execution_ledger WHERE tool_call_id=?").get(id) as {toolCallId:string;agentId:string;toolName:string;input:string;status:string;result?:string;error?:string;updatedAt:string}|undefined;}
  recordToolExecution(id:string,agentId:string,name:string,input:Record<string,unknown>,status:string,result?:string,error?:string):void{this.db.prepare("INSERT OR REPLACE INTO tool_execution_ledger VALUES (?,?,?,?,?,?,?,?)").run(id,agentId,name,JSON.stringify(input),status,result??null,error??null,new Date().toISOString());}
}
