import {promises as fs} from "node:fs";
import {mkdir} from "node:fs/promises";
import {resolve,relative,isAbsolute} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {Tool} from "@loom/core";
const exec=promisify(execFile);
export type PermissionHooks={readFile?:(path:string)=>boolean;writeFile?:(path:string)=>boolean;shell?:(command:string)=>boolean};
function safePath(root:string,value:unknown):string{if(typeof value!=="string"||!value)throw new Error("path must be a non-empty string");const p=resolve(root,value);if(isAbsolute(value)&&!p.startsWith(resolve(root)))throw new Error("path is outside workspace");if(relative(resolve(root),p).startsWith(".."))throw new Error("path is outside workspace");return p;}
export class ToolRegistry{private tools=new Map<string,Tool>();register(tool:Tool){this.tools.set(tool.name,tool);return this;}get(name:string){return this.tools.get(name);}list(){return [...this.tools.values()];}}
export class ToolExecutor{constructor(private readonly registry:ToolRegistry){}execute(name:string,input:Record<string,unknown>){const t=this.registry.get(name);if(!t)throw new Error(`unknown tool: ${name}`);return t.execute(input);}}
export function createNativeTools(root=process.cwd(),hooks:PermissionHooks={}):ToolRegistry{
 const r=new ToolRegistry();
 r.register({name:"read_file",description:"Read a UTF-8 file inside the workspace",execute:async i=>{const p=safePath(root,i.path);if(hooks.readFile&&!hooks.readFile(p))throw new Error("read permission denied");return fs.readFile(p,"utf8");}});
 r.register({name:"write_file",description:"Write a UTF-8 file inside the workspace",execute:async i=>{const p=safePath(root,i.path);if(hooks.writeFile&&!hooks.writeFile(p))throw new Error("write permission denied");if(typeof i.content!=="string")throw new Error("content must be a string");await mkdir(resolve(p,".."),{recursive:true});await fs.writeFile(p,i.content,"utf8");return `wrote ${p}`;}});
 r.register({name:"shell",description:"Run a command with a timeout",execute:async i=>{if(typeof i.command!=="string"||!i.command)throw new Error("command must be a non-empty string");if(hooks.shell&&!hooks.shell(i.command))throw new Error("shell permission denied");const timeout=typeof i.timeoutMs==="number"?Math.min(Math.max(i.timeoutMs,1),120000):30000;const result=await exec(process.platform==="win32"?"cmd":"sh",process.platform==="win32"?["/d","/s","/c",i.command] : ["-c",i.command],{cwd:root,timeout,maxBuffer:1024*1024});return `${result.stdout}${result.stderr}`.trim();}});
 return r;
}
