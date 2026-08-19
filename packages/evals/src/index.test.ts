import {describe,it,expect} from "vitest";
import {runEvalHarness} from "./index.js";

describe("V0.4 eval harness",()=>{
  it("passes the V0.3 regression and V0.4 multi-agent scenarios",async()=>{
    const results=await runEvalHarness();
    expect(results.map(result=>result.name)).toEqual([
      "fix failing tests","create file","modify multiple files","crash + resume","failed verification","denied tool call",
      "v0.4 parent to coder","v0.4 researcher to coder handoff","v0.4 coder reviewer repair","v0.4 bounded parallel tasks",
      "v0.4 child crash resume","v0.4 parent crash before consume","v0.4 cancellation hierarchy","v0.4 child approval resume",
      "v0.6 planner fallback","v0.6 capability routing","v0.6 execution bounds",
    ]);
    expect(results.every(result=>result.passed),JSON.stringify(results)).toBe(true);
  });
});
