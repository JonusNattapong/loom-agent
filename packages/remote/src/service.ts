import type {StateStore} from "@loom/state";
import {RemoteFabricController} from "./index.js";
import {WebSocketControllerOptions,WebSocketControllerTransport} from "./transport.js";

export class RemoteControllerService{
 readonly transport:WebSocketControllerTransport; readonly fabric:RemoteFabricController;
 constructor(state:StateStore,options:WebSocketControllerOptions&{leaseMs?:number}={}){const {leaseMs,...transportOptions}=options;this.transport=new WebSocketControllerTransport(transportOptions);this.fabric=new RemoteFabricController(state,undefined,undefined,{},leaseMs??30000);this.transport.onWorker(worker=>{this.fabric.attach(worker.identity,worker.transport,worker.capabilities,worker.load,worker.connectionId);void this.fabric.reconnect(worker.identity.workerId,0);});}
 start(){return this.transport.start();}
 stop(){return this.transport.stop();}
 address(){return this.transport.address();}
}
