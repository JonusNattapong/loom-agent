/**
 * @loom/sdk/world — Agent Arena WorldAdapter foundation (EXPERIMENTAL).
 *
 * This is a stable *bridge contract*, not a game engine. Loom decides strategy
 * and high-level actions; an external simulation (e.g. Godot) executes them.
 * Loom must never control per-frame rendering, physics, or movement
 * interpolation.
 *
 * The contract is generic so future games can implement WorldAdapter without
 * changing Loom. Godot is one future implementation.
 */
import type {WorldAdapter, ActionResult} from "./contracts.js";

export type ArenaObservation =
  | {kind: "enemy_seen"; enemyId: string; distance: number; threat: number}
  | {kind: "damage_taken"; amount: number; source?: string}
  | {kind: "resource_found"; resource: string; amount: number}
  | {kind: "objective_changed"; objective: string}
  | {kind: "teammate_message"; fromAgentId: string; message: string}
  | {kind: "round_started"; round: number}
  | {kind: "round_ended"; outcome: "win" | "loss" | "draw"}
  | {kind: "idle"};

export type ArenaAction =
  | {kind: "move_to"; target: {x: number; y: number; z?: number}}
  | {kind: "attack_target"; targetId: string}
  | {kind: "defend_area"; area: string}
  | {kind: "gather_resource"; resource: string}
  | {kind: "assist_agent"; agentId: string}
  | {kind: "retreat"}
  | {kind: "wait"};

/**
 * Generic in-memory world adapter used for tests and local simulation before a
 * real engine (Godot) is bound. It is deterministic given scripted observations
 * and records the actions agents choose.
 */
export class FakeWorldAdapter implements WorldAdapter<ArenaObservation, ArenaAction> {
  private observations: Record<string, ArenaObservation[]> = {};
  private actions: Array<{agentId: string; action: ArenaAction}> = [];
  private cursor: Record<string, number> = {};

  constructor(private readonly script: ArenaObservation[] = []) {}

  scriptFor(agentId: string, observations: ArenaObservation[]): void {
    this.observations[agentId] = observations;
    this.cursor[agentId] = 0;
  }

  async observe(agentId: string): Promise<ArenaObservation> {
    const list = this.observations[agentId] ?? this.script;
    const idx = this.cursor[agentId] ?? 0;
    const obs = list[idx] ?? {kind: "idle"};
    this.cursor[agentId] = idx + 1;
    return obs;
  }

  async act(agentId: string, action: ArenaAction): Promise<ActionResult> {
    if (!action || typeof action.kind !== "string" || !action.kind) {
      return {ok: false, details: {reason: "invalid_action"}};
    }
    this.actions.push({agentId, action});
    return {ok: true, details: {recorded: action.kind}};
  }

  /** Return the ordered actions an agent chose (useful for assertions). */
  recordedActions(agentId?: string): Array<{agentId: string; action: ArenaAction}> {
    return agentId ? this.actions.filter((a) => a.agentId === agentId) : this.actions;
  }
}

export const ARENA_EVENT_TYPES = [
  "enemy_seen",
  "damage_taken",
  "resource_found",
  "objective_changed",
  "teammate_message",
  "round_started",
  "round_ended",
] as const;

export const ARENA_ACTION_TYPES = [
  "move_to",
  "attack_target",
  "defend_area",
  "gather_resource",
  "assist_agent",
  "retreat",
  "wait",
] as const;
