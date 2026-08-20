import {spawn,ChildProcessWithoutNullStreams} from "node:child_process";
import {createInterface} from "node:readline";
import type {Tool,ToolDefinition} from "@loom-agent/core";
type ServerConfig={command:string;args?:string[];env?:Record<string,string>};
export class McpClient{private child?:ChildProcessWithoutNullStreams;private next=1;private pending=new Map<number,(v:any)=>void>();private tools:ToolDefinition[]=[];constructor(private readonly config:ServerConfig,private readonly trace?:(type:string,data:Record<string,unknown>)=>void){}
 async connect(){this.trace?.("mcp.connect.started",{command:this.config.command});this.child=spawn(this.config.command,this.config.args??[],{shell:true,env:{...process.env,...this.config.env}});const rl=createInterface({input:this.child.stdout});rl.on("line",line=>{try{const m=JSON.parse(line);const resolve=this.pending.get(m.id);if(resolve){this.pending.delete(m.id);resolve(m.result??m.error);}}catch{}});await this.request("initialize",{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"loom",version:"0.2.0"}});const result=await this.request("tools/list",{});this.tools=(result?.tools??[]).map((t:any)=>({name:t.name,description:t.description??"",inputSchema:t.inputSchema}));for(const t of this.tools)this.trace?.("mcp.tool.discovered",{name:t.name});this.trace?.("mcp.connect.completed",{tools:this.tools.length});return this;}
 private request(method:string,params:Record<string,unknown>):Promise<any>{if(!this.child)throw new Error("MCP client is not connected");const id=this.next++;this.child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");return new Promise(resolve=>this.pending.set(id,resolve));}
 definitions(){return this.tools;}
 async call(name:string,input:Record<string,unknown>){this.trace?.("mcp.tool.called",{name});const result=await this.request("tools/call",{name,arguments:input});if(result?.isError){this.trace?.("mcp.tool.failed",{name,error:result});throw new Error(`MCP tool failed: ${name}`);}return (result?.content??[]).map((x:any)=>x.text??JSON.stringify(x)).join("\n");}
 close(){this.child?.kill();}
}
export function mcpTools(client:McpClient):Tool[]{return client.definitions().map(def=>({name:def.name,description:def.description,inputSchema:def.inputSchema,execute:(input)=>client.call(def.name,input)}));}
