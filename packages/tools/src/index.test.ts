import {describe,it,expect} from "vitest";
import {createNativeTools} from "./index.js";
describe("native tools",()=>{it("rejects paths outside workspace",async()=>{const tools=createNativeTools(process.cwd());await expect(tools.get("read_file")!.execute({path:"../secret"})).rejects.toThrow("outside workspace");});it("writes and reads a file",async()=>{const root=".loom-test-tools";const tools=createNativeTools(root);await tools.get("write_file")!.execute({path:"a.txt",content:"ok"});await expect(tools.get("read_file")!.execute({path:"a.txt"})).resolves.toBe("ok");});});
