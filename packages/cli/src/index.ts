#!/usr/bin/env node
import {promises as fs} from "node:fs";
import {join} from "node:path";
import {StateStore} from "@loom/state";
import {MockProvider,OpenAICompatibleProvider} from "@loom/providers";
import {AgentLoop} from "@loom/runtime";
import {createNativeTools} from "@loom/tools";
import {SkillRuntime} from "@loom/skills";
import {McpClient,mcpTools} from "@loom/mcp";
type Config={provider?:string;model?:string;context?:{maxChars?:number};permissions?:Record<string,"allow"|"deny"|"ask">;mcpServers?:Record<string,{command:string;args?:string[];env?:Record<string,string>}>};
async function config():Promise<Config>{try{return JSON.parse(await fs.readFile(join(process.cwd(),".loom","config.json"),"utf8"));}catch{return {}}}
const cfg=await config();const argv=process.argv.slice(2);const command=argv[0];const json=argv.includes("--json");const skillArg=argv.findIndex(x=>x==="--skill");const selectedSkills=skillArg>=0?[argv[skillArg+1]]:[];const args=argv.slice(1).filter((x,i)=>x!=="--json"&&x!=="--skill"&&i!==skillArg);
const state=new StateStore();const native=createNativeTools(process.cwd());
async function tools(){for(const [name,server] of Object.entries(cfg.mcpServers??{})){try{const client=await new McpClient(server,(type,data)=>console.error(`[${type}]`,data)).connect();for(const tool of mcpTools(client))native.register(tool);}catch(error){console.error(`MCP server ${name} unavailable: ${error instanceof Error?error.message:error}`);}}return native;}
function provider(){const name=process.env.LOOM_PROVIDER??cfg.provider??"mock";if(name==="openai")return new OpenAICompatibleProvider(undefined,process.env.LOOM_MODEL??cfg.model);return new MockProvider();}
function output(value:unknown){console.log(json?JSON.stringify(value,null,2):typeof value==="string"?value:JSON.stringify(value,null,2));}
function usage(){console.log("loom run <task> [--skill name] | ps | inspect <id> | resume <id> | trace <id> | skills [show name] | tools | memory <id> | memory set <id> <key> <value> | memory delete <id> <key> | config");}
try{if(command==="run"){const task=args.join(" ");if(!task)throw new Error("task is required");const loop=new AgentLoop(state,provider(),await tools(),{skills:new SkillRuntime(),selectedSkills,maxChars:cfg.context?.maxChars,toolPolicy:{permissions:cfg.permissions}});const a=await loop.run(task);output(json?a:{id:a.id,status:a.status,result:a.result});}
else if(command==="ps"){output(state.listAgents());}
else if(command==="inspect"){const a=state.getAgent(args[0]);if(!a)throw new Error("agent not found");output({...a,checkpoint:state.getCheckpoint(a.id),memory:state.listMemory(a.id),context:state.getTrace(a.id).filter(x=>x.type.startsWith("context.")).slice(-1)[0]});}
else if(command==="resume"){const loop=new AgentLoop(state,provider(),await tools(),{skills:new SkillRuntime(),maxChars:cfg.context?.maxChars,toolPolicy:{permissions:cfg.permissions}});output(await loop.resume(args[0]));}
else if(command==="trace"){const trace=state.getTrace(args[0]);if(!state.getAgent(args[0]))throw new Error("agent not found");output(trace);}
else if(command==="skills"){const all=await new SkillRuntime().discover();if(args[0]==="show"){const skill=all.find(s=>s.name===args[1]);if(!skill)throw new Error("skill not found");output(skill);}else output(all);}
else if(command==="tools"){output((await tools()).definitions());}
else if(command==="memory"){if(args[0]==="set"){if(!args[1]||!args[2]||!args[3])throw new Error("usage: loom memory set <agent-id> <key> <value>");state.putMemory(args[1],args[2],args.slice(3).join(" "));state.addTrace(args[1],"memory.updated",{key:args[2]});output({ok:true});}else if(args[0]==="delete"){state.deleteMemory(args[1],args[2]);output({ok:true});}else output(state.listMemory(args[0]));}
else if(command==="config"){output({...cfg,provider:process.env.LOOM_PROVIDER??cfg.provider??"mock",model:process.env.LOOM_MODEL??cfg.model});}
else{usage();process.exitCode=1;}}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
