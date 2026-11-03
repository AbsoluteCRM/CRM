import * as Sentry from '@sentry/tanstackstart-react'
import { z } from 'zod'

import { can, isOrgRole } from '#/integrations/organization/permissions'
import { optimizerInputs } from '#/server/optimizer/inputs'
import {
  SKIP_MESSAGES,
  planRoutes,
  toApplyPayload,
} from '#/server/optimizer/plan'
import { OptimizerError } from '#/server/optimizer/types'
import { createSupabaseAdminClient } from './supabase-admin'
import type { Json } from '#/types/database'
import type {
  Exchange,
  Optimizer,
  OptimizerInfo,
} from '#/server/optimizer/types'
import type { PlanOutcome } from '#/server/optimizer/plan'

// The service-role side of route optimization (ADR 0009, ADR 0015). It is the
// only code that writes optimization runs, their payloads and the optimized
// routes. The caller's tRPC procedure has already checked `can.manageJobs`
// and read the inputs under RLS; this module checks the caller's active
// membership again with the service-role client, because everything below
// bypasses RLS.
//
// Coordinates are in the solver request and in `optimization_run_payloads`
// only. They are never logged, never in a span attribute and never in an
// error message.

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

/** A run older than this that never finished is treated as dead. */
export const RUN_TIMEOUT_MS = 15 * 60 * 1000
/** The most one run may work before it gives up. */
export const RUN_DEADLINE_MS = 10 * 60 * 1000

export const RUN_COLUMNS =
  'id, route_date, status, provider, error, crew_ids, unassigned_visit_ids, started_at, finished_at, created_at'

export type RunRow = {
  id: string
  route_date: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  provider: string
  error: string | null
  crew_ids: Array<string>
  unassigned_visit_ids: Array<string>
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export type RunnerErrorCode =
  'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE' | 'INTERNAL'

/** A refusal the procedure maps to a tRPC error. The message is safe to show. */
export class RunnerError extends Error {
  readonly code: RunnerErrorCode
  constructor(code: RunnerErrorCode, message: string) {
    super(message)
    this.name = 'RunnerError'
    this.code = code
  }
}

export type StartParams = {
  organizationId: string
  userId: string
  date: string
  /** What `optimizer_inputs` returned for the caller. */
  inputs: unknown
  info: OptimizerInfo
  optimizer: Optimizer | null
  /** Tests pass a fake; production builds the service-role client. */
  client?: AdminClient
  now?: () => Date
}

export type Started = {
  run: RunRow
  /** Resolves when the run has finished. The procedure does not wait for it. */
  done: Promise<void>
  /** Routes the read function left out (missing or not editable). */
  skipped: Array<{ route_id: string; reason: string }>
}

const applyResult = z.object({
  applied: z.array(z.string()),
  skipped: z.array(z.object({ route_id: z.string(), reason: z.string() })),
})

const inFlight = new Set<Promise<void>>()

/** Resolves when every run started by this process has finished. For tests and shutdown. */
export async function settled(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight])
}

