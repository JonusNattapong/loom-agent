import type {Message,Provider} from "@loom-agent/core";
import {StateStore} from "@loom-agent/state";
import {ToolExecutor,ToolPolicy,ToolRegistry} from "@loom-agent/tools";
import {ContextCompiler} from "@loom-agent/context";
import {SkillRuntime} from "@loom-agent/skills";
export type AgentLoopOptions={context?:ContextCompiler;skills?:SkillRuntime;selectedSkills?:string[];maxChars?:number;system?:string;toolPolicy?:ToolPolicy;files?:string[]};
export class AgentLoop {
 constructor(private readonly state:StateStore,private readonly provider:Provider,private readonly tools?:ToolRegistry,private readonly options:AgentLoopOptions={}){}
 async run(task:string,id?:string){const agent=id?this.state.getAgent(id):this.state.createAgent(task);if(!agent)throw new Error(`agent not found: ${id}`);const checkpoint=this.state.getCheckpoint(agent.id);const previous=checkpoint?.messages??[{role:"user",content:agent.task}];this.state.updateAgent(agent.id,"running");this.state.addTrace(agent.id,"agent.started",{task:agent.task,resumed:Boolean(checkpoint)});try{const selected=this.options.selectedSkills?.length&&this.options.skills?await this.options.skills.load(this.options.selectedSkills):[];for(const skill of selected??[])this.state.addTrace(agent.id,"skill.loaded",{name:skill.name});const compiled=await (this.options.context??new ContextCompiler()).compile({system:this.options.system,goal:agent.task,runtimeState:`agent=${agent.id}; status=running`,messages:previous,memory:this.state.listMemory(agent.id),skills:(selected??[]).map(s=>`${s.name}: ${s.instructions}`),files:this.options.files,tools:this.tools?.definitions(),maxChars:this.options.maxChars,trace:(type,data)=>this.state.addTrace(agent.id,type,data)});const messages:Message[]=[...previous,{role:"user",content:compiled.text}];this.state.saveCheckpoint({agentId:agent.id,step:checkpoint?.step??0,messages,status:"running",phase:"provider"});this.state.addTrace(agent.id,"provider.request",{provider:this.provider.name,step:checkpoint?.step??0});const response=this.provider.generate?await this.provider.generate({messages,tools:this.tools?.definitions(),system:this.options.system}):await this.provider.complete(messages);this.state.addTrace(agent.id,"provider.response",{provider:this.provider.name,requestId:response.requestId,finishReason:response.finishReason});messages.push({role:"assistant",content:response.content});if(response.toolCalls&&this.tools){const executor=new ToolExecutor(this.tools,{...this.options.toolPolicy,trace:(type,data)=>this.state.addTrace(agent.id,type,data),ledger:this.state});for(const call of response.toolCalls){const output=await executor.execute(call.name,call.input,{agentId:agent.id,toolCallId:call.id});messages.push({role:"tool",content:output});}}this.state.saveCheckpoint({agentId:agent.id,step:(checkpoint?.step??0)+1,messages,status:"completed",result:response.content,phase:"completed",providerRequestId:response.requestId});this.state.updateAgent(agent.id,"completed",response.content);this.state.addTrace(agent.id,"checkpoint.created",{step:(checkpoint?.step??0)+1});this.state.addTrace(agent.id,"agent.completed",{result:response.content});return this.state.getAgent(agent.id)!;}catch(error){const message=error instanceof Error?error.message:String(error);this.state.updateAgent(agent.id,"failed",undefined,message);this.state.addTrace(agent.id,"agent.failed",{error:message});throw error;}}
 resume(id:string){const agent=this.state.getAgent(id);if(!agent)throw new Error(`agent not found: ${id}`);this.state.updateAgent(id,"recovering");this.state.addTrace(id,"agent.recovering",{checkpoint:this.state.getCheckpoint(id)?.step??0});return this.run(agent.task,id);}
}

export type LearningEvent={agentId:string;input:string;output?:string;source:"user"|"agent";createdAt?:string};
export type GrowthSuggestion={id:string;key:string;value:string;confidence:number;reason:string;status:"pending"|"approved"|"rejected"};

/** Opt-in preference learning. It never writes memory until approve() is called. */
export class SelfGrowthEngine {
 private enabled=false;
 private pending:GrowthSuggestion[]=[];
 constructor(private readonly state:StateStore){}
 enable(){this.enabled=true;}
 disable(){this.enabled=false;}
 isEnabled(){return this.enabled;}
 observe(event:LearningEvent):GrowthSuggestion|undefined{
  if(!this.enabled)return undefined;
  const text=event.input.trim();
  const match=text.match(/^(?:i prefer|i like|always use|ชอบ|อยากให้ใช้)\s+(.+)$/i);
  if(!match)return undefined;
  const value=match[1].trim().replace(/[.!]+$/g,"");
  if(!value||/(api[_ -]?key|password|token|secret|private key)/i.test(value))return undefined;
  const suggestion:GrowthSuggestion={id:`learning_${Date.now()}_${this.pending.length}`,key:"user.preference",value,confidence:0.72,reason:"explicit preference stated by user",status:"pending"};
  this.pending.push(suggestion);return suggestion;
 }
 listPending(){return this.pending.filter(item=>item.status==="pending");}
 approve(id:string,agentId:string):GrowthSuggestion{
  const item=this.pending.find(candidate=>candidate.id===id);if(!item)throw new Error(`learning suggestion not found: ${id}`);
  item.status="approved";this.state.putMemory(agentId,item.key,item.value);return item;
 }
 reject(id:string):GrowthSuggestion{
  const item=this.pending.find(candidate=>candidate.id===id);if(!item)throw new Error(`learning suggestion not found: ${id}`);
  item.status="rejected";return item;
 }
}
