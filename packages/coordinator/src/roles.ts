import {promises as fs} from "node:fs";
import {join} from "node:path";
import type {AgentRole,RoleDefinition} from "@loom-agent/core";

const definitions:Record<AgentRole,RoleDefinition>={
  planner:{role:"planner",instructions:"Plan work, delegate bounded tasks, and aggregate verified results.",allowedTools:["read_file","shell"],allowedSkills:[],completionCriteria:["All delegated work is persisted","Required verification passed"]},
  researcher:{role:"researcher",instructions:"Investigate the assigned question and return concise findings. Do not modify files.",allowedTools:["read_file","shell"],allowedSkills:[],completionCriteria:["Findings answer the assigned question","Evidence is summarized"]},
  coder:{role:"coder",instructions:"Make the smallest safe implementation change for the assigned task.",allowedTools:["read_file","write_file","shell"],allowedSkills:[],completionCriteria:["Requested change is implemented","Relevant tests are reported"]},
  reviewer:{role:"reviewer",instructions:"Review artifacts and verification evidence independently. Do not modify files.",allowedTools:["read_file","shell"],allowedSkills:[],completionCriteria:["Diff and tests are reviewed","Acceptance or rejection has a reason"]},
  tester:{role:"tester",instructions:"Run scoped verification and report reproducible results. Do not modify files.",allowedTools:["read_file","shell"],allowedSkills:[],completionCriteria:["Test command and result are recorded"]},
  general:{role:"general",instructions:"Complete the assigned task carefully and return a concise result.",allowedTools:["read_file","write_file","shell"],allowedSkills:[],completionCriteria:["Assigned task is complete"]},
};

export class RoleRegistry{
  private readonly roles=new Map<AgentRole,RoleDefinition>(Object.values(definitions).map(role=>[role.role,{...role}]));
  constructor(private readonly directory=join(process.cwd(),".loom","agents")){}
  get(role:AgentRole):RoleDefinition{return this.roles.get(role)??this.roles.get("general")!;}
  list():RoleDefinition[]{return [...this.roles.values()];}
  async load(role:AgentRole):Promise<RoleDefinition>{
    const base=this.get(role);
    try{const instructions=(await fs.readFile(join(this.directory,`${role}.md`),"utf8")).trim();return {...base,instructions};}
    catch{return base;}
  }
}
