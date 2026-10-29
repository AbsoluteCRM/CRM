import type { Tables } from '#/types/database'

// Selected database columns, not the CRM store's flattened demo job shape.
type RecordFields<
  T extends
    | 'jobs'
    | 'visits'
    | 'crews'
    | 'routes'
    | 'route_stops'
    | 'clients'
    | 'properties',
  TKeys extends keyof Tables<T>,
> = Pick<Tables<T>, TKeys>
type Job = RecordFields<
  'jobs',
  | 'id'
  | 'organization_id'
  | 'client_id'
  | 'property_id'
  | 'number'
  | 'title'
  | 'visit_duration_minutes'
>
type Visit = RecordFields<
  'visits',
  | 'id'
  | 'organization_id'
  | 'job_id'
  | 'property_id'
  | 'scheduled_date'
  | 'duration_minutes'
  | 'status'
  | 'window_start'
  | 'window_end'
>
type Crew = RecordFields<
  'crews',
  'id' | 'organization_id' | 'name' | 'color' | 'vehicle' | 'default_start_time'
>
export type DraftRoute = RecordFields<
  'routes',
  'id' | 'organization_id' | 'crew_id' | 'route_date' | 'status'
>
export type DraftStop = RecordFields<
  'route_stops',
  'id' | 'organization_id' | 'route_id' | 'visit_id' | 'sequence'
>
type Client = RecordFields<'clients', 'id' | 'organization_id' | 'display_name'>
type Property = RecordFields<
  'properties',
  'id' | 'organization_id' | 'client_id' | 'address_line1' | 'city'
>

export const ORGANIZATION_ID = 'demo-route-organization'
export const EXAMPLE_DATE = '2026-10-29'
export const crews: Array<Crew> = [
  {
    id: 'crew-north',
    organization_id: ORGANIZATION_ID,
    name: 'North crew',
    color: '#2f7350',
    vehicle: 'Truck 01 · Trailer A',
    default_start_time: '08:00:00',
  },
  {
    id: 'crew-south',
    organization_id: ORGANIZATION_ID,
    name: 'South crew',
    color: '#a35b3d',
    vehicle: 'Truck 02 · Trailer B',
    default_start_time: '08:00:00',
  },
]
const examples = [
  {
    name: 'Eleanor Mitchell',
    address: '1248 Briarwood Drive',
    service: 'Fall yard cleanup',
    minutes: 75,
    x: 28,
    y: 32,
    window: true,
  },
  {
    name: 'Westbrook Commons',
    address: '3600 Westbrook Avenue',
    service: 'Lawn care & edging',
    minutes: 90,
    x: 59,
    y: 24,
    window: false,
  },
  {
    name: 'Oliver Bennett',
    address: '82 Willow Crescent',
    service: 'Leaf removal',
    minutes: 45,
    x: 76,
    y: 54,
    window: true,
  },
  {
    name: 'Sarah Chen',
    address: '416 Aspen Ridge',
    service: 'Garden bed winterization',
    minutes: 60,
    x: 48,
    y: 71,
    window: false,
  },
  {
    name: 'Maple Ridge Dental',
    address: '950 Maple Street',
    service: 'Fall yard cleanup',
    minutes: 90,
    x: 25,
    y: 67,
    window: false,
  },
  {
    name: 'James Campbell',
    address: '210 Cedar Lane',
    service: 'Hedge trimming',
    minutes: 45,
    x: 79,
    y: 79,
    window: false,
  },
]
export const clients: Array<Client> = examples.map((e, i) => ({
  id: `client-${i}`,
  organization_id: ORGANIZATION_ID,
  display_name: e.name,
}))
export const properties: Array<Property> = examples.map((e, i) => ({
  id: `property-${i}`,
  organization_id: ORGANIZATION_ID,
  client_id: clients[i].id,
  address_line1: e.address,
  city: 'Calgary',
}))
export const jobs: Array<Job> = examples.map((e, i) => ({
  id: `job-${i}`,
  organization_id: ORGANIZATION_ID,
  client_id: clients[i].id,
  property_id: properties[i].id,
  number: `J-${1041 + i}`,
  title: e.service,
  visit_duration_minutes: e.minutes,
}))
export const visits: Array<Visit> = examples.map((e, i) => ({
  id: `visit-${i}`,
  organization_id: ORGANIZATION_ID,
  job_id: jobs[i].id,
  property_id: properties[i].id,
  scheduled_date: EXAMPLE_DATE,
  duration_minutes: e.minutes,
  status: 'scheduled',
  window_start: e.window ? `${EXAMPLE_DATE}T15:00:00Z` : null,
  window_end: e.window ? `${EXAMPLE_DATE}T18:00:00Z` : null,
}))
// Schematic coordinates are presentation data, deliberately separate from rows.
export const positions: Record<string, { x: number; y: number } | undefined> =
  Object.fromEntries(
    examples.map((e, i) => [properties[i].id, { x: e.x, y: e.y }]),
  )
export function makeRoute(crewId: string, date: string): DraftRoute {
  return {
    id: `draft-${crewId}-${date}`,
    organization_id: ORGANIZATION_ID,
    crew_id: crewId,
    route_date: date,
    status: 'draft',
  }
}
export function makeStops(
  routeId: string,
  visitIds: Array<string>,
): Array<DraftStop> {
  return visitIds.map((visitId, i) => ({
    id: `${routeId}-${visitId}`,
    organization_id: ORGANIZATION_ID,
    route_id: routeId,
    visit_id: visitId,
    sequence: i + 1,
  }))
}
// Local work in progress is deliberately separate from a database route row:
// database routes require crew_id, while an empty UI template has no crew yet.
export type RouteTemplate = {
  id: string
  label: string
  date: string
  crewId: string | null
  visitIds: Array<string>
}
export function initialTemplates(): Array<RouteTemplate> {
  const rows = [
    makeRoute(crews[0].id, EXAMPLE_DATE),
    makeRoute(crews[1].id, EXAMPLE_DATE),
  ]
  return rows.map((row, index) => ({
    id: row.id,
    label: `Route ${index + 1}`,
    date: row.route_date,
    crewId: row.crew_id,
    visitIds: index === 0 ? ['visit-0', 'visit-1'] : ['visit-3'],
  }))
}
export function visitDetails(visitId: string) {
  const visit = visits.find((v) => v.id === visitId)
  const job = jobs.find((j) => j.id === visit?.job_id)
  const client = clients.find((c) => c.id === job?.client_id)
  const property = properties.find((p) => p.id === visit?.property_id)
  return { visit, job, client, property }
}
