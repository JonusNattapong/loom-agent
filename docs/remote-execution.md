# Remote execution

V0.8.1 workers execute delegated tool assignments through the existing `ToolExecutor` boundary. An assignment carries a stable assignment ID, lease/fencing token, tool name/input, allowed tools, task references, and an optional logical workspace ID. The worker runs against a pre-provisioned local workspace; controller paths are never accepted.

Effective tools are the intersection of controller-assigned tools and worker-local `allowedTools`. Worker-local policy is a hard boundary. Shell is denied unless the worker explicitly enables it, and native read/write tools retain workspace traversal and symlink protections. Tool call IDs are stable (`assignmentId:tool:toolName`) and the worker's local StateStore ledger prevents replay from repeating completed calls.

Worker restart creates a new instance identity. Completed assignment records in the worker state database are replayed as results without executing the tool again. In-flight provider/tool loops are not process-migrated; lease expiry and controller fencing govern recovery. Artifact metadata remains worker-local; no file synchronization is provided.
