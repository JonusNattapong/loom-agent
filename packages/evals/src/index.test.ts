import {describe,it,expect} from "vitest";
import {runEvalHarness} from "./index.js";
describe("V0.3 eval harness",()=>{it("passes all fixed scenarios",async()=>{const results=await runEvalHarness();expect(results.map(r=>r.name)).toEqual(["fix failing tests","create file","modify multiple files","crash + resume","failed verification","denied tool call"]);expect(results.every(r=>r.passed),JSON.stringify(results)).toBe(true);});});
