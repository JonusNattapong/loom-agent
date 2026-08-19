import {describe,it,expect} from "vitest";
import {mcpTools} from "./index.js";
describe("MCP adapter",()=>{it("normalizes MCP definitions to Loom tools",async()=>{const fake={definitions:()=>[{name:"echo",description:"Echo",inputSchema:{type:"object"}}],call:async(_name:string,input:Record<string,unknown>)=>JSON.stringify(input)} as any;const tool=mcpTools(fake)[0];expect(tool.name).toBe("echo");await expect(tool.execute({value:"ok"})).resolves.toBe('{"value":"ok"}');});});
