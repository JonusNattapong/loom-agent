// Public SDK only (experimental). Agent Arena world-adapter foundation.
import {FakeWorldAdapter, type ArenaObservation, type ArenaAction} from "@loom-agent/sdk";

const world = new FakeWorldAdapter();
const script: ArenaObservation[] = [
  {kind: "round_started", round: 1},
  {kind: "enemy_seen", enemyId: "e1", distance: 5, threat: 3},
  {kind: "round_ended", outcome: "win"},
];
world.scriptFor("agent-1", script);

const obs = await world.observe("agent-1");
console.log("observation:", obs.kind);

const action: ArenaAction = {kind: "attack_target", targetId: "e1"};
const result = await world.act("agent-1", action);
console.log("action recorded:", result.ok, "history:", world.recordedActions("agent-1").length);
