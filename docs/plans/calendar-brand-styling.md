# Plan: Calendar brand styling

- **Slug / branch**: `calendar-brand-styling` / `chore/calendar-brand-styling`
- **Tier**: light (small presentation-only chore; all implementation changes
  stay in the UI layer, with stories and the design record supporting it)
- **Status**: draft
- **Confidence**: 96%, because the user confirmed the whole Calendar experience
  should use the CRM brand style, and the relevant components, brand tokens, and
  existing interaction stories have been inspected.
- **Plan-mode file**: not available in this environment; using this uncommitted
  plan for review and approval.

## Original request

> Merge the styles seen in other components into the Calendar components

## Goal

Bring the Calendar screen's week navigation, day tiles, route stop cards, map
and empty states into visual alignment with the current CRM screens. Use the
existing LeafLife-inspired cream/paper, leaf-green, lime, ink, and line tokens
and established rounded-card treatment. Preserve all existing Calendar
behavior, responsive layout, and content.

## Decisions

| #   | Question                          | Answer                                                                                   |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| Q1  | Which visual direction and scope? | Apply the current CRM brand styling throughout the Calendar experience (user-confirmed). |

Agent defaults (minor; the user may veto them):

- **D1**: Prefer existing design tokens and UI primitives over adding new
  colors, dependencies, or shared abstractions.
- **D2**: Keep current information architecture and interactions unchanged.

## Open questions

- None.

## Assumptions

| Assumption                                                             | User-confirmed?                                |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| Calendar's current layout and interactions should remain unchanged.    | yes, as part of styling-only direction         |
| Existing CRM brand tokens in `src/styles.css` are the source of truth. | yes, via the requested current CRM brand style |

## Design refs

- Mock: none; user selected the verified current CRM brand treatment.
- Screens: add `docs/calendar/ui.md` for the Calendar screen.

## Layers touched

- [ ] Migration (`supabase/migrations/…`)
- [ ] RLS policies / pgTAP tests
- [ ] `docs/database` (tables, ERD, ADR)
- [ ] Types (`pnpm db:types`)
- [ ] Middleware (auth, org scope, `ctx.supabase`)
- [ ] tRPC procedures
- [ ] Routes / loaders
- [x] UI components
- [x] Stories
- [ ] Tests
- [ ] Sentry
- [x] Design record (`docs/calendar/ui.md`, shots, decisions)

Security-gated paths touched: none.

## Changes

### Routes and UI

| Route       | Screen                                 | States (loading, empty, error, populated)                                                       |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/calendar` | Weekly calendar and selected-day route | Existing populated/empty-day and map-key-unavailable states; no data or route behavior changes. |

Restyle the existing Calendar view and route-stop/map components in
`src/components/calendar/` using the current brand tokens and established CRM
card patterns. Preserve week navigation, selected-day behavior, map behavior,
responsive breakpoints, and accessible names/state. Only change the route
wrapper if needed for consistent page framing.

Update Calendar Storybook coverage only as needed to preserve and verify
existing interaction scenarios. Record the screen layout, states, interactions,
and code locations in `docs/calendar/ui.md`; capture the desktop screenshot
required by the design workflow if the app can be run and accessed in this
environment.

### Acceptance criteria

1. Calendar controls, day tiles, route-stop cards, map, and empty states use
   established CRM brand tokens rather than one-off gray/green styling.
2. Existing route ordering and map behavior are not changed.
3. Existing week navigation and day-selection Storybook interactions pass.
4. Calendar screen design record reflects the implemented screen.
5. Formatting, lint, type-check, and relevant Storybook tests pass.

## Commits

1. `chore: align calendar with CRM brand styles` (main agent): Calendar styles,
   relevant story updates, and design record.

## Unhappy paths

- If the Maps API key is absent, keep the existing explanatory fallback and
  style it consistently with the brand tokens.
- If the week contains no jobs, keep disabled day behavior and the existing
  empty selection guidance.
- If a requested visual treatment conflicts with accessibility or contrast,
  retain readable contrast and existing accessible state semantics.

## Out of scope

- Changing Calendar data, mock route contents, scheduling semantics, or map
  integration.
- Refactoring unrelated CRM screens or changing global brand tokens.

## Dependencies not to add

- No new dependencies.

## Verify command

```bash
pnpm lint && pnpm check && pnpm exec vitest run src/components/calendar/WeekCalendar.stories.tsx && pnpm exec tsc --noEmit
```

## Verification

- Run the relevant Storybook interaction stories and project lint,
  formatting, and type-check.
- Verify the Calendar in the running app if the local environment supports
  access to it.

## Scope-change log

_None._
