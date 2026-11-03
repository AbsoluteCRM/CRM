import { z } from 'zod'

// The jsonb that `optimizer_inputs` returns (supabase/migrations/
// 20261103180000_optimizer_apply_results.sql), parsed so a change in the
// function shows up as an error here instead of a bad solver request.

const lonLat = z
  .object({
    lon: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  })
  .nullable()

const stop = z.object({
  stop_id: z.string().min(1),
  visit_id: z.string().min(1),
  sequence: z.number().int().positive(),
  is_locked: z.boolean(),
  duration_minutes: z.number().int().positive(),
  window_start: z.string().nullable(),
  window_end: z.string().nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
})

const route = z.object({
  route_id: z.string().min(1),
  crew_id: z.string().min(1),
  status: z.string(),
  planned_start: z.string().nullable(),
  start: lonLat,
  end: lonLat,
  max_work_minutes: z.number().int().positive().nullable(),
  stops: z.array(stop),
})

export const optimizerInputs = z.object({
  routes: z.array(route),
  skipped: z.array(z.object({ route_id: z.string(), reason: z.string() })),
})

export type OptimizerInputs = z.infer<typeof optimizerInputs>
