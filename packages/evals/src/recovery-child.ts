import {readFileSync,existsSync,writeFileSync} from "node:fs";
import type {Provider,ProviderResponse} from "@loom/core";
import {StateStore} from "@loom/state";
import {AdaptiveOrchestrator} from "@loom/adaptive";
function crashNow(){// Hard self-terminate. SIGKILL string form is unsupported on Windows.
  if(process.platform==="win32")process.exit(137);
  else process.kill(process.pid,"SIGKILL");
}
const [db,rootFile,marker,mode]=process.argv.slice(2);
class CrashProvider implements Provider {readonly name="crash-e2e"; private n=0; async generate():Promise<ProviderResponse>{if(mode==="crash"&&this.n===0){this.n++;return {content:JSON.stringify({summary:"e2e",tasks:[{id:"work",title:"execute durable work",description:"work",role:"coder",dependencies:[]}]})};}if((mode==="resume"&&this.n===0)||(mode==="crash"&&this.n===1)){this.n++;return {content:"continue",toolCalls:[{id:"side-effect-1",name:"write_marker",input:{}}]};}return {content:"completed after recovery"};}}
const state=new StateStore(db);let rootId=existsSync(rootFile)?readFileSync(rootFile,"utf8"):state.createAgentRecord({goal:"process recovery",role:"planner"}).id;if(!existsSync(rootFile))writeFileSync(rootFile,rootId);const crash=mode==="crash";const result=await new AdaptiveOrchestrator(state,new CrashProvider(),{maxModelRounds:4,tool:async()=>{if(!existsSync(marker))writeFileSync(marker,"side-effect-once");return existsSync(marker)?"marker durable":"marker";},afterExecutionCheckpoint:async()=>{if(crash)crashNow();}}).run(rootId,"process recovery");console.log(JSON.stringify({rootId,status:result.status,rounds:state.listExecutionRounds(state.listPlanTasks(result.id)[0]?.id??"").length}));state.close();
