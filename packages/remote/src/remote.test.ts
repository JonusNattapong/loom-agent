import {describe,expect,it} from "vitest";
import {DeterministicRouter,LeaseManager,SequenceJournal,WorkerRegistry,assertFencingToken,normalizeCapabilities} from "../src/index.js";
const identity=(workerId:string)=>({workerId,instanceId:`${workerId}-1`,trust:"trusted" as const});
describe("remote protocol",()=>{
 it("normalizes capability names deterministically",()=>expect(normalizeCapabilities([{name:" Zeta ",roles:["Coder"],tools:["Shell"]},{name:"zeta",version:"2"},{name:"alpha"}])).toEqual({names:["alpha","zeta"],roles:["coder"],tools:["shell"],versions:{zeta:"2"}}));
 it("routes with capability and stable tie break",()=>{const r=new WorkerRegistry();r.register(identity("b"),["gpu"],{running:0,capacity:1});r.register(identity("a"),["gpu"],{running:0,capacity:1});expect(new DeterministicRouter(r).route({jobId:"j",payload:0,requiredCapabilities:["GPU"]})?.workerId).toBe("a");});
 it("fences stale leases",()=>{const l=new LeaseManager();const a=l.acquire("j","a",100,0);expect(l.validate("j",a,1)).toBe(true);expect(()=>l.renew("j",{...a,fencingToken:0},10,1)).toThrow();l.release("j",a,2);const b=l.acquire("j","b",100,3);expect(b.fencingToken).toBeGreaterThan(a.fencingToken);expect(()=>assertFencingToken(a.fencingToken,b)).toThrow();});
 it("replays unacknowledged sequence in order",()=>{const j=new SequenceJournal(identity("a"));j.append("dispatch",{x:1});j.append("result",{x:2});j.append("ack",{x:3});j.acknowledge(1);expect(j.replay().map(x=>x.sequence)).toEqual([2,3]);});
});
