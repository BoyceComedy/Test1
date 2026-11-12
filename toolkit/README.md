# Boyce toolkit (Claude Code plugins)

Shared workflows for every project. Move this folder into its own repo
(e.g. `boycecomedy/claude-toolkit`) so all projects can install it.

## Install

```
/plugin marketplace add boycecomedy/claude-toolkit
/plugin install orchestrator@boyce-toolkit
```

## Use

In any project:

- `/orchestrate` (reads `SPEC.md` at the repo root)
- `/orchestrate docs/other-spec.md`
- `/orchestrate --audit` (for an old project: audit it, draft SPEC.md, then plan)

Each project keeps its **own** `SPEC.md` (what to build). This plugin holds the
**workflow** (how to build it), so improving it here improves every project.
