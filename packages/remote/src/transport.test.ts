import {describe,expect,it} from "vitest";
import {StateStore} from "@loom/state";
import {RemoteFabricController,hashWorkerToken,WebSocketControllerTransport,WebSocketWorkerTransport,RemoteWorkerRuntime} from "./index.js";

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

describe("websocket reverse transport",()=>{
 it("authenticates an outbound worker and carries assignment ACKs",async()=>{const state=new StateStore(":memory:"),server=new WebSocketControllerTransport({host:"127.0.0.1",port:0,credentials:[{workerId:"w1",tokenHash:hashWorkerToken("secret")} ]});const controller=new RemoteFabricController(state);let connectionId="";server.onWorker(worker=>{connectionId=worker.connectionId;controller.attach(worker.identity,worker.transport,worker.capabilities,worker.load,worker.connectionId);});await server.start();const address=server.address()!;const runtime=new RemoteWorkerRuntime({url:`ws://127.0.0.1:${address.port}/v1/workers/connect`,workerId:"w1",token:"secret",capabilities:["shell"]});await runtime.start();const result=await controller.dispatch({jobId:"network-job",payload:{x:1},requiredCapabilities:["shell"]});expect(result.assignmentId).toBe("network-job");await wait(25);expect(state.listUnackedProtocolMessages(connectionId)).toHaveLength(0);await runtime.stop();await wait(25);await server.stop();state.close();});
 it("rejects invalid credentials while keeping the endpoint healthy",async()=>{const server=new WebSocketControllerTransport({host:"127.0.0.1",port:0,authTimeoutMs:1000,credentials:[{workerId:"w1",tokenHash:hashWorkerToken("secret")} ]});await server.start();const address=server.address()!;const bad=new WebSocketWorkerTransport({url:`ws://127.0.0.1:${address.port}/v1/workers/connect`,worker:{workerId:"w1",instanceId:"bad",trust:"untrusted"},token:"wrong"});await expect(bad.connect()).rejects.toThrow();await server.stop();});
});
