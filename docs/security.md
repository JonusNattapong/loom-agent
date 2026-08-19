---
title: Security model
version: 0.3
category: explanation
---

# Security model

Loom is not a sandbox. It executes with the operating-system permissions of the current process.

## File boundaries

Native file tools resolve requested paths against the configured workspace. They reject traversal and absolute paths outside that root. Reads resolve the real path before access, which blocks symlink escapes. Writes create the parent, resolve its real path, and reject parents outside the workspace.

These checks reduce accidental workspace escape; they do not defend against every race involving concurrently changed symlinks or a hostile local process.

## Shell execution

The shell tool uses the workspace as its explicit working directory, applies a timeout (30 seconds by default, capped at 120 seconds), limits captured output to 1 MiB before middleware truncation, and reports exit status and duration.

Commands are still executed through `cmd /c` on Windows or `sh -c` on POSIX. Treat model-provided shell text as untrusted and use `ask` or `deny` for shell in sensitive repositories.

## Approvals

Approval records include the tool name and normalized input. Review the request before approving. Approval authorizes only the tool call with the associated tool-call id; resume reuses that id.

## Secrets

- Keep `OPENAI_API_KEY` in the environment.
- Do not commit `.loom/config.json` when it contains environment overrides or sensitive MCP settings.
- MCP child processes inherit the Loom environment plus configured overrides.
- Trace payloads should not include credentials. V0.3 does not implement general secret redaction.

## Trust assumptions

Use Loom only in a workspace you trust and with tools/MCP servers you have reviewed. For strong isolation, run Loom inside a separate container, VM, or restricted OS account.
