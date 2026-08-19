import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {WebSocketWorkerTransport,WebSocketWorkerOptions} from "./transport.js";
import {ProtocolEnvelope} from "./index.js";

export type RemoteWorkerRuntimeOptions=Omit<WebSocketWorkerOptions,"worker">&{workerId:string;stateFile?:string;onAssignment?:(envelope:ProtocolEnvelope)=>Promise<void>|void};
export class RemoteWorkerRuntime{
 readonly workerInstanceId:string; readonly workerId:string; readonly transport:WebSocketWorkerTransport; private running=false; private readonly assignments=new Set<string>();
 constructor(private readonly options:RemoteWorkerRuntimeOptions){this.workerId=options.workerId;this.workerInstanceId=randomUUID();const worker={workerId:options.workerId,instanceId:this.workerInstanceId,trust:"untrusted" as const};this.transport=new WebSocketWorkerTransport({...options,worker});}
 async start(){if(this.running)return;this.running=true;this.transport.onMessage(envelope=>void this.handle(envelope));this.transport.onDisconnect(()=>{if(this.running)void this.reconnect();});await this.connect();}
 private async connect(){let delay=this.options.minBackoffMs??250;while(this.running){try{await this.transport.connect();return;}catch(error){if(!this.running)throw error;if(error instanceof Error&&/authentication|unsupported|unauthorized/i.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,delay));delay=Math.min(this.options.maxBackoffMs??10000,delay*2);}}}
 private async reconnect(){await this.connect();}
 private async handle(envelope:ProtocolEnvelope){if(envelope.type!=="dispatch")return;const payload:any=envelope.payload;const id=String(payload.assignmentId??payload.executionId);const duplicate=this.assignments.has(id);if(!duplicate){this.assignments.add(id);if(this.options.onAssignment)await this.options.onAssignment(envelope);}
 const ack=this.transport.sendEnvelope("ack",{sequence:envelope.sequence,assignmentId:id},envelope.lease);await this.transport.send(ack);}
 async stop(){this.running=false;await this.transport.close();}
 status(){return {workerId:this.workerId,workerInstanceId:this.workerInstanceId,running:this.running,controller:this.options.url,assignments:[...this.assignments]};}
}
export function loadOrCreateWorkerId(file:string){try{return JSON.parse(readFileSync(file,"utf8")).workerId as string;}catch{mkdirSync(file.replace(/[\/][^\/]+$/,""),{recursive:true});const workerId=`worker_${randomUUID()}`;writeFileSync(file,JSON.stringify({workerId},null,2),{mode:0o600});return workerId;}}
