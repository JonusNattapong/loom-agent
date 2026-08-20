// Public SDK only. Documents the remote-worker connection contract. The worker
// is started by the CLI (`loom worker`) or the daemon coordinator.
import {type LoomAddress, type LoomRoute} from "@loom/sdk";

const workerAddress: LoomAddress = "loom://worker/gpu-01";
const route: LoomRoute = {address: workerAddress, workerId: "gpu-01", connectionEpoch: 1};

console.log("worker address:", workerAddress);
console.log("route:", JSON.stringify(route));
console.log("Start a worker: loom worker --name gpu-01 --listen 127.0.0.1:4778");
console.log("Dispatch work: loom jobs enqueue --type agent_run --payload '{\"goal\":\"...\"}'");
