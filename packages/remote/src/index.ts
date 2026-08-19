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
  sender: WorkerIdentity; sequence: number; payload: T; lease?: LeaseToken;
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
export function isProtocolEnvelope(value: unknown): value is ProtocolEnvelope {
  const v=value as Partial<ProtocolEnvelope>;
  return !!v && v.protocol===PROTOCOL_VERSION && typeof v.id==="string" && typeof v.type==="string" && typeof v.sequence==="number" && !!v.sender?.workerId;
}

export class WorkerRegistry {
  private readonly workers = new Map<string, {identity:WorkerIdentity; capabilities:NormalizedCapabilities; load:WorkerLoad; lastSeen:number}>();
  register(identity:WorkerIdentity, capabilities:WorkerCapability[]|string[], load:WorkerLoad={running:0,capacity:1}, now=Date.now()) {
    if (!identity.workerId || !identity.instanceId) throw new Error("worker identity requires workerId and instanceId");
    const record={identity:{...identity},capabilities:normalizeCapabilities(capabilities),load:{...load},lastSeen:now}; this.workers.set(identity.workerId,record); return {...record,capabilities:{...record.capabilities, names:[...record.capabilities.names],roles:[...record.capabilities.roles],tools:[...record.capabilities.tools]}};
  }
  heartbeat(workerId:string, load?:WorkerLoad, now=Date.now()) { const w=this.workers.get(workerId); if(!w) throw new Error("unknown worker"); if(load) w.load={...load}; w.lastSeen=now; return w; }
  get(workerId:string){return this.workers.get(workerId)}
  list(){return [...this.workers.values()].sort((a,b)=>a.identity.workerId.localeCompare(b.identity.workerId));}
}

export class DeterministicRouter {
  constructor(private readonly registry:WorkerRegistry) {}
  route(job:RemoteJob): WorkerIdentity | undefined {
    const required=unique(job.requiredCapabilities ?? []), candidates=this.registry.list().filter(w => (job.role ? w.capabilities.roles.includes(job.role.toLowerCase()) : true) && required.every(c=>w.capabilities.names.includes(c)||w.capabilities.tools.includes(c)) && w.load.running < w.load.capacity);
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
  private next=1; private acknowledged=0; private pending=new Map<number,ProtocolEnvelope<T>>();
  constructor(private readonly sender:WorkerIdentity) {}
  append(type:ProtocolType,payload:T, lease?:LeaseToken, id=`msg-${this.next}`) { const envelope=createEnvelope({type,id,sender:this.sender,sequence:this.next++,payload,lease}); this.pending.set(envelope.sequence,envelope); return envelope; }
  acknowledge(sequence:number){if(sequence>this.acknowledged)this.acknowledged=sequence; for(const n of this.pending.keys())if(n<=sequence)this.pending.delete(n);}
  replay(afterSequence=this.acknowledged){return [...this.pending.entries()].filter(([n])=>n>afterSequence).sort(([a],[b])=>a-b).map(([,e])=>e);}
  get lastSequence(){return this.next-1} get lastAcknowledged(){return this.acknowledged}
}

export function assertFencingToken(expected:number, received:LeaseToken){if(received.fencingToken!==expected)throw new Error("stale fencing token");}

export interface WorkerTransport {send(envelope:ProtocolEnvelope):Promise<void>|void;close():Promise<void>|void;onMessage(handler:(envelope:ProtocolEnvelope)=>void):void;onDisconnect(handler:(error?:unknown)=>void):void;}
export interface RemoteDispatchResult {assignmentId:string;workerId:string;lease:LeaseToken;}
export class RemoteFabricController {
 private readonly transports=new Map<string,WorkerTransport>(); private readonly journals=new Map<string,SequenceJournal>();
 constructor(private readonly state:any,private readonly registry:WorkerRegistry=new WorkerRegistry(),private readonly leases:LeaseManager=new LeaseManager()){}
 attach(worker:WorkerIdentity,transport:WorkerTransport,capabilities:WorkerCapability[]|string[],load:WorkerLoad={running:0,capacity:1}){this.state.registerWorker({workerId:worker.workerId,name:worker.name,capabilities,metadata:{trust:worker.trust,instanceId:worker.instanceId}});this.registry.register(worker,capabilities,load);this.transports.set(worker.workerId,transport);this.journals.set(worker.workerId,new SequenceJournal(worker));transport.onMessage(e=>void this.receive(e));transport.onDisconnect(()=>this.state.setWorkerStatus(worker.workerId,"offline"));return worker;}
 async dispatch(job:RemoteJob):Promise<RemoteDispatchResult>{const worker=new DeterministicRouter(this.registry).route(job);if(!worker)throw new Error("no compatible online worker");const transport=this.transports.get(worker.workerId);if(!transport)throw new Error("worker transport unavailable");const lease=this.leases.acquire(job.jobId,worker.workerId,30000);const assignment=this.state.assignRemote({workerId:worker.workerId,payload:job.payload,taskId:job.jobId});this.state.acquireRemoteLease(assignment.id,worker.workerId,30000);const envelope=this.journals.get(worker.workerId)!.append("dispatch",{assignmentId:assignment.id,executionId:job.jobId,requirements:job.requiredCapabilities??[],payload:job.payload},lease);await transport.send(envelope);this.state.setWorkerStatus(worker.workerId,"online");return {assignmentId:assignment.id,workerId:worker.workerId,lease};}
 async receive(envelope:ProtocolEnvelope){if(!isProtocolEnvelope(envelope))throw new Error("invalid protocol envelope");const worker=this.registry.get(envelope.sender.workerId);if(!worker)throw new Error("unregistered worker");if(envelope.type==="heartbeat"){this.registry.heartbeat(worker.identity.workerId,(envelope.payload as any)?.load);this.state.heartbeatWorker(worker.identity.workerId);return;}if(envelope.type==="ack"){this.journals.get(worker.identity.workerId)?.acknowledge(Number((envelope.payload as any)?.sequence??envelope.sequence));return;}if(envelope.lease&&!this.leases.validate((envelope.payload as any)?.executionId??"",envelope.lease))throw new Error("stale lease");const executionId=String((envelope.payload as any)?.executionId??"");if(executionId){const result=this.state.appendRemoteEvent({executionId,sequence:envelope.sequence,messageId:envelope.id,payload:envelope.payload});if(!result.accepted)throw new Error("expired remote execution");}}
 async reconnect(workerId:string,lastAck:number){const t=this.transports.get(workerId),journal=this.journals.get(workerId);if(!t||!journal)throw new Error("worker is not attached");for(const envelope of journal.replay(lastAck))await t.send(envelope);this.state.heartbeatWorker(workerId,"online");}
}