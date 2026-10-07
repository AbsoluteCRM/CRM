# Plan: <feature name>

<!--
Copy to docs/plans/<slug>.md. Rules: docs/process/feature-workflow.md.
Delete these comments and any section that truly does not apply (say why).
-->

- **Slug / branch**: `<slug>` / `feat/<slug>`
- **Tier**: full | light (why)
- **Status**: draft | audited | approved | implemented
- **Confidence**: NN%, because <which choices rest on user answers or
  verified repo facts, and what is still assumed>
- **Plan-mode file**: `~/.claude/plans/<file>.md` (while in plan mode)

## Original request

> <the user's words, verbatim>

## Goal

<One paragraph: the outcome for the user, and what's in scope.>

## Decisions

| #   | Question | Answer (user's words or a faithful summary) |
| --- | -------- | ------------------------------------------- |
| Q1  |          |                                             |

Agent defaults (minor; the user may veto them):

- **D1**:

## Open questions

- <none, or each question still open; any open question that would change
  the outcome keeps confidence below 95%>

## Assumptions

| Assumption | User-confirmed? |
| ---------- | --------------- |
|            | yes / no        |

## Design refs

- Mock: <Claude Design link or file, or "none, UI proposed below">
- Screens: `docs/<feature>/ui.md` sections to add or change

## Layers touched

- [ ] Migration (`supabase/migrations/…`)
- [ ] RLS policies / pgTAP tests
- [ ] `docs/database` (tables, ERD, ADR)
- [ ] Types (`pnpm db:types`)
- [ ] Middleware (auth, org scope, `ctx.supabase`)
- [ ] tRPC procedures
- [ ] Routes / loaders
- [ ] UI components
- [ ] Stories
- [ ] Tests
- [ ] Sentry
- [ ] Design record (`docs/<feature>/ui.md`, shots, decisions)

Security-gated paths touched (see the workflow's Agents section): <none, or
the list>. If any, the `security` agent gates the merge.

## Changes

<!-- What gets built, per layer. Concrete enough for an auditor to attack. -->

### Schema

- Migration `<name>`: tables, columns, constraints, indexes, RLS policies.

### Middleware

-

### Procedures

| Procedure       | Input | Output | Roles allowed |
| --------------- | ----- | ------ | ------------- |
| `domain.action` |       |        |               |

### Routes and UI

| Route | Screen | States (loading, empty, error, populated) |
| ----- | ------ | ----------------------------------------- |
|       |        |                                           |

### Acceptance criteria

1.

## Commits

<!-- In order. Each one builds. Who makes it: main agent (remote-DB steps) or implementer. -->

1. `<imperative message>` (main agent | implementer): what it contains

## Unhappy paths

<!-- Empty, malformed, concurrent, unauthorised, a step failing halfway. How each is handled. -->

-

## Out of scope

-

## Dependencies not to add

-

## Verify command

<!-- Exact and runnable as written. No placeholders. -->

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

The Definition of done from the workflow, plus anything specific to this
feature:

-

## Audit log

### Round 1 (`plan-auditor`): <pass | needs-changes>, confidence <high | medium | low>

| #   | Blocking finding (recurring?) | Resolution (fixed / rejected: reason / escalated) |
| --- | ----------------------------- | ------------------------------------------------- |
|     |                               |                                                   |

- **Non-blocking**: adopted or noted.
- **Unresolved**: each question and how it was settled.
- **Pre-existing**: noted, not fixed here.

### Review (`reviewer`, and `security` if gated): <verdict>

| #   | Blocking finding (recurring?) | Resolution |
| --- | ----------------------------- | ---------- |
|     |                               |            |

## Scope-change log

_None._
