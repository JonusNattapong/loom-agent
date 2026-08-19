import {runEvalHarness} from "./index.js";
const results=await runEvalHarness();for(const result of results)console.log(`${result.passed?"PASS":"FAIL"}\t${result.name}\t${result.details}`);if(results.some(r=>!r.passed))process.exitCode=1;
