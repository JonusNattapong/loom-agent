/** Versioned coordinator/remote-worker protocol primitives (V0.8). */
export const PROTOCOL_VERSION = "0.8" as const;

export type ProtocolType = "register" | "heartbeat" | "dispatch" | "accepted" | "started" | "renew" | "ack" | "result" | "error" | "disconnect";
export type WorkerTrust = "untrusted" | "trusted" | "approved";
export type WorkerIdentity = { workerId: string; name?: string; trust: WorkerTrust; instanceId: string };
export type WorkerLoad = { running: number; capacity: number };
export type WorkerCapability = { name: string; version?: string; roles?: string[]; tools?: string[] };
export type NormalizedCapabilities = { names: string[]; roles: string[]; tools: string[]; versions: Record<string,string> };
export type ProtocolEnvelope<T = unknown> = {
  protocol: typeof PROTOCOL_VERSION; type: ProtocolType; id: string; sentAt: string;
  sender: WorkerIdentity; connectionId?: string; epoch?: number; sequence: number; payload: T; lease?: LeaseToken;
};
export type LeaseToken = { leaseId: string; workerId: string; fencingToken: number; expiresAt: string };
export type RemoteJob = { jobId: string; payload: unknown; requiredCapabilities?: string[]; role?: string; priority?: number };
export type DispatchAssignment = { job: RemoteJob; lease: LeaseToken };

const unique = (values: Iterable<string>) => [...new Set([...values].map(v => v.trim().toLowerCase()).filter(Boolean))].sort();
export function normalizeCapabilities(capabilities: WorkerCapability[] | string[] = []): NormalizedCapabilities {
  const items = capabilities.map(c => typeof c === "string" ? {name:c} : c);
  const names = unique(items.map(c => c.name));
  const roles = unique(items.flatMap(c => c.roles ?? []));
  const tools = unique(items.flatMap(c => c.tools ?? []));
  const versions: Record<string,string> = {};
  for (const c of items) if (c.version?.trim()) {
    const name=c.name.trim().toLowerCase(); if (!versions[name] || c.version > versions[name]) versions[name]=c.version;
  }
  return {names, roles, tools, versions};
}

