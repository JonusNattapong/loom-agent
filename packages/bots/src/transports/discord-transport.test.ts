import {describe, expect, it} from "vitest";
import {DiscordTransport} from "./discord-transport";

describe("DiscordTransport",()=>{
  it("requires the configured token environment variable",async()=>{
    const key="LOOM_TEST_DISCORD_TOKEN"; delete process.env[key];
    await expect(new DiscordTransport({tokenEnv:key}).start()).rejects.toThrow(`Missing environment variable: ${key}`);
  });
  it("ignores messages authored by bots",async()=>{
    const events:any[]=[]; const transport=new DiscordTransport({onEvent:e=>{events.push(e)}});
    (transport as any).client={user:{id:"bot"}};
    await transport.handleMessage({id:"m1",author:{bot:true,id:"bot"},content:"loop",channelId:"c",channel:{isThread:()=>false},mentions:{users:{has:()=>false}},attachments:new Map(),createdAt:new Date(),guildId:null} as any);
    expect(events).toHaveLength(0);
  });
  it("normalizes user messages and mentions",async()=>{
    const events:any[]=[]; const transport=new DiscordTransport({onEvent:e=>{events.push(e)}});
    (transport as any).client={user:{id:"bot"}};
    const base={author:{bot:false,id:"user"},content:"hello",channelId:"c",channel:{isThread:()=>true},mentions:{users:{has:(id:string)=>id==="bot"}},attachments:new Map(),createdAt:new Date("2025-01-01T00:00:00Z"),guildId:"g"};
    await transport.handleMessage({id:"m1",...base} as any);
    expect(events[0]).toMatchObject({id:"m1",transport:"discord",type:"mention",channelId:"c",threadId:"c",userId:"user",workspaceId:"g"});
  });
});
