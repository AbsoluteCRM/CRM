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
- [ ] Prisma pull / generate
- [ ] Middleware (auth, org scope, `withRls`)
- [ ] tRPC procedures
- [ ] Routes / loaders
- [ ] UI components
- [ ] Stories
- [ ] Tests
- [ ] Sentry
- [ ] Design record (`docs/<feature>/ui.md`, shots, decisions)

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

## Out of scope

-

## Verification

The Definition of done from the workflow, plus anything specific to this
feature:

-

## Audit log

### Round 1 (fresh general-purpose agent): <verdict>, N material and N minor

| #   | Finding | Resolution (fixed / rejected: reason / escalated) |
| --- | ------- | ------------------------------------------------- |
|     |         |                                                   |

## Scope-change log

_None._
