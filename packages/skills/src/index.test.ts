import {describe,it,expect} from "vitest";
import {mkdtemp,writeFile,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SkillRuntime} from "./index.js";
describe("SkillRuntime",()=>{it("discovers and parses skill metadata",async()=>{const root=await mkdtemp(join(tmpdir(),"loom-skills-"));await mkdir(join(root,"testing"));await writeFile(join(root,"testing","SKILL.md"),"---\nname: testing\ndescription: Run tests\ntools: [shell, read_file]\n---\nUse focused tests.");const skill=await new SkillRuntime(root).get("testing");expect(skill?.description).toBe("Run tests");expect(skill?.tools).toEqual(["shell","read_file"]);await rm(root,{recursive:true,force:true});});});
