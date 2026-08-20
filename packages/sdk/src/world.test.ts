import {describe, it, expect} from "vitest";
import {FakeWorldAdapter, type ArenaObservation, type ArenaAction} from "./world.js";

describe("FakeWorldAdapter (Agent Arena foundation)", () => {
  it("delivers scripted observations and records actions", async () => {
    const world = new FakeWorldAdapter();
    const script: ArenaObservation[] = [
      {kind: "enemy_seen", enemyId: "e1", distance: 5, threat: 3},
      {kind: "round_started", round: 1},
    ];
    world.scriptFor("agent-1", script);
    expect(await world.observe("agent-1")).toEqual(script[0]);
    expect(await world.observe("agent-1")).toEqual(script[1]);
    const action: ArenaAction = {kind: "attack_target", targetId: "e1"};
    const result = await world.act("agent-1", action);
    expect(result.ok).toBe(true);
    expect(world.recordedActions("agent-1")).toEqual([{agentId: "agent-1", action}]);
  });

  it("rejects invalid actions without throwing", async () => {
    const world = new FakeWorldAdapter();
    const result = await world.act("a", {kind: ""} as unknown as ArenaAction);
    expect(result.ok).toBe(false);
  });

  it("falls back to idle when script exhausted", async () => {
    const world = new FakeWorldAdapter([{kind: "idle"}]);
    expect(await world.observe("x")).toEqual({kind: "idle"});
    expect(await world.observe("x")).toEqual({kind: "idle"});
  });
});
