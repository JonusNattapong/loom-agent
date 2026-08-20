import type {AddressInfo} from "node:net";

export interface OperatorSession {id:string;credentialId:string;sessionHash:string;csrfHash:string;createdAt:number;expiresAt:number;lastSeenAt:number;revokedAt?:number|null}
export interface OperatorCredential {id:string;name:string;role?:"viewer"|"operator";tokenHash:string;enabled:boolean}
export interface OperatorAudit {id:number;requestId:string;actorId?:string;sessionFingerprint?:string;action:string;resourceType?:string;resourceId?:string;outcome:"success"|"denied"|"error";httpStatus:number;sourceAddress?:string;details?:Record<string,unknown>;createdAt:number}
export interface ControlEvent {id:number;type:string;resourceType?:string;resourceId?:string;data?:unknown;createdAt:number}
export interface ControlState {
  findOperatorCredentialByTokenHash(hash:string):OperatorCredential|undefined; getOperatorCredential?(id:string):OperatorCredential|undefined;
  createOperatorSession(input:Omit<OperatorSession,"revokedAt">):OperatorSession;
  getOperatorSession(sessionHash:string):OperatorSession|undefined;
  rotateOperatorSessionCsrf(id:string,csrfHash:string,lastSeenAt:number):OperatorSession|undefined; touchOperatorSession?(id:string,lastSeenAt:number):void;
  revokeOperatorSession(id:string,revokedAt?:number):void;
  recordOperatorAudit(input:Omit<OperatorAudit,"id"|"createdAt">&{createdAt?:number}):OperatorAudit;
  listOperatorAudit(input?:{afterId?:number;limit?:number;action?:string;resourceType?:string}):OperatorAudit[];
  appendControlEvent(input:Omit<ControlEvent,"id"|"createdAt">&{createdAt?:number}):ControlEvent;
  listControlEvents(input?:{afterId?:number;limit?:number}):ControlEvent[];
  listAgents(rootAgentId?:string):any[]; getAgent(id:string):any; getTrace(id:string,rootTimeline?:boolean):unknown[]; listTraces?(input?:{type?:string;since?:string;limit?:number}):any[]; getPlanForAgent?(agentId:string):any; listPlanTasks?(planId:string):any[]; listPlanRevisions?(planId:string):any[]; listReviews?(taskId:string):any[]; listRepairs?(taskId:string):any[]; listArtifactsForRoot?(rootId:string):any[];
  listChildren(parentId:string):unknown[]; listDelegations(parentId:string):unknown[]; listArtifacts(agentId:string,taskId?:string):unknown[];
  listJobs(status?:string):any[]; getJob(id:string):any; updateJob(id:string,status:string,data?:Record<string,unknown>):unknown; enqueueJob(input:any):unknown; cancelJob?(id:string,now?:number):unknown; retryJob?(id:string,now?:number):unknown;
  listSchedules():any[]; getSchedule(id:string):any; createSchedule(input:any):unknown; updateSchedule(id:string,input:any):unknown; deleteSchedule?(id:string):unknown;
  listApprovals(agentId?:string):any[]; listApprovalsForRoot(rootId:string):any[]; getApproval(id:string):any; resolveApproval(id:string,status:"approved"|"denied"):void; resolveApprovalIfPending?(id:string,status:"approved"|"denied"):unknown;
  listWorkers():any[]; getWorker(id:string):any; listWorkerConnections?(workerId:string):any[]; listRemoteLeases?(workerId?:string):any[]; listRemoteAssignments(status?:string):any[]; getRemoteAssignment(id:string):any; getRemoteLease?(id:string):any; listRemoteExecutionEvents?(assignmentId:string,limit?:number):any[];
}
export interface ControlActions {cancelJob?(id:string):unknown;retryJob?(id:string):unknown;createSchedule?(input:any):unknown;pauseSchedule?(id:string):unknown;resumeSchedule?(id:string):unknown;deleteSchedule?(id:string):unknown;decideApproval?(id:string,decision:"approved"|"denied"):unknown}
export interface ControlProviders {daemonStatus?:()=>any|Promise<any>; bots?:()=>unknown|Promise<unknown>; routes?:()=>unknown|Promise<unknown>; route?: (target:string)=>unknown|Promise<unknown>; actions?:ControlActions; version?:string;daemonId?:string}
export interface RateLimitOptions {windowMs:number;max:number;authWindowMs:number;authMax:number;maxKeys:number}
export interface ControlOptions {
 host?:string;port?:number;webRoot?:string;publicOrigin?:string;allowedOrigins?:string[];tls?:{key:string|Buffer;cert:string|Buffer};readOnly?:boolean;
 sessionTtlMs?:number;sessionIdleMs?:number;cookieSecure?:boolean;bodyLimitBytes?:number;requestTimeoutMs?:number;
 maxSseClients?:number;sseHeartbeatMs?:number;rateLimit?:Partial<RateLimitOptions>;now?:()=>number;
}
export interface ControlAddress {address():AddressInfo|undefined}
