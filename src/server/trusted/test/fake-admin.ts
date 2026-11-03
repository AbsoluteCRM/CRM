// A recording stand-in for the service-role Supabase client, for tests of the
// optimization runner and the procedures that start it. It implements only
// the calls the runner makes, against in-memory tables.

export const ORG = '0198f0a0-0000-7000-8000-000000000001'
export const OTHER_ORG = '0198f0a0-0000-7000-8000-000000000009'
export const USER = '0198f0a0-0000-7000-8000-0000000000a1'
export const NOW = new Date('2026-11-03T12:00:00Z')

export type Row = Record<string, unknown>
type Filter = [kind: 'eq' | 'in' | 'lt', column: string, value: unknown]

export function fakeAdmin(
  options: {
    members?: Record<string, string>
    runs?: Array<Row>
    insertError?: { code: string; message: string }
    rpc?: (args: Record<string, unknown>) => {
      data: unknown
      error: { code?: string; message: string } | null
    }
  } = {},
) {
  const members = options.members ?? { [`${ORG}:${USER}`]: 'dispatcher' }
  const runs: Array<Row> = options.runs ?? []
  const payloads: Array<Row> = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const log: Array<string> = []

  const matches = (row: Row, filters: Array<Filter>) =>
    filters.every(([kind, column, value]) => {
      if (kind === 'eq') return row[column] === value
      if (kind === 'in') return (value as Array<unknown>).includes(row[column])
      return String(row[column]) < String(value)
    })

  function from(table: string) {
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: Row = {}
    const filters: Array<Filter> = []
    const q: Record<string, unknown> = {}
    const run = (): { data: unknown; error: unknown } => {
      log.push(`${table}.${op}`)
      if (table === 'organization_members') {
        const key = `${filters.find((f) => f[1] === 'organization_id')?.[2]}:${
          filters.find((f) => f[1] === 'user_id')?.[2]
        }`
        const role = members[key]
        return {
          data: role ? { role, status: 'active' } : null,
          error: null,
        }
      }
      if (table === 'optimization_run_payloads') {
        payloads.push(payload)
        return { data: null, error: null }
      }
      if (op === 'insert') {
        if (options.insertError)
          return { data: null, error: options.insertError }
        const row = {
          id: `run-${runs.length + 1}`,
          created_at: NOW.toISOString(),
          unassigned_visit_ids: [],
          ...payload,
        }
        runs.push(row)
        return { data: { ...row }, error: null }
      }
      if (op === 'update') {
        for (const row of runs.filter((r) => matches(r, filters))) {
          Object.assign(row, payload)
        }
        return { data: null, error: null }
      }
      return {
        data: runs.find((r) => matches(r, filters)) ?? null,
        error: null,
      }
    }
    q.select = () => q
    q.insert = (row: Row) => {
      op = 'insert'
      payload = row
      return q
    }
    q.update = (row: Row) => {
      op = 'update'
      payload = row
      return q
    }
    q.upsert = (row: Row) => {
      op = 'upsert'
      payload = row
      return q
    }
    for (const kind of ['eq', 'in', 'lt'] as const) {
      q[kind] = (column: string, value: unknown) => {
        filters.push([kind, column, value])
        return q
      }
    }
    q.maybeSingle = () => Promise.resolve(run())
    q.single = () => Promise.resolve(run())
    q.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(run()).then(resolve, reject)
    return q
  }

  const client = {
    from,
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      const result = options.rpc?.(args) ?? {
        data: {
          applied: (args.p_routes as Array<{ route_id: string }>).map(
            (r) => r.route_id,
          ),
          skipped: [],
        },
        error: null,
      }
      if (
        !result.error &&
        typeof result.data === 'object' &&
        result.data !== null &&
        'applied' in result.data
      ) {
        // What the SQL function does to the run.
        const run = runs.find((r) => r.id === args.p_run_id)
        if (run) Object.assign(run, { status: 'succeeded', finished_at: 'x' })
      }
      return Promise.resolve(result)
    },
  }
  return { client: client as never, runs, payloads, rpcCalls, log }
}
