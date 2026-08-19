#!/usr/bin/env node
import {StateStore} from "@loom/state";
import {MockProvider} from "@loom/providers";
import {AgentLoop} from "@loom/runtime";
import {createNativeTools} from "@loom/tools";
const [command,...args]=process.argv.slice(2);
const state=new StateStore();
const loop=new AgentLoop(state,new MockProvider(),createNativeTools(process.cwd()));
function usage(){console.log("loom run <task> | ps | inspect <id> | resume <id> | trace <id>");}
try{
 if(command==="run"){const task=args.join(" ");if(!task)throw new Error("task is required");const a=await loop.run(task);console.log(`${a.id}\n${a.result}`);}
 else if(command==="ps"){for(const a of state.listAgents())console.log(`${a.id}\t${a.status}\t${a.task}`);}
 else if(command==="inspect"){const a=state.getAgent(args[0]);if(!a)throw new Error("agent not found");console.log(JSON.stringify({...a,checkpoint:state.getCheckpoint(a.id)},null,2));}
 else if(command==="resume"){const a=await loop.resume(args[0]);console.log(`${a.id}\n${a.result}`);}
 else if(command==="trace"){const id=args[0];if(!state.getAgent(id))throw new Error("agent not found");for(const e of state.getTrace(id))console.log(`${e.createdAt}\t${e.type}\t${JSON.stringify(e.data)}`);}
 else {usage();process.exitCode=1;}
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
