-- Foundation: extensions, the private schema, default privileges, and shared
-- helpers. See docs/database/README.md#conventions and ADR 0009.

-- Extensions live in the `extensions` schema (already on the search_path).
-- pg_cron manages its own schema.
create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists btree_gin with schema extensions;
create extension if not exists moddatetime with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron;

-- Private schema for helper functions. PostgREST doesn't expose it. Only the
-- API roles that evaluate policies or column defaults get USAGE.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

------------------------------------------------------------------------------
-- Default privileges for objects created by migrations (owner: postgres)
------------------------------------------------------------------------------

-- No function is executable by PUBLIC unless granted. This must be global: a
-- per-schema REVOKE can't remove a global default.
alter default privileges for role postgres revoke execute on functions from public;

-- Supabase grants everything in `public` to anon and authenticated by
-- default. Undo that (these are per-schema grants, so a per-schema REVOKE
-- reverses them):
-- - anon gets nothing. Public pages go through server code.
-- - authenticated keeps SELECT and DELETE (still filtered by RLS). Each table
--   grants INSERT and UPDATE per column, so derived, attribution, and tenant
--   columns can't be written through the API. TRUNCATE (which ignores RLS),
--   REFERENCES, and TRIGGER are never granted.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke insert, update, truncate, references, trigger on tables from authenticated;

------------------------------------------------------------------------------
-- uuid_generate_v7
------------------------------------------------------------------------------

-- Time-ordered UUIDv7 (PG17 lacks a built-in; see ADR 0003). Overlays a
-- 48-bit Unix-millisecond timestamp on a random v4 UUID, then turns the
-- version nibble from 0100 (4) into 0111 (7).
create function private.uuid_generate_v7()
returns uuid
language sql
volatile
parallel safe
set search_path = ''
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(
            int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
            from 3
          )
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid
$$;

comment on function private.uuid_generate_v7() is
  'Time-ordered UUID (RFC 9562 v7). Default for every primary key.';

-- Column defaults run with the inserting role's privileges.
grant execute on function private.uuid_generate_v7() to authenticated, service_role;
