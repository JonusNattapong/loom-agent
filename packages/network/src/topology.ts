import {
  formatAddressLike,
  formatLoomAddress,
  parseLoomAddress,
  type LoomAddress,
  type LoomAddressLike,
} from "./address.js";

export const LOOM_ROUTE_TRANSPORTS = ["controller-websocket", "relay", "direct"] as const;
export const LOOM_ROUTE_STATES = ["available", "degraded", "unavailable"] as const;
export type LoomRouteTransport = (typeof LOOM_ROUTE_TRANSPORTS)[number];
export type LoomRouteState = (typeof LOOM_ROUTE_STATES)[number];

/** A durable logical identity. Nodes remain registered independently of connectivity. */
export interface LoomNode {
  readonly address: LoomAddress;
  readonly identity: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A transient way to reach a logical target. `revision` is assigned by a registry. */
export interface LoomRoute {
  readonly target: LoomAddress;
  readonly transport: LoomRouteTransport;
  readonly connectionId?: string;
  readonly relayId?: string;
  readonly cost?: number;
  readonly state: LoomRouteState;
  readonly revision?: number;
}

export type LoomRouteInput = Readonly<{
  target: LoomAddressLike;
  transport: LoomRouteTransport;
  connectionId?: string;
  relayId?: string;
  cost?: number;
  state: LoomRouteState;
}>;

export interface LoomRouteResolver {
  resolve(target: LoomAddressLike): LoomRoute | undefined;
}

export class LoomRouteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoomRouteValidationError";
  }
}

const transports = new Set<string>(LOOM_ROUTE_TRANSPORTS);
const states = new Set<string>(LOOM_ROUTE_STATES);

function structured(address: LoomAddressLike): LoomAddress {
  return typeof address === "string" ? parseLoomAddress(address) : parseLoomAddress(formatLoomAddress(address));
}

function optionalIdentifier(value: string | undefined, name: string): void {
  if (value !== undefined && (typeof value !== "string" || !value.trim() || /[\u0000-\u001F\u007F]/u.test(value))) {
    throw new LoomRouteValidationError(`${name} must be a non-empty string without control characters`);
  }
}

function validateRoute(input: LoomRouteInput): void {
  if (!transports.has(input.transport)) throw new LoomRouteValidationError(`Unknown route transport: ${String(input.transport)}`);
  if (!states.has(input.state)) throw new LoomRouteValidationError(`Unknown route state: ${String(input.state)}`);
  optionalIdentifier(input.connectionId, "connectionId");
  optionalIdentifier(input.relayId, "relayId");
  if (input.cost !== undefined && (!Number.isFinite(input.cost) || input.cost < 0)) {
    throw new LoomRouteValidationError("Route cost must be a finite non-negative number");
  }
}

