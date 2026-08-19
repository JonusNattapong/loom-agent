---
title: Skills
version: 0.3
category: how-to
---

# Skills

Project skills live at `.loom/skills/<directory>/SKILL.md`.

```markdown
---
name: testing
description: Run focused tests and diagnose failures.
tools: [read_file, shell]
---

Start with the smallest relevant test.
```

Supported metadata is `name`, `description`, and a comma-separated inline `tools` list. The body becomes the instruction text.

```bash
npm run loom -- skills
npm run loom -- skills show testing
```

Discovery is deterministic and ignores directories without a readable `SKILL.md`. V0.3 parses `--skill`, but task-graph execution does not yet inject selected skill instructions or enforce the skill tool list. The older `AgentLoop` supports selected-skill context injection through its API.
