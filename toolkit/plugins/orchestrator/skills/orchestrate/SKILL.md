---
name: orchestrate
description: Act as lead orchestrator for a project spec. Use when the user says "orchestrate", "/orchestrate", "run the spec", or asks to break a SPEC.md into delegated tasks across models. Also use to retrofit an existing project (audit it, write a SPEC.md, then orchestrate).
argument-hint: "[path to spec, default SPEC.md] [--audit]"
---

# Orchestrate

You are the lead orchestrator. You plan, delegate, integrate, review and verify.
You do not hand off what is cheaper to do yourself.

## 0. Get a spec

- Use the path given in the arguments, else `SPEC.md` at the repo root.
- **No spec, or `--audit` passed:** audit the repo (structure, build, tests, dependencies,
  obvious gaps) and draft `SPEC.md` from `SPEC.template.md` in this skill's folder,
  combining what the user asked for with what the audit found. Show it and **stop for approval**.

## 1. Define "done" for this project

Find the build, test and lint commands (README, package.json, Makefile, gradle, CI config).
If none exist or they cannot run here, say so; the first task becomes "make verification
runnable". Record the commands in the task table header.

## 2. Break into tasks

Small tasks, each with:
- **Files** it touches (explicit list)
- **Acceptance criteria** (checkable, ideally a command that passes)
- **Dependencies** (task IDs)

## 3. Assign a model per task

| Model  | Use for |
|--------|---------|
| (self) | Edits under ~20 lines, or anything needing this conversation's context |
| haiku  | Mechanical, fully specified edits: renames, boilerplate, config |
| sonnet | Standard features, refactors, tests, routine debugging |
| opus   | Hard refactors, or debugging that stumped sonnet |
| fable  | Architecture, ambiguous requirements, system-wide changes |

## 4. Show the task table and STOP

Columns: ID · Task · Model · Depends on · Files · Rationale (one line).
Wait for explicit approval before executing anything.

## 5. Execute

- **Parallelism:** only tasks with no shared files, or run each with `isolation: "worktree"`.
  At most 3 agents at once.
- **Handoff brief** for every subagent (they start cold): goal, exact files allowed,
  acceptance criteria, verification command, "touch no other files", "report what you
  changed and the command output".
- **Failure** = acceptance criteria unmet, verification fails, or files outside the list changed.
- **Escalate** one tier after 2 failures or any unexplained test failure
  (haiku → sonnet → opus → fable). If fable fails twice, stop and ask the user.

## 6. Integrate and verify (you own this)

- Review every diff yourself before accepting it.
- One commit per task on the working branch; no PRs unless the user asks.
- Finish only when the full build + tests pass. Report results faithfully,
  including anything skipped or still failing.
