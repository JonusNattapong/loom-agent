import {createHash,timingSafeEqual,randomUUID} from "node:crypto";
import {createServer} from "node:https";
import {WebSocket,WebSocketServer} from "ws";
import type {AddressInfo} from "node:net";
import {PROTOCOL_VERSION,WorkerCapability,WorkerIdentity,WorkerLoad,ProtocolEnvelope,WorkerTransport,createEnvelope,WorkerTrust} from "./index.js";

export type RemoteAuthRecord={tokenHash:string;workerId?:string;enabled?:boolean;trust?:WorkerTrust};
export type WebSocketControllerOptions={host?:string;port?:number;path?:string;maxMessageBytes?:number;authTimeoutMs?:number;credentials?:RemoteAuthRecord[];tls?:{key:string|Buffer;cert:string|Buffer}};
export type AuthenticatedWorker={identity:WorkerIdentity;capabilities:WorkerCapability[];load:WorkerLoad;connectionId:string;transport:WorkerTransport};

export function hashWorkerToken(token:string){return createHash("sha256").update(token).digest("hex");}
export function verifyWorkerToken(token:string,expectedHash:string){const actual=Buffer.from(hashWorkerToken(token),"hex"),expected=Buffer.from(expectedHash,"hex");return actual.length===expected.length&&timingSafeEqual(actual,expected);}

class SocketTransport implements WorkerTransport{
 constructor(private readonly socket:WebSocket){}
 send(envelope:ProtocolEnvelope){if(this.socket.readyState!==WebSocket.OPEN)throw new Error("websocket is not open");this.socket.send(JSON.stringify(envelope));}
 close(){this.socket.close();}
 onMessage(handler:(envelope:ProtocolEnvelope)=>void){this.socket.on("message",data=>{try{const parsed=JSON.parse(data.toString());if(parsed?.kind) return;handler(parsed);}catch{this.socket.close(1003,"invalid JSON");}});}
 onDisconnect(handler:(error?:unknown)=>void){this.socket.on("close",()=>handler());this.socket.on("error",handler);}
}

export class WebSocketControllerTransport{
 private server?:WebSocketServer; private readonly sockets=new Map<string,SocketTransport>(); private workerHandler?: (worker:AuthenticatedWorker)=>void;
 constructor(private readonly options:WebSocketControllerOptions={}){}
 onWorker(handler:(worker:AuthenticatedWorker)=>void){this.workerHandler=handler;}
 async start(){if(this.server) return;const path=this.options.path??"/v1/workers/connect";const maxPayload=this.options.maxMessageBytes??1024*1024;if(this.options.tls){const httpsServer=createServer({key:this.options.tls.key,cert:this.options.tls.cert});this.server=new WebSocketServer({server:httpsServer,path,maxPayload});httpsServer.listen(this.options.port??4778,this.options.host??"127.0.0.1");}else this.server=new WebSocketServer({host:this.options.host??"127.0.0.1",port:this.options.port??4778,path,maxPayload});this.server.on("connection",socket=>this.handleConnection(socket));await new Promise<void>((resolve,reject)=>{this.server!.once("listening",()=>resolve());this.server!.once("error",reject);});}
 address(){return this.server?.address() as AddressInfo|undefined;}
 async stop(){if(!this.server)return;for(const socket of this.sockets.values())socket.close();await new Promise<void>(resolve=>this.server!.close(()=>resolve()));this.server=undefined;}
 async send(connectionId:string,envelope:ProtocolEnvelope){const socket=this.sockets.get(connectionId);if(!socket)throw new Error("worker connection not found");await socket.send(envelope);}
 private handleConnection(socket:WebSocket){let authenticated=false;const timer=setTimeout(()=>{if(!authenticated)socket.close(1008,"authentication timeout");},this.options.authTimeoutMs??10000);const onFirst=(data:Buffer)=>{if(authenticated)return;try{const hello=JSON.parse(data.toString());if(hello?.kind!=="auth")throw new Error("authentication required");if(hello.protocol!==PROTOCOL_VERSION||typeof hello.token!=="string"||!hello.worker?.workerId||!hello.worker?.instanceId)throw new Error("invalid authentication");const record=this.options.credentials?.find(candidate=>(candidate.enabled??true)&&(!candidate.workerId||candidate.workerId===hello.worker.workerId)&&verifyWorkerToken(hello.token,candidate.tokenHash));if(!record)throw new Error("authentication failed");authenticated=true;clearTimeout(timer);socket.off("message",onFirst);const connectionId=`conn_${randomUUID()}`;const transport=new SocketTransport(socket);this.sockets.set(connectionId,transport);const identity={...(hello.worker as WorkerIdentity),trust:record.trust??"untrusted" as WorkerTrust};socket.send(JSON.stringify({kind:"ready",protocol:PROTOCOL_VERSION,connectionId,epoch:1}));transport.onDisconnect(()=>this.sockets.delete(connectionId));this.workerHandler?.({identity,capabilities:Array.isArray(hello.capabilities)?hello.capabilities:[],load:hello.load??{running:0,capacity:1},connectionId,transport});}catch(error){clearTimeout(timer);socket.send(JSON.stringify({kind:"auth_error",code:"authentication_failed"}));socket.close(1008,"authentication failed");}};socket.on("message",onFirst);}
}

export type WebSocketWorkerOptions={url:string;worker:WorkerIdentity;token:string;capabilities?:WorkerCapability[]|string[];load?:WorkerLoad;reconnect?:boolean;minBackoffMs?:number;maxBackoffMs?:number};
export class WebSocketWorkerTransport implements WorkerTransport{
 connectionId?:string; epoch=1; private socket?:WebSocket; private messageHandler:(envelope:ProtocolEnvelope)=>void=()=>{}; private disconnectHandler:(error?:unknown)=>void=()=>{}; private stopped=false; private sequence=0;
 constructor(private readonly options:WebSocketWorkerOptions){}
 async connect(){this.stopped=false;this.socket=new WebSocket(this.options.url);await new Promise<void>((resolve,reject)=>{const socket=this.socket!;socket.once("open",()=>{socket.send(JSON.stringify({kind:"auth",protocol:PROTOCOL_VERSION,token:this.options.token,worker:this.options.worker,capabilities:this.options.capabilities??[],load:this.options.load??{running:0,capacity:1}}));});socket.on("message",data=>{try{const parsed=JSON.parse(data.toString());if(parsed?.kind==="ready"){this.connectionId=parsed.connectionId;this.epoch=parsed.epoch??1;resolve();return;}if(parsed?.kind==="auth_error"){reject(new Error(parsed.code));return;}if(parsed?.kind) return;this.messageHandler(parsed);}catch(error){this.disconnectHandler(error);}});socket.once("error",reject);socket.once("close",()=>{this.disconnectHandler();if(!this.stopped)reject(new Error("connection closed"));});});}
 async send(envelope:ProtocolEnvelope){for(let attempt=0;attempt<200;attempt++){if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(envelope));return;}if(this.stopped)throw new Error("worker transport is stopped");await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("websocket is not open");}
 sendEnvelope<T>(type:ProtocolEnvelope["type"],payload:T,lease?:ProtocolEnvelope["lease"]){return createEnvelope({type,id:`worker_${randomUUID()}`,sender:this.options.worker,connectionId:this.connectionId,epoch:this.epoch,sequence:++this.sequence,payload,lease});}
 onMessage(handler:(envelope:ProtocolEnvelope)=>void){this.messageHandler=handler;}
 onDisconnect(handler:(error?:unknown)=>void){this.disconnectHandler=handler;}
 async close(){this.stopped=true;this.socket?.close();}
}