export function createEnvelope<T>(input: Omit<ProtocolEnvelope<T>, "protocol" | "sentAt"> & {sentAt?: string}): ProtocolEnvelope<T> {
  if (!input.id || !input.sender.workerId || !Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new Error("invalid protocol envelope");
  return {protocol: PROTOCOL_VERSION, sentAt: input.sentAt ?? new Date().toISOString(), ...input};
}
export class ProtocolValidationError extends Error { constructor(public readonly code:string,message:string){super(message);this.name="ProtocolValidationError";} }
export function validateEnvelope(value: unknown): ProtocolEnvelope {
  if(!value || typeof value!=="object") throw new ProtocolValidationError("malformed_envelope","envelope must be an object");
  const v=value as Partial<ProtocolEnvelope>;
  if(v.protocol!==PROTOCOL_VERSION) throw new ProtocolValidationError("unsupported_version",`unsupported protocol version: ${String(v.protocol)}`);
  if(typeof v.id!=="string" || !v.id) throw new ProtocolValidationError("invalid_message_id","message id is required");
  if(typeof v.type!=="string" || !((["register","heartbeat","dispatch","accepted","started","renew","ack","result","error","disconnect"] as string[]).includes(v.type))) throw new ProtocolValidationError("invalid_message_type","message type is invalid");
  if(!Number.isSafeInteger(v.sequence) || (v.sequence as number)<1) throw new ProtocolValidationError("invalid_sequence","sequence must be a positive safe integer");
  if(typeof v.sentAt!=="string" || !v.sender || typeof v.sender.workerId!=="string" || typeof v.sender.instanceId!=="string") throw new ProtocolValidationError("invalid_sender","sender identity is invalid");
  return v as ProtocolEnvelope;
}
export function isProtocolEnvelope(value: unknown): value is ProtocolEnvelope { try { validateEnvelope(value); return true; } catch { return false; } }

export class WorkerRegistry {
  private readonly workers = new Map<string, {identity:WorkerIdentity; capabilities:NormalizedCapabilities; load:WorkerLoad; lastSeen:number; epoch:number; connected:boolean}>();
  register(identity:WorkerIdentity, capabilities:WorkerCapability[]|string[], load:WorkerLoad={running:0,capacity:1}, now=Date.now()) {
    if (!identity.workerId || !identity.instanceId) throw new Error("worker identity requires workerId and instanceId");
    const previous=this.workers.get(identity.workerId); const epoch=(previous?.epoch??0)+1; const record={identity:{...identity},capabilities:normalizeCapabilities(capabilities),load:{...load},lastSeen:now,epoch,connected:true}; this.workers.set(identity.workerId,record); return {...record,capabilities:{...record.capabilities, names:[...record.capabilities.names],roles:[...record.capabilities.roles],tools:[...record.capabilities.tools]}};
  }
  heartbeat(workerId:string, load?:WorkerLoad, now=Date.now()) { const w=this.workers.get(workerId); if(!w) throw new Error("unknown worker"); if(load) w.load={...load}; w.lastSeen=now; w.connected=true; return w; }
  disconnect(workerId:string){const w=this.workers.get(workerId);if(w)w.connected=false;}
  eligible(job:RemoteJob, policy:{trust?:WorkerTrust;allowedWorkers?:string[]}={}){const required=unique(job.requiredCapabilities??[]);return this.list().filter(w=>w.connected&&(!policy.allowedWorkers||policy.allowedWorkers.includes(w.identity.workerId))&&(!policy.trust||["untrusted","trusted","approved"].indexOf(w.identity.trust)>= ["untrusted","trusted","approved"].indexOf(policy.trust))&&(!job.role||w.capabilities.roles.includes(job.role.toLowerCase()))&&required.every(c=>w.capabilities.names.includes(c)||w.capabilities.tools.includes(c))&&w.load.running<w.load.capacity);}
  get(workerId:string){return this.workers.get(workerId)}
  list(){return [...this.workers.values()].sort((a,b)=>a.identity.workerId.localeCompare(b.identity.workerId));}
}

export class DeterministicRouter {
  constructor(private readonly registry:WorkerRegistry) {}
  route(job:RemoteJob, policy:{trust?:WorkerTrust;allowedWorkers?:string[]}={}): WorkerIdentity | undefined {
    const required=unique(job.requiredCapabilities ?? []), candidates=this.registry.eligible(job,policy).filter(w => (job.role ? w.capabilities.roles.includes(job.role.toLowerCase()) : true) && required.every(c=>w.capabilities.names.includes(c)||w.capabilities.tools.includes(c)) && w.load.running < w.load.capacity);
    candidates.sort((a,b)=> { const ar=required.filter(c=>a.capabilities.names.includes(c)).length, br=required.filter(c=>b.capabilities.names.includes(c)).length; return br-ar || (a.load.running/a.load.capacity)-(b.load.running/b.load.capacity) || a.identity.workerId.localeCompare(b.identity.workerId); });
    return candidates[0]?.identity;
  }
}

export class LeaseManager {
  private nextFence=0; private active=new Map<string,LeaseToken>();
  acquire(jobId:string, workerId:string, ttlMs:number, now=Date.now()):LeaseToken { const old=this.active.get(jobId); if(old && Date.parse(old.expiresAt)>now) throw new Error("job lease is active"); const token={leaseId:`${jobId}:${workerId}:${this.nextFence+1}`,workerId,fencingToken:++this.nextFence,expiresAt:new Date(now+ttlMs).toISOString()}; this.active.set(jobId,token); return token; }
  renew(jobId:string, token:LeaseToken, ttlMs:number, now=Date.now()):LeaseToken { const current=this.active.get(jobId); if(!current || !this.valid(current,token,now)) throw new Error("stale or invalid lease"); const renewed={...current,expiresAt:new Date(now+ttlMs).toISOString()}; this.active.set(jobId,renewed); return renewed; }
  release(jobId:string, token:LeaseToken, now=Date.now()){const current=this.active.get(jobId); if(!current || !this.valid(current,token,now)) return false; this.active.delete(jobId); return true;}
  validate(jobId:string, token:LeaseToken, now=Date.now()){const current=this.active.get(jobId); return !!current && this.valid(current,token,now);}
  private valid(a:LeaseToken,b:LeaseToken,now:number){return a.leaseId===b.leaseId&&a.workerId===b.workerId&&a.fencingToken===b.fencingToken&&Date.parse(a.expiresAt)>now;}
}

export class SequenceJournal<T=unknown> {
  private next=1; private acknowledged=0; private received=0; private pending=new Map<number,ProtocolEnvelope<T>>();
  constructor(private readonly sender:WorkerIdentity) {}
  append(type:ProtocolType,payload:T, lease?:LeaseToken, id=`msg-${this.next}`) { const envelope=createEnvelope({type,id,sender:this.sender,sequence:this.next++,payload,lease}); this.pending.set(envelope.sequence,envelope); return envelope; }
  acknowledge(sequence:number){if(sequence>this.acknowledged)this.acknowledged=sequence; for(const n of this.pending.keys())if(n<=sequence)this.pending.delete(n);}
  replay(afterSequence=this.acknowledged){return [...this.pending.entries()].filter(([n])=>n>afterSequence).sort(([a],[b])=>a-b).map(([,e])=>e);}
  receive(envelope:ProtocolEnvelope<T>){if(envelope.sequence<=this.received)return "duplicate";if(envelope.sequence!==this.received+1)throw new Error("protocol sequence gap");this.received=envelope.sequence;return "accepted";}
  get lastSequence(){return this.next-1} get lastAcknowledged(){return this.acknowledged}
}

export function assertFencingToken(expected:number, received:LeaseToken){if(received.fencingToken!==expected)throw new Error("stale fencing token");}

export interface WorkerTransport {send(envelope:ProtocolEnvelope):Promise<void>|void;close():Promise<void>|void;onMessage(handler:(envelope:ProtocolEnvelope)=>void):void;onDisconnect(handler:(error?:unknown)=>void):void;}
export interface RemoteDispatchResult {assignmentId:string;workerId:string;lease:LeaseToken;}
export class RemoteFabricController {
 private readonly transports=new Map<string,WorkerTransport>(); private readonly journals=new Map<string,SequenceJournal>(); private readonly receiveSequences=new Map<string,number>(); private readonly connections=new Map<string,{connectionId:string;instanceId:string;epoch:number}>();
 constructor(private readonly state:any,private readonly registry:WorkerRegistry=new WorkerRegistry(),private readonly leases:LeaseManager=new LeaseManager(),private readonly policy:{trust?:WorkerTrust;allowedWorkers?:string[]}={}){}
 attach(worker:WorkerIdentity,transport:WorkerTransport,capabilities:WorkerCapability[]|string[],load:WorkerLoad={running:0,capacity:1},boundConnectionId?:string){const previous=this.connections.get(worker.workerId);if(previous)this.transports.get(worker.workerId)?.close();const epoch=(previous?.epoch??0)+1;const connectionId=boundConnectionId??`conn-${worker.workerId}-${epoch}`;this.state.registerWorker({workerId:worker.workerId,name:worker.name,capabilities,metadata:{trust:worker.trust,instanceId:worker.instanceId,epoch}});this.state.openWorkerConnection({connectionId,workerId:worker.workerId,transport:"abstract",metadata:{instanceId:worker.instanceId,epoch}});this.registry.register(worker,capabilities,load);this.transports.set(worker.workerId,transport);this.journals.set(worker.workerId,new SequenceJournal(worker));this.connections.set(worker.workerId,{connectionId,instanceId:worker.instanceId,epoch});transport.onMessage(e=>void this.receive(e,{workerId:worker.workerId,connectionId,instanceId:worker.instanceId,epoch}));transport.onDisconnect(()=>{const current=this.connections.get(worker.workerId);this.state.closeWorkerConnection(connectionId);if(current?.connectionId!==connectionId)return;this.state.setWorkerStatus(worker.workerId,"offline");this.registry.disconnect(worker.workerId);this.transports.delete(worker.workerId);});return {worker,connectionId,epoch};}
 async dispatch(job:RemoteJob):Promise<RemoteDispatchResult>{const worker=new DeterministicRouter(this.registry).route(job,this.policy);if(!worker)throw new Error("no compatible online worker");const transport=this.transports.get(worker.workerId),connection=this.connections.get(worker.workerId);if(!transport||!connection)throw new Error("worker transport unavailable");const existing=this.state.getRemoteAssignment?.(job.jobId);if(existing&&existing.workerId===worker.workerId&&existing.status!=="expired"){const current=this.state.getRemoteLease?.(existing.leaseId);if(current&&current.status==="active")return {assignmentId:existing.id,workerId:worker.workerId,lease:{leaseId:current.id,workerId:current.workerId,fencingToken:current.fencingToken,expiresAt:new Date(current.expiresAt).toISOString()}};}const lease=this.leases.acquire(job.jobId,worker.workerId,30000);const assignment=this.state.assignRemote({workerId:worker.workerId,payload:job.payload,taskId:job.jobId,id:job.jobId});const durableLease=this.state.acquireRemoteLease(assignment.id,worker.workerId,30000);const effectiveLease={...lease,leaseId:durableLease.id,fencingToken:durableLease.fencingToken,expiresAt:new Date(durableLease.expiresAt).toISOString()};const sequence=this.state.nextProtocolSequence(connection.connectionId);const envelope=createEnvelope({type:"dispatch",id:assignment.id,sender:worker,connectionId:connection.connectionId,epoch:connection.epoch,sequence,payload:{assignmentId:assignment.id,executionId:job.jobId,requirements:job.requiredCapabilities??[],payload:job.payload},lease:effectiveLease});this.state.recordProtocolMessage({messageId:envelope.id,connectionId:connection.connectionId,direction:"outbound",sequence,envelope});await transport.send(envelope);this.state.setWorkerStatus(worker.workerId,"online");return {assignmentId:assignment.id,workerId:worker.workerId,lease:effectiveLease};}
 async receive(envelope:ProtocolEnvelope,bound?:{workerId:string;connectionId:string;instanceId:string;epoch:number}){if(!bound)throw new ProtocolValidationError("unbound_transport","inbound messages require a transport binding");const checked=validateEnvelope(envelope); envelope=checked; const worker=this.registry.get(bound.workerId);if(!worker||envelope.sender.workerId!==bound.workerId||envelope.sender.instanceId!==bound.instanceId||envelope.connectionId!==bound.connectionId||envelope.epoch!==bound.epoch)throw new ProtocolValidationError("unauthorized_connection","worker connection identity is not current");const connection=this.connections.get(bound.workerId);if(!connection||connection.connectionId!==bound.connectionId||connection.epoch!==bound.epoch)throw new ProtocolValidationError("stale_epoch","connection epoch is stale");const previous=this.receiveSequences.get(bound.connectionId)??0;if(envelope.sequence<=previous)return;if(envelope.sequence!==previous+1)throw new ProtocolValidationError("sequence_gap",`expected sequence ${previous+1}`);this.receiveSequences.set(bound.connectionId,envelope.sequence);if(envelope.type==="heartbeat"){this.registry.heartbeat(worker.identity.workerId,(envelope.payload as any)?.load);this.state.heartbeatWorker(worker.identity.workerId);return;}if(envelope.type==="ack"){const ack=Number((envelope.payload as any)?.sequence??envelope.sequence);if(!Number.isSafeInteger(ack)||ack<1)throw new ProtocolValidationError("invalid_ack","ack sequence is invalid");this.journals.get(worker.identity.workerId)?.acknowledge(Math.min(ack,this.journals.get(worker.identity.workerId)!.lastSequence));this.state.ackProtocolMessage(connection.connectionId,"outbound",ack);return;}const executionId=String((envelope.payload as any)?.executionId??"");if(executionId){const payload:any=envelope.payload;const result=this.state.acceptRemoteEvent?this.state.acceptRemoteEvent({assignmentId:String(payload.assignmentId??executionId),workerId:worker.identity.workerId,leaseId:envelope.lease?.leaseId??"",fencingToken:envelope.lease?.fencingToken??-1,sequence:envelope.sequence,messageId:envelope.id,payload}):this.state.appendRemoteEvent({executionId,sequence:envelope.sequence,messageId:envelope.id,payload});if(!result.accepted)throw new Error("expired or stale remote execution");}}
 async reconnect(workerId:string,lastAck:number){const t=this.transports.get(workerId),journal=this.journals.get(workerId),connection=this.connections.get(workerId);if(!t||!journal||!connection)throw new Error("worker is not attached");const persisted=this.state.listUnackedProtocolMessages(connection.connectionId,"outbound");const envelopes=persisted.length?persisted.map((row:any)=>JSON.parse(row.envelope)):journal.replay(lastAck);for(const envelope of envelopes){await t.send(envelope);};this.state.heartbeatWorker(workerId,"online");}
}

export * from "./transport.js";
export * from "./worker.js";

export * from "./service.js";
