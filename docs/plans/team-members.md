# Plan: Team members from the active organization

- **Slug / branch**: `team-members` / `feat/team-members` (based on `feat/organization-context`)
- **Tier**: light (one layer, no schema or auth change; audit skipped)
- **Status**: implemented
- **Confidence**: ~90%; every choice below was answered by the user. Not verified against live data.

## Original request

> I'd like to build out my team route. This should fetch all team members that are a member of the active organization in the organization context.

## Decisions

| #   | Question         | Answer                                                            |
| --- | ---------------- | ----------------------------------------------------------------- |
| Q1  | Base branch      | Branch from `feat/organization-context` only                      |
| Q2  | Fetch mechanism  | Browser Supabase client + TanStack Query, filtered by active org  |
| Q3  | Scope            | Members tab only; crews/availability/performance stay on the mock |
| Q4  | Mock-only fields | Hidden for real rows                                              |
| Q5  | Statuses         | All statuses; disabled members are badged                         |

## Changes

- `src/integrations/teams/teams.ts`: `useTeamMembers()` queries `organization_members` for `useOrganization().organization.id`.
- `src/components/team/MembersTab.tsx` (+ story): list with search, role filter, loading, error and empty states.
- `src/routes/_authed/teams.tsx`: Members tab, tab count and the "Team members" KPI use real data; `currentAssignment` removed.

## Assumptions

- No migration: RLS on `organization_members` already scopes reads to the caller's orgs.
- Row click and the profile drawer are dropped for the Members tab because the drawer reads mock members.