function adminClient(): AdminClient | null {
  try {
    return createSupabaseAdminClient()
  } catch {
    return null
  }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

function skipNote(skipped: PlanOutcome['skipped']): string {
  const reasons = [...new Set(skipped.map((s) => SKIP_MESSAGES[s.reason]))]
  return `${plural(skipped.length, 'route was', 'routes were')} left as they were because ${reasons.join(' or ')}.`
}

async function failRun(
  client: AdminClient,
  organizationId: string,
  runId: string,
  message: string,
  now: () => Date,
) {
  const { error } = await client
    .from('optimization_runs')
    .update({
      status: 'failed',
      error: message,
      finished_at: now().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('id', runId)
    .in('status', ['queued', 'running'])
  if (error)
    Sentry.captureException(new Error('Could not fail optimization run'))
}

async function savePayload(
  client: AdminClient,
  organizationId: string,
  runId: string,
  exchanges: ReadonlyArray<Exchange>,
) {
  if (!exchanges.length) return
  const { error } = await client.from('optimization_run_payloads').upsert(
    {
      organization_id: organizationId,
      run_id: runId,
      request: exchanges.map((e) => ({
        service: e.service,
        body: e.request,
      })) as Json,
      response: exchanges.map((e) => ({
        service: e.service,
        body: e.response,
      })) as Json,
    },
    { onConflict: 'organization_id,run_id' },
  )
  // Payloads are for debugging; losing one must not fail the run.
  if (error) Sentry.captureException(new Error('Could not store run payload'))
}

/**
 * Checks the caller, records the run and, when an optimizer is configured,
 * starts the work in the background. Throws `RunnerError` for a refusal.
 * Every other outcome, including no optimizer and a failing solver, is a run
 * row: `failed` with a plain message, and the routes untouched.
 */
export async function startOptimization(params: StartParams): Promise<Started> {
  const client = params.client ?? adminClient()
  if (!client) {
    throw new RunnerError(
      'UNAVAILABLE',
      'Route optimization is not set up on this server.',
    )
  }
  const now = params.now ?? (() => new Date())
  const { organizationId, userId, date } = params

  // 1. The caller must be an active office member of this organization.
  const { data: member, error: memberError } = await client
    .from('organization_members')
    .select('role, status')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (memberError) {
    throw new RunnerError('INTERNAL', 'Could not verify your access.')
  }
  if (!member || !isOrgRole(member.role) || !can.manageJobs(member.role)) {
    throw new RunnerError(
      'FORBIDDEN',
      'You do not have permission to optimize routes.',
    )
  }

  // 2. The inputs, as the database function shaped them.
  const parsed = optimizerInputs.safeParse(params.inputs)
  if (!parsed.success) {
    Sentry.captureException(
      new Error('optimizer_inputs returned an unexpected shape'),
    )
    throw new RunnerError('INTERNAL', 'Could not read the routes to optimize.')
  }
  const { routes, skipped } = parsed.data

  // 3. A run that never finished (the process died) must not block this date.
  await client
    .from('optimization_runs')
    .update({
      status: 'failed',
      error: 'The previous optimization did not finish.',
      finished_at: now().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('route_date', date)
    .in('status', ['queued', 'running'])
    .lt('created_at', new Date(now().getTime() - RUN_TIMEOUT_MS).toISOString())

  // 4. The run row. A failure known up front is recorded as a failed run.
  const upFront = !params.optimizer
    ? (params.info.reason ?? 'No route optimizer is set up on this server.')
    : !routes.length
      ? 'There are no draft or optimized routes on this date to optimize.'
      : null
  const stamp = now().toISOString()
  const { data: inserted, error: insertError } = await client
    .from('optimization_runs')
    .insert({
      organization_id: organizationId,
      route_date: date,
      provider: params.optimizer?.name ?? params.info.provider,
      requested_by: userId,
      crew_ids: [...new Set(routes.map((r) => r.crew_id))],
      status: upFront ? 'failed' : 'queued',
      error: upFront,
      started_at: upFront ? stamp : null,
      finished_at: upFront ? stamp : null,
    })
    .select(RUN_COLUMNS)
    .single()
  if (insertError) {
    if (insertError.code === '23505') {
      throw new RunnerError(
        'CONFLICT',
        'An optimization is already running for this date.',
      )
    }
    throw new RunnerError('INTERNAL', 'Could not start the optimization.')
  }
  const run = inserted

  if (upFront || !params.optimizer) {
    return { run, done: Promise.resolve(), skipped }
  }

  // 5. The work, in the background.
  const optimizer = params.optimizer
  const done: Promise<void> = execute({
    client,
    organizationId,
    run,
    optimizer,
    routes,
    now,
  }).finally(() => {
    inFlight.delete(done)
  })
  inFlight.add(done)
  return { run, done, skipped }
}

async function execute(args: {
  client: AdminClient
  organizationId: string
  run: RunRow
  optimizer: Optimizer
  routes: z.infer<typeof optimizerInputs>['routes']
  now: () => Date
}): Promise<void> {
  const { client, organizationId, run, optimizer, routes, now } = args
  const exchanges: Array<Exchange> = []

  await Sentry.startSpan(
    {
      name: 'optimizer.run',
      op: 'optimizer',
      attributes: {
        'optimizer.provider': optimizer.name,
        'optimizer.routes': routes.length,
      },
    },
    async () => {
      try {
        await client
          .from('optimization_runs')
          .update({ status: 'running', started_at: now().toISOString() })
          .eq('organization_id', organizationId)
          .eq('id', run.id)
          .eq('status', 'queued')

        const outcome = await planRoutes(optimizer, routes, {
          signal: AbortSignal.timeout(RUN_DEADLINE_MS),
          onExchange: (e) => exchanges.push(e),
        })
        await savePayload(client, organizationId, run.id, exchanges)

        if (!outcome.plans.length) {
          await failRun(
            client,
            organizationId,
            run.id,
            outcome.skipped.length
              ? `No route could be optimized: ${skipNote(outcome.skipped)}`
              : 'There was nothing to optimize on this date.',
            now,
          )
          return
        }

        const { data, error } = await client.rpc('apply_optimization_results', {
          p_organization_id: organizationId,
          p_run_id: run.id,
          p_routes: toApplyPayload(outcome.plans) as unknown as Json,
          p_unassigned: outcome.unassignedVisitIds,
        })
        if (error) {
          throw new Error(`apply_optimization_results failed (${error.code})`)
        }
        if (!applyResult.safeParse(data).success) {
          throw new Error(
            'apply_optimization_results returned an unexpected shape',
          )
        }

        if (outcome.skipped.length) {
          const { data: current } = await client
            .from('optimization_runs')
            .select('error')
            .eq('organization_id', organizationId)
            .eq('id', run.id)
            .maybeSingle()
          await client
            .from('optimization_runs')
            .update({
              error: [skipNote(outcome.skipped), current?.error]
                .filter(Boolean)
                .join(' '),
            })
            .eq('organization_id', organizationId)
            .eq('id', run.id)
        }
      } catch (e) {
        await savePayload(client, organizationId, run.id, exchanges)
        if (e instanceof OptimizerError) {
          await failRun(client, organizationId, run.id, e.message, now)
        } else {
          // Our own failure (the database, a bug): details go to Sentry, not staff.
          Sentry.captureException(e)
          await failRun(
            client,
            organizationId,
            run.id,
            'The routes could not be optimized. Nothing was changed.',
            now,
          )
        }
      }
    },
  )
}