function copyMetadata(metadata?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | undefined {
  return metadata ? Object.freeze({...metadata}) : undefined;
}

function createNode(address: LoomAddressLike, metadata?: Readonly<Record<string, unknown>>): LoomNode {
  const parsed = structured(address);
  return Object.freeze({address: parsed, identity: formatLoomAddress(parsed), metadata: copyMetadata(metadata)});
}

function copyRoute(input: LoomRouteInput, revision?: number): LoomRoute {
  validateRoute(input);
  const target = structured(input.target);
  return Object.freeze({
    target,
    transport: input.transport,
    ...(input.connectionId === undefined ? {} : {connectionId: input.connectionId}),
    ...(input.relayId === undefined ? {} : {relayId: input.relayId}),
    ...(input.cost === undefined ? {} : {cost: input.cost}),
    state: input.state,
    ...(revision === undefined ? {} : {revision}),
  });
}

/** Immutable point-in-time resolver. Later registry changes cannot mutate this view. */
export class LoomRouteSnapshot implements LoomRouteResolver {
  private readonly nodesByIdentity: ReadonlyMap<string, LoomNode>;
  private readonly routesByIdentity: ReadonlyMap<string, LoomRoute>;

  constructor(nodes: Iterable<LoomNode>, routes: Iterable<LoomRoute>) {
    this.nodesByIdentity = new Map([...nodes].map(node => [node.identity, node]));
    this.routesByIdentity = new Map([...routes].map(route => [formatLoomAddress(route.target), route]));
  }

  resolve(target: LoomAddressLike): LoomRoute | undefined {
    return this.routesByIdentity.get(formatAddressLike(target));
  }

  getNode(target: LoomAddressLike): LoomNode | undefined {
    return this.nodesByIdentity.get(formatAddressLike(target));
  }

  listNodes(): LoomNode[] {
    return [...this.nodesByIdentity.values()];
  }

  listRoutes(): LoomRoute[] {
    return [...this.routesByIdentity.values()];
  }
}

/**
 * In-memory logical-node and current-route registry.
 * Removing or invalidating a route never removes its target node.
 */
export class LoomRouteRegistry implements LoomRouteResolver {
  private readonly nodes = new Map<string, LoomNode>();
  private readonly routes = new Map<string, LoomRoute>();
  private nextRevision = 0;

  constructor(input: {nodes?: Iterable<LoomNode>; routes?: Iterable<LoomRouteInput>} = {}) {
    for (const node of input.nodes ?? []) this.registerNode(node.address, node.metadata);
    for (const route of input.routes ?? []) this.setRoute(route);
  }

  registerNode(address: LoomAddressLike, metadata?: Readonly<Record<string, unknown>>): LoomNode {
    const node = createNode(address, metadata);
    this.nodes.set(node.identity, node);
    return node;
  }

  hasNode(target: LoomAddressLike): boolean {
    return this.nodes.has(formatAddressLike(target));
  }

  getNode(target: LoomAddressLike): LoomNode | undefined {
    return this.nodes.get(formatAddressLike(target));
  }

  listNodes(): LoomNode[] {
    return [...this.nodes.values()];
  }

  /** Add or atomically replace the current route while retaining the logical node. */
  setRoute(input: LoomRouteInput): LoomRoute {
    const key = formatAddressLike(input.target);
    if (!this.nodes.has(key)) this.registerNode(input.target);
    const route = copyRoute(input, ++this.nextRevision);
    this.routes.set(key, route);
    return route;
  }

  /** Convenience for replacing a worker/controller reverse WebSocket binding. */
  replaceConnection(
    target: LoomAddressLike,
    connectionId: string,
    options: {state?: LoomRouteState; cost?: number} = {},
  ): LoomRoute {
    return this.setRoute({
      target,
      transport: "controller-websocket",
      connectionId,
      state: options.state ?? "available",
      ...(options.cost === undefined ? {} : {cost: options.cost}),
    });
  }

  resolve(target: LoomAddressLike): LoomRoute | undefined {
    return this.routes.get(formatAddressLike(target));
  }

  listRoutes(): LoomRoute[] {
    return [...this.routes.values()];
  }

  /** True only while a previously resolved, registry-issued route is still current. */
  isCurrent(route: LoomRoute): boolean {
    if (route.revision === undefined) return false;
    const current = this.routes.get(formatLoomAddress(route.target));
    return current?.revision === route.revision;
  }

  /**
   * Remove a route if it still matches the optional expected binding/revision.
   * This prevents a delayed disconnect for an old connection from removing its replacement.
   */
  invalidateRoute(
    target: LoomAddressLike,
    expected: {connectionId?: string; revision?: number} = {},
  ): boolean {
    const key = formatAddressLike(target);
    const current = this.routes.get(key);
    if (!current) return false;
    if (expected.connectionId !== undefined && current.connectionId !== expected.connectionId) return false;
    if (expected.revision !== undefined && current.revision !== expected.revision) return false;
    this.routes.delete(key);
    return true;
  }

  /** Invalidate every route still using this connection; registered nodes are retained. */
  invalidateConnection(connectionId: string): LoomAddress[] {
    optionalIdentifier(connectionId, "connectionId");
    const invalidated: LoomAddress[] = [];
    for (const [key, route] of this.routes) {
      if (route.connectionId !== connectionId) continue;
      this.routes.delete(key);
      invalidated.push(route.target);
    }
    return invalidated;
  }

  snapshot(): LoomRouteSnapshot {
    return new LoomRouteSnapshot(this.nodes.values(), this.routes.values());
  }
}
