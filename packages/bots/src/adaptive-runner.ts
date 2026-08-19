import type {Provider} from "@loom/core";
import {StateStore} from "@loom/state";
import {AdaptiveOrchestrator} from "@loom/adaptive";
import type {AdaptiveBotRunner} from "./events/hardened-event-gateway";

export function createAdaptiveBotRunner(state:StateStore,provider:Provider):AdaptiveBotRunner {
 return {run:async input=>{
  const rootAgentId=input.rootAgentId??state.createAgentRecord({goal:input.goal,role:"planner"}).id;
  if(!state.getAgent(rootAgentId)) throw new Error(`bot root agent not found: ${rootAgentId}`);
  const result=await new AdaptiveOrchestrator(state,provider).run(rootAgentId,input.goal);
  const tasks=state.listPlanTasks(result.id); const completed=tasks.filter(t=>t.status==="completed");
  return {rootAgentId,status:state.getAgent(rootAgentId)?.status??result.status,response:completed.at(-1)?.result??`Adaptive run ${result.status}`};
 }};
}
