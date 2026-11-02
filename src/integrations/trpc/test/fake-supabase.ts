// A fake of `#/lib/supabase/server` for procedure tests. Wire it up with
//   vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))
// and configure `fake` in beforeEach (after `fake.reset()`).
//
// Every chain call is recorded in `fake.calls` as [`${table}.${method}`, ...args]
// and every RPC as ['rpc', name, args]. An awaited query takes the next result
// queued for its table in `fake.results`, else `fake.result`; single() and
// maybeSingle() unwrap an array to its first row. organization_members
// lookups answer from `fake.memberships` using the organization_id filter.

export type FakeError = { message: string; code?: string }
export type FakeResult = { data: unknown; error: FakeError | null }
export type FakeCall = [string, ...Array<unknown>]

export const ORG = '0198f0a0-0000-7000-8000-000000000001'

const CHAIN = [
  'select',
  'eq',
  'is',
  'order',
  'limit',
  'insert',
  'update',
  'delete',
] as const

type State = {
  user: { id: string } | null
  // Active memberships of the signed-in user: organization id → role.
  memberships: Record<string, string>
  result: FakeResult
  results: Partial<Record<string, Array<FakeResult>>>
  rpc: FakeResult
  calls: Array<FakeCall>
}

const initial = (): State => ({
  user: { id: 'u1' },
  memberships: { [ORG]: 'admin' },
  result: { data: [], error: null },
  results: {},
  rpc: { data: null, error: null },
  calls: [],
})

export const fake = {
  ...initial(),
  reset() {
    Object.assign(fake, initial())
  },
  // Make the user a member of `org` with `role` only, or of nothing for null.
  setRole(role: string | null, org: string = ORG) {
    fake.memberships = role ? { [org]: role } : {}
  },
  // Recorded calls with this key, e.g. 'clients.insert' or 'rpc'.
  callsTo(key: string) {
    return fake.calls.filter(([k]) => k === key)
  },
  called(key: string) {
    return fake.calls.some(([k]) => k === key)
  },
}

function chain(table: string) {
  const filters: Record<string, unknown> = {}
  const q: Record<string, unknown> = {}
  for (const method of CHAIN) {
    q[method] = (...args: Array<unknown>) => {
      fake.calls.push([`${table}.${method}`, ...args])
      if (method === 'eq') filters[String(args[0])] = args[1]
      return q
    }
  }
  const next = (): Promise<FakeResult> =>
    Promise.resolve(fake.results[table]?.shift() ?? fake.result)
  const one = (): Promise<FakeResult> => {
    if (table === 'organization_members') {
      const org = String(filters.organization_id)
      const role = fake.memberships[org]
      return Promise.resolve({
        data: role
          ? { id: 'm1', organization_id: org, role, status: 'active' }
          : null,
        error: null,
      })
    }
    return next().then((r) => ({
      ...r,
      data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
    }))
  }
  q.single = one
  q.maybeSingle = one
  q.then = (
    resolve: (value: FakeResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => next().then(resolve, reject)
  return q
}

export function createSupabaseServerClient() {
  return {
    auth: {
      getUser: () =>
        Promise.resolve(
          fake.user
            ? { data: { user: fake.user }, error: null }
            : { data: { user: null }, error: { message: 'no session' } },
        ),
    },
    from: (table: string) => chain(table),
    rpc: (name: string, args?: unknown) => {
      fake.calls.push(['rpc', name, args])
      return Promise.resolve(fake.rpc)
    },
  }
}
