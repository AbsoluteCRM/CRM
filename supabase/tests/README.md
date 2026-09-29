# Database tests

These are pgTAP tests, one file per migration domain. Each file runs inside
`begin … rollback`, so nothing persists.

## Running

There's no local Supabase stack (see
[ADR 0001](../../docs/database/decisions/0001-supabase-sql-source-of-truth.md)),
so tests run against the remote project through the Supabase MCP
`execute_sql` tool. Pass it the whole file.

`execute_sql` returns only the **last** result set. So instead of emitting
TAP directly, each assertion is inserted into a temp table (`_tap`), and the
final `select string_agg(...)` prints the TAP output. Every test must print
`ok`, and the last line must be `1..N` with no "Looks like you failed".

## Writing tests

- Fixture users: insert into `auth.users` with fixed UUIDs and
  `@test.local` emails. The `on_auth_user_created` trigger creates their
  profiles.
- Acting as a user:
  ```sql
  select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true),
         set_config('role', 'authenticated', true);
  ```
  Switch back with `set_config('role', 'postgres', true)`. Act as `anon` with
  `set_config('role', 'anon', true)`.
- Ids that one user can't see under RLS go in the `_ids` temp table, captured
  as `postgres`.
- For each table, cover:
  - tenant isolation, both reads and writes
  - each role in the [policy matrix](../../docs/database/rls.md#policy-matrix)
  - the composite-FK cross-tenant rejection
  - every trigger-enforced invariant
