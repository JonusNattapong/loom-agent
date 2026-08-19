import {describe,expect,it} from "vitest";
import {EventGateway} from "./hardened-event-gateway";
import {EnhancedBotSessionManager} from "../sessions/enhanced-session-manager";
import {StateStore} from "@loom/state";
import type {BotEvent,} from "../types";
import {createAdaptiveBotRunner} from "../adaptive-runner";
import type {Provider} from "@loom/core";
const event=(id:string,text:string):BotEvent=>({id,transport:"test",type:"message",botId:"bot",channelId:"dm",userId:"u",text,timestamp:new Date().toISOString()});
describe("adaptive bot gateway",()=>it("reuses the session root for follow-ups",async()=>{const state=new StateStore(":memory:");let roots:string[]=[];const provider:Provider={name:"bot-test",complete:async()=>({content:"verified"})};const adaptive=createAdaptiveBotRunner(state,provider);const runner={run:async(input:{goal:string;session:any;rootAgentId?:string})=>{const result=await adaptive.run(input);roots.push(result.rootAgentId);return result;}};const gateway=new EventGateway(state,new EnhancedBotSessionManager(state,{authorization:{allowedUsers:["u"],allowedChannels:[],admins:[]}}),runner);const first=await gateway.processEvent(event("1","fix tests"));const second=await gateway.processEvent(event("2","what is current status?"));expect(first.status).toBe("handled");expect(second.status).toBe("handled");expect(first.response).toContain("evidence");expect(roots).toHaveLength(2);expect(roots[1]).toBe(roots[0]);state.close();}));
