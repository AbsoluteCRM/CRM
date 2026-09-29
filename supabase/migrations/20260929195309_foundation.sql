-- Foundation: extensions, the private schema, and shared helpers.
-- See docs/database/README.md#conventions.

-- Extensions live in the `extensions` schema (already on the search_path).
create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists moddatetime with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgtap with schema extensions;

-- Private schema for helper functions. PostgREST doesn't expose it.
-- Only the API roles that evaluate policies or column defaults get USAGE.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Functions created here aren't executable by PUBLIC unless explicitly
-- granted.
alter default privileges in schema private revoke execute on functions from public;

-- Time-ordered UUIDv7 (PG17 lacks a built-in; see ADR 0003).
-- Overlays a 48-bit Unix-millisecond timestamp on a random v4 UUID, then
-- turns the version nibble from 0100 (4) into 0111 (7).
create or replace function private.uuid_generate_v7()
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

grant execute on function private.uuid_generate_v7() to authenticated, service_role;
