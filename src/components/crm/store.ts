/**
 * Client-side demo store for the CRM screens.
 *
 * A tiny external store (useSyncExternalStore) so every page shares the same
 * data without a provider in `_authed.tsx`. All reads go through `useTenant()`,
 * which scopes every collection to the active organization (`organization_id`).
 *
 * When the tRPC procedures exist, replace the selectors in `useTenant()` with
 * queries and the actions below with mutations. RLS + the active-org filter
 * then enforce what this store only simulates.
 */
import { useMemo, useSyncExternalStore } from 'react'

import { useOrganization } from '#/integrations/organization/context'

import { DEFAULT_HOURS, DEFAULT_SERVICES, createSeed, inSeason } from './seed'
import { addDays, endTime, parseDate, todayISO, toMinutes, uid } from './format'
import type {
  Activity,
  ActivityKind,
  Client,
  CrmState,
  Crew,
  Invoice,
  Job,
  Member,
  OrgRole,
  Organization,
  Payment,
  Property,
  Quote,
  RequestStatus,
  Service,
  ServiceRequest,
  TimeOff,
  Weekday,
} from './types'

// ---------------------------------------------------------------------------
// Store plumbing
// ---------------------------------------------------------------------------

let state: CrmState | null = null
const listeners = new Set<() => void>()

function getState(): CrmState {
  if (!state) state = createSeed()
  return state
}

function setState(updater: (s: CrmState) => CrmState) {
  state = updater(getState())
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCrmState() {
  return useSyncExternalStore(subscribe, getState, getState)
}

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  dispatcher: 'Dispatcher',
  worker: 'Contractor',
}

export const ROLE_DESCRIPTION: Record<OrgRole, string> = {
  owner: 'Full access, including billing and subscription.',
  admin: 'Manages jobs, crews, clients, and services.',
  dispatcher: 'Schedules and dispatches jobs and requests.',
  worker: 'Sees and completes the jobs assigned to their crew.',
}

export { can } from '#/integrations/organization/permissions'

export type Section =
  | 'dashboard'
  | 'calendar'
  | 'requests'
  | 'jobs'
  | 'clients'
  | 'teams'
  | 'services'
  | 'settings'
  | 'route-builder'

export function canSee(role: OrgRole, section: Section) {
  if (role !== 'worker') return true
  return section === 'dashboard' || section === 'calendar' || section === 'jobs'
}

// ---------------------------------------------------------------------------
// Tenant-scoped reads
// ---------------------------------------------------------------------------

export function useTenant() {
  const s = useCrmState()
  const { organization } = useOrganization()

  return useMemo(() => {
    // Prefer the real org from OrganizationProvider once it's wired; fall back to the demo tenant.
    const orgId =
      organization && s.organizations.some((o) => o.id === organization.id)
        ? organization.id
        : s.activeOrgId
    const org =
      s.organizations.find((o) => o.id === orgId) ?? s.organizations[0]
    const own = <T extends { organization_id: string }>(rows: Array<T>) =>
      rows.filter((r) => r.organization_id === org.id)

    const members = own(s.members)
    const crews = own(s.crews)
    const clients = own(s.clients)
    const properties = own(s.properties)
    const services = own(s.services)
    const requests = own(s.requests)
    const jobs = own(s.jobs)
    const invoices = own(s.invoices)
    const activity = own(s.activity).sort((a, b) => b.at.localeCompare(a.at))

    const roleMatch = (r: OrgRole) =>
      members.find((m) => m.role === r && m.status === 'active')
    const me =
      s.role === 'worker'
        ? (members.find(
            (m) => m.role === 'worker' && crews.some((c) => c.leadId === m.id),
          ) ?? roleMatch('worker'))
        : (roleMatch(s.role) ?? roleMatch('owner') ?? members[0])
    const myCrew = me
      ? (crews.find((c) => c.memberIds.includes(me.id)) ?? null)
      : null

    const byId = <T extends { id: string }>(rows: Array<T>) => {
      const map = new Map<string, T>()
      rows.forEach((r) => map.set(r.id, r))
      return map
    }
    const clientMap = byId(clients)
    const propertyMap = byId(properties)
    const serviceMap = byId(services)
    const crewMap = byId(crews)
    const memberMap = byId(members)
    const invoiceMap = byId(invoices)

    const visibleJobs =
      s.role === 'worker'
        ? jobs.filter((j) => myCrew && j.crew_id === myCrew.id)
        : jobs

    return {
      org,
      orgId: org.id,
      organizations: s.organizations,
      role: s.role,
      me,
      myCrew,
      members,
      crews,
      clients,
      properties,
      services,
      requests,
      jobs,
      visibleJobs,
      invoices,
      activity,
      client: (id: string | null | undefined) =>
        id ? clientMap.get(id) : undefined,
      property: (id: string | null | undefined) =>
        id ? propertyMap.get(id) : undefined,
      service: (id: string | null | undefined) =>
        id ? serviceMap.get(id) : undefined,
      crew: (id: string | null | undefined) =>
        id ? crewMap.get(id) : undefined,
      member: (id: string | null | undefined) =>
        id ? memberMap.get(id) : undefined,
      invoice: (id: string | null | undefined) =>
        id ? invoiceMap.get(id) : undefined,
      propertiesOf: (clientId: string) =>
        properties.filter((p) => p.client_id === clientId),
      jobServices: (job: Job) =>
        job.service_ids
          .map((id) => serviceMap.get(id))
          .filter((x): x is Service => !!x),
      clientLifetimeValue: (clientId: string) =>
        invoices
          .filter((i) => i.client_id === clientId)
          .reduce(
            (sum, i) =>
              sum + i.payments.reduce((p, x) => p + x.amount_cents, 0),
            0,
          ),
    }
  }, [s, organization])
}

export type Tenant = ReturnType<typeof useTenant>

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function jobEnd(job: Pick<Job, 'start' | 'durationMinutes'>) {
  return endTime(job.start, job.durationMinutes)
}

export function invoiceBalance(inv: Invoice) {
  return inv.total_cents - inv.payments.reduce((s, p) => s + p.amount_cents, 0)
}

export function isOverdue(inv: Invoice) {
  return (
    inv.status !== 'paid' && inv.status !== 'void' && inv.dueAt < todayISO()
  )
}

export function quoteTotals(
  q: Pick<Quote, 'lines' | 'taxPercent' | 'discountCents'>,
) {
  const by = (k: string) =>
    q.lines
      .filter((l) => l.kind === k)
      .reduce((s, l) => s + Math.round(l.quantity * l.unit_price_cents), 0)
  const labor = by('labor')
  const materials = by('materials')
  const equipment = by('equipment')
  const subtotal = labor + materials + equipment
  const afterDiscount = Math.max(0, subtotal - q.discountCents)
  const tax = Math.round((afterDiscount * q.taxPercent) / 100)
  return {
    labor,
    materials,
    equipment,
    subtotal,
    tax,
    total: afterDiscount + tax,
  }
}

const WEEKDAY_KEYS: Array<Weekday> = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
]

export function weekdayKey(date: string): Weekday {
  return WEEKDAY_KEYS[parseDate(date).getDay()]
}

export type Availability = 'available' | 'off_day' | TimeOff['kind']

export function memberAvailability(member: Member, date: string): Availability {
  const off = member.timeOff.find((t) => t.start <= date && t.end >= date)
  if (off) return off.kind
  if (!member.workDays.includes(weekdayKey(date))) return 'off_day'
  return 'available'
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available',
  off_day: 'Day off',
  vacation: 'Vacation',
  sick: 'Sick',
  personal: 'Time off',
}

export interface Conflict {
  type: 'double_booked' | 'service_overlap' | 'unavailable'
  message: string
}

/**
 * Scheduling conflicts for upcoming, open jobs:
 * - a crew booked on two overlapping jobs,
 * - two jobs overlapping at the same property,
 * - crew members unavailable (time off / not a work day).
 */
export function detectConflicts(
  jobs: Array<Job>,
  crews: Array<Crew>,
  members: Array<Member>,
) {
  const today = todayISO()
  const open = jobs.filter(
    (j) =>
      j.date >= today && j.status !== 'completed' && j.status !== 'cancelled',
  )
  const result = new Map<string, Array<Conflict>>()
  const add = (id: string, c: Conflict) => {
    const list = result.get(id) ?? []
    if (!list.some((x) => x.type === c.type && x.message === c.message))
      list.push(c)
    result.set(id, list)
  }
  const overlaps = (a: Job, b: Job) =>
    toMinutes(a.start) < toMinutes(b.start) + b.durationMinutes &&
    toMinutes(b.start) < toMinutes(a.start) + a.durationMinutes

  const byDate = new Map<string, Array<Job>>()
  open.forEach((j) => byDate.set(j.date, [...(byDate.get(j.date) ?? []), j]))

  byDate.forEach((dayJobs) => {
    for (let i = 0; i < dayJobs.length; i++) {
      for (let k = i + 1; k < dayJobs.length; k++) {
        const a = dayJobs[i]
        const b = dayJobs[k]
        if (!overlaps(a, b)) continue
        if (a.crew_id && a.crew_id === b.crew_id) {
          const crew = crews.find((c) => c.id === a.crew_id)
          add(a.id, {
            type: 'double_booked',
            message: `${crew?.name ?? 'Crew'} is double-booked with ${b.number}`,
          })
          add(b.id, {
            type: 'double_booked',
            message: `${crew?.name ?? 'Crew'} is double-booked with ${a.number}`,
          })
        }
        if (a.property_id === b.property_id) {
          add(a.id, {
            type: 'service_overlap',
            message: `Overlaps ${b.number} at the same property`,
          })
          add(b.id, {
            type: 'service_overlap',
            message: `Overlaps ${a.number} at the same property`,
          })
        }
      }
    }
  })

  open.forEach((job) => {
    const crew = crews.find((c) => c.id === job.crew_id)
    if (!crew) return
    const crewMembers = crew.memberIds
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is Member => !!m)
    const away = crewMembers.filter(
      (m) => memberAvailability(m, job.date) !== 'available',
    )
    // A partly-staffed crew is shown on the calendar ("Sarah out") but isn't a
    // conflict; a crew with nobody available is.
    if (crewMembers.length && away.length === crewMembers.length) {
      add(job.id, {
        type: 'unavailable',
        message: `Nobody on ${crew.name} is available (${away
          .map(
            (m) =>
              `${m.display_name.split(' ')[0]}: ${AVAILABILITY_LABEL[memberAvailability(m, job.date)].toLowerCase()}`,
          )
          .join(', ')})`,
      })
    }
  })

  return result
}

// ---------------------------------------------------------------------------
// Weather (demo forecast; swap for a forecast API keyed by the org's service area)
// ---------------------------------------------------------------------------

export type WeatherCondition = 'sun' | 'cloud' | 'rain' | 'snow' | 'wind'

export interface Forecast {
  date: string
  condition: WeatherCondition
  high: number
  low: number
  precip: number
  wind: number
}

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // murmur3 finalizer so neighbouring dates don't cluster
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function forecastFor(date: string, place = 'calgary'): Forecast {
  const month = parseDate(date).getMonth() + 1
  const winter = month >= 11 || month <= 3
  const shoulder = month === 10 || month === 4
  const h = hash(`${place}:${date}`)
  const offset = Math.round(
    (parseDate(date).getTime() - parseDate(todayISO()).getTime()) / 86_400_000,
  )

  let condition: WeatherCondition
  // Make sure the demo week always has something actionable to show.
  if (offset === 2) condition = 'rain'
  else if (offset === 5 && (winter || shoulder)) condition = 'snow'
  else if (offset === 3) condition = 'wind'
  else if (winter)
    condition =
      h < 0.35 ? 'snow' : h < 0.6 ? 'cloud' : h < 0.75 ? 'wind' : 'sun'
  else
    condition =
      h < 0.18 ? 'rain' : h < 0.42 ? 'cloud' : h < 0.52 ? 'wind' : 'sun'

  const base = winter ? -6 : shoulder ? 9 : month >= 6 && month <= 8 ? 24 : 16
  const high = Math.round(base + (h - 0.5) * 8 - (condition === 'snow' ? 6 : 0))
  return {
    date,
    condition,
    high,
    low: high - 8 - Math.round(h * 4),
    precip:
      condition === 'rain' || condition === 'snow'
        ? 60 + Math.round(h * 35)
        : Math.round(h * 20),
    wind:
      condition === 'wind' ? 45 + Math.round(h * 20) : 8 + Math.round(h * 18),
  }
}

export const WEATHER_LABEL: Record<WeatherCondition, string> = {
  sun: 'Sunny',
  cloud: 'Cloudy',
  rain: 'Rain',
  snow: 'Snow',
  wind: 'High wind',
}

// ---------------------------------------------------------------------------
// Actions (become tRPC mutations)
// ---------------------------------------------------------------------------

function activeOrgId() {
  return getState().activeOrgId
}

function actorName() {
  const s = getState()
  const me = s.members.find(
    (m) => m.organization_id === s.activeOrgId && m.role === s.role,
  )
  return me?.display_name ?? 'You'
}

function pushActivity(s: CrmState, kind: ActivityKind, text: string): CrmState {
  const entry: Activity = {
    id: uid('act'),
    organization_id: s.activeOrgId,
    at: new Date().toISOString(),
    kind,
    text,
    actor: actorName(),
  }
  return { ...s, activity: [entry, ...s.activity] }
}

const replace = <T extends { id: string }>(
  rows: Array<T>,
  id: string,
  patch: Partial<T>,
) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))

function nextNumber(
  rows: Array<{ number: string; organization_id: string }>,
  prefix: string,
  orgId: string,
  fallback: number,
) {
  const nums = rows
    .filter((r) => r.organization_id === orgId && r.number.startsWith(prefix))
    .map((r) => Number(r.number.slice(prefix.length)))
    .filter((n) => !Number.isNaN(n))
  return `${prefix}${nums.length ? Math.max(...nums) + 1 : fallback}`
}

export const actions = {
  setActiveOrg(id: string) {
    setState((s) => ({ ...s, activeOrgId: id }))
  },
  setRole(role: OrgRole) {
    setState((s) => ({ ...s, role }))
  },

  // ---- Organization / onboarding ----
  createOrganization(input: {
    name: string
    address_line1: string
    city: string
    region: string
    postal_code: string
    serviceAreas: Array<string>
    teamSize: string
    serviceNames: Array<string>
    businessHours: Organization['businessHours']
    ownerName: string
    ownerEmail: string
  }) {
    const id = uid('org')
    const slug =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'company'
    const org: Organization = {
      id,
      name: input.name,
      slug,
      timezone: 'America/Edmonton',
      currency: 'CAD',
      email: input.ownerEmail,
      phone: '',
      address_line1: input.address_line1,
      city: input.city,
      region: input.region,
      postal_code: input.postal_code,
      serviceAreas: input.serviceAreas,
      teamSize: input.teamSize,
      businessHours: input.businessHours,
      brandColor: '#2f7350',
      logoDataUrl: null,
      plan: 'professional',
      billingCycle: 'monthly',
      trialEndsAt: addDays(todayISO(), 14),
      createdAt: todayISO(),
    }
    const owner: Member = {
      id: uid('mem'),
      organization_id: id,
      display_name: input.ownerName || 'Owner',
      email: input.ownerEmail,
      phone: '',
      role: 'owner',
      status: 'active',
      title: 'Owner',
      certifications: [],
      vehicle: null,
      workDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      timeOff: [],
      rating: 5,
      hourlyRateCents: 0,
      joinedAt: todayISO(),
    }
    const services: Array<Service> = DEFAULT_SERVICES.filter((d) =>
      input.serviceNames.includes(d.name),
    ).map((d) => ({
      ...d,
      id: uid('svc'),
      organization_id: id,
    }))
    const crew: Crew = {
      id: uid('crew'),
      organization_id: id,
      name: 'Crew A',
      color: '#7fb547',
      memberIds: [],
      leadId: null,
      vehicle: null,
    }
    setState((s) => ({
      ...s,
      organizations: [...s.organizations, org],
      activeOrgId: id,
      role: 'owner',
      members: [...s.members, owner],
      services: [...s.services, ...services],
      crews: [...s.crews, crew],
      activity: [
        {
          id: uid('act'),
          organization_id: id,
          at: new Date().toISOString(),
          kind: 'settings',
          text: `Workspace created for ${org.name} with ${services.length} default services`,
          actor: owner.display_name,
        },
        ...s.activity,
      ],
    }))
    return id
  },
  updateOrganization(id: string, patch: Partial<Organization>) {
    setState((s) => ({
      ...s,
      organizations: replace(s.organizations, id, patch),
    }))
  },

  // ---- Clients ----
  addClient(input: {
    display_name: string
    kind: Client['kind']
    status?: Client['status']
    email: string
    phone: string
    address_line1: string
    city?: string
    lawnSqft?: number
    gateCode?: string
    pets?: string
    instructions?: string
  }) {
    const s = getState()
    const org = s.organizations.find((o) => o.id === s.activeOrgId)!
    const clientId = uid('cli')
    const client: Client = {
      id: clientId,
      organization_id: org.id,
      kind: input.kind,
      status: input.status ?? 'active',
      display_name: input.display_name,
      email: input.email,
      phone: input.phone,
      createdAt: new Date().toISOString(),
      notes: [],
    }
    const property: Property = {
      id: uid('prop'),
      organization_id: org.id,
      client_id: clientId,
      label: input.kind === 'company' ? 'Main site' : 'Home',
      address_line1: input.address_line1,
      city: input.city ?? org.city,
      region: org.region,
      postal_code: '',
      lawnSqft: input.lawnSqft ?? 0,
      gateCode: input.gateCode ?? '',
      pets: input.pets ?? 'None',
      accessNotes: '',
      instructions: input.instructions ?? '',
      x: Math.round(10 + Math.random() * 80),
      y: Math.round(12 + Math.random() * 76),
      // Geocoding on save comes in phase 2; until then new addresses aren't on the map.
      location: null,
    }
    setState((st) =>
      pushActivity(
        {
          ...st,
          clients: [...st.clients, client],
          properties: [...st.properties, property],
        },
        'client_created',
        `New client added: ${client.display_name}`,
      ),
    )
    return clientId
  },
  updateClient(id: string, patch: Partial<Client>) {
    setState((s) => ({ ...s, clients: replace(s.clients, id, patch) }))
  },
  updateProperty(id: string, patch: Partial<Property>) {
    setState((s) => ({ ...s, properties: replace(s.properties, id, patch) }))
  },
  addClientNote(clientId: string, text: string) {
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) =>
        c.id === clientId
          ? {
              ...c,
              notes: [
                {
                  id: uid('note'),
                  at: new Date().toISOString(),
                  author: actorName(),
                  text,
                },
                ...c.notes,
              ],
            }
          : c,
      ),
    }))
  },

  // ---- Requests ----
  addRequest(
    input: Omit<
      ServiceRequest,
      'id' | 'organization_id' | 'submittedAt' | 'status' | 'quote' | 'job_id'
    >,
  ) {
    const req: ServiceRequest = {
      ...input,
      id: uid('req'),
      organization_id: activeOrgId(),
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      quote: null,
      job_id: null,
    }
    const s = getState()
    const who =
      input.prospect?.name ??
      s.clients.find((c) => c.id === input.client_id)?.display_name ??
      'a customer'
    const svc =
      s.services.find((x) => x.id === input.service_id)?.name ?? 'a service'
    setState((st) =>
      pushActivity(
        { ...st, requests: [req, ...st.requests] },
        'request_submitted',
        `New request from ${who}: ${svc}`,
      ),
    )
    return req.id
  },
  setRequestStatus(id: string, status: RequestStatus) {
    const req = getState().requests.find((r) => r.id === id)
    setState((s) => {
      let next: CrmState = {
        ...s,
        requests: replace(s.requests, id, { status }),
      }
      const who =
        req?.prospect?.name ??
        s.clients.find((c) => c.id === req?.client_id)?.display_name ??
        'customer'
      if (status === 'approved')
        next = pushActivity(
          next,
          'request_approved',
          `Request from ${who} approved`,
        )
      if (status === 'rejected')
        next = pushActivity(
          next,
          'request_rejected',
          `Request from ${who} declined`,
        )
      return next
    })
  },
  saveQuote(
    id: string,
    quote: Omit<Quote, 'number' | 'createdAt'> & { number?: string },
  ) {
    setState((s) => {
      const existing = s.requests.find((r) => r.id === id)?.quote
      const allQuotes = s.requests
        .filter((r) => r.quote)
        .map((r) => ({
          number: r.quote!.number,
          organization_id: r.organization_id,
        }))
      const number =
        existing?.number ?? nextNumber(allQuotes, 'Q-', s.activeOrgId, 3100)
      return {
        ...s,
        requests: replace(s.requests, id, {
          quote: { ...quote, number, createdAt: new Date().toISOString() },
          status: 'estimated',
        }),
      }
    })
  },
  /** Creates the job; if the request came from a prospect, creates them as a lead client first. */
  scheduleRequest(
    id: string,
    input: { date: string; start: string; crew_id: string | null },
  ) {
    const s = getState()
    const req = s.requests.find((r) => r.id === id)
    if (!req) return null
    let clientId = req.client_id
    if (!clientId && req.prospect) {
      clientId = actions.addClient({
        display_name: req.prospect.name,
        kind: 'individual',
        status: 'lead',
        email: req.prospect.email,
        phone: req.prospect.phone,
        address_line1: req.address.split(',')[0],
      })
    }
    if (!clientId) return null
    const property = getState().properties.find((p) => p.client_id === clientId)
    const service = s.services.find((x) => x.id === req.service_id)
    const total = req.quote
      ? quoteTotals(req.quote).total
      : (service?.default_price_cents ?? 0)
    const jobId = actions.addJob({
      client_id: clientId,
      property_id: property?.id ?? '',
      service_ids: [req.service_id],
      crew_id: input.crew_id,
      date: input.date,
      start: input.start,
      durationMinutes: service?.default_duration_minutes ?? 60,
      price_cents: total,
      notes: req.notes,
      request_id: req.id,
    })
    setState((st) => ({
      ...st,
      requests: replace(st.requests, id, {
        status: 'scheduled',
        job_id: jobId,
        client_id: clientId,
      }),
    }))
    return jobId
  },
  convertRequest(id: string) {
    const req = getState().requests.find((r) => r.id === id)
    if (!req) return
    setState((s) => {
      const clients = req.client_id
        ? replace(s.clients, req.client_id, { status: 'active' as const })
        : s.clients
      return pushActivity(
        {
          ...s,
          clients,
          requests: replace(s.requests, id, { status: 'converted' }),
        },
        'client_created',
        `${req.prospect?.name ?? s.clients.find((c) => c.id === req.client_id)?.display_name ?? 'Customer'} converted to an active client`,
      )
    })
  },

  // ---- Jobs ----
  addJob(input: {
    client_id: string
    property_id: string
    service_ids: Array<string>
    crew_id: string | null
    date: string
    start: string
    durationMinutes: number
    price_cents: number
    notes?: string
    recurrence?: Job['recurrence']
    request_id?: string | null
  }) {
    const s = getState()
    const job: Job = {
      id: uid('job'),
      number: nextNumber(s.jobs, 'J-', s.activeOrgId, 1001),
      organization_id: s.activeOrgId,
      client_id: input.client_id,
      property_id: input.property_id,
      service_ids: input.service_ids,
      crew_id: input.crew_id,
      date: input.date,
      start: input.start,
      durationMinutes: input.durationMinutes,
      status: input.crew_id ? 'assigned' : 'scheduled',
      recurrence: input.recurrence ?? 'one_time',
      price_cents: input.price_cents,
      notes: input.notes ?? '',
      completionNotes: '',
      photos: [],
      invoice_id: null,
      request_id: input.request_id ?? null,
    }
    const clientName =
      s.clients.find((c) => c.id === input.client_id)?.display_name ?? 'client'
    setState((st) =>
      pushActivity(
        { ...st, jobs: [...st.jobs, job] },
        'job_scheduled',
        `${job.number} scheduled for ${clientName}`,
      ),
    )
    return job.id
  },
  updateJob(id: string, patch: Partial<Job>) {
    setState((s) => ({ ...s, jobs: replace(s.jobs, id, patch) }))
  },
  /** Drag-and-drop: move a job to a new date/time and (optionally) a different crew. */
  moveJob(
    id: string,
    to: { date?: string; start?: string; crew_id?: string | null },
  ) {
    const s = getState()
    const job = s.jobs.find((j) => j.id === id)
    if (!job) return
    const crewChanged = to.crew_id !== undefined && to.crew_id !== job.crew_id
    const crew_id = to.crew_id === undefined ? job.crew_id : to.crew_id
    const status =
      job.status === 'scheduled' || job.status === 'assigned'
        ? crew_id
          ? 'assigned'
          : 'scheduled'
        : job.status
    setState((st) => {
      let next: CrmState = {
        ...st,
        jobs: replace(st.jobs, id, {
          date: to.date ?? job.date,
          start: to.start ?? job.start,
          crew_id,
          status,
        }),
      }
      if (crewChanged && crew_id) {
        const crewName = st.crews.find((c) => c.id === crew_id)?.name ?? 'crew'
        next = pushActivity(
          next,
          'crew_assigned',
          `${crewName} assigned to ${job.number}`,
        )
      }
      return next
    })
  },
  setJobStatus(id: string, status: Job['status']) {
    if (status === 'completed') return actions.completeJob(id, {})
    setState((s) => ({ ...s, jobs: replace(s.jobs, id, { status }) }))
  },
  /** Marks a job complete and generates its invoice. */
  completeJob(id: string, input: { notes?: string; photos?: Job['photos'] }) {
    const s = getState()
    const job = s.jobs.find((j) => j.id === id)
    if (!job) return
    let invoiceId = job.invoice_id
    let invoices = s.invoices
    if (!invoiceId) {
      invoiceId = uid('inv')
      const invoice: Invoice = {
        id: invoiceId,
        number: nextNumber(s.invoices, 'INV-', job.organization_id, 2001),
        organization_id: job.organization_id,
        client_id: job.client_id,
        job_ids: [job.id],
        issuedAt: todayISO(),
        dueAt: addDays(todayISO(), 30),
        total_cents: job.price_cents,
        status: 'sent',
        payments: [],
      }
      invoices = [...invoices, invoice]
    }
    const clientName =
      s.clients.find((c) => c.id === job.client_id)?.display_name ?? 'client'
    setState((st) =>
      pushActivity(
        {
          ...st,
          invoices,
          jobs: replace(st.jobs, id, {
            status: 'completed',
            invoice_id: invoiceId,
            completionNotes: input.notes ?? job.completionNotes,
            photos: input.photos ?? job.photos,
          }),
        },
        'job_completed',
        `${job.number} completed at ${clientName}, invoice sent`,
      ),
    )
  },

  // ---- Invoices ----
  recordPayment(
    invoiceId: string,
    amountCents: number,
    method: Payment['method'],
  ) {
    const s = getState()
    const inv = s.invoices.find((i) => i.id === invoiceId)
    if (!inv) return
    const payment: Payment = {
      id: uid('pay'),
      amount_cents: amountCents,
      method,
      at: new Date().toISOString(),
    }
    const payments = [...inv.payments, payment]
    const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0)
    const status: Invoice['status'] =
      paid >= inv.total_cents ? 'paid' : 'partially_paid'
    const clientName =
      s.clients.find((c) => c.id === inv.client_id)?.display_name ?? 'client'
    setState((st) =>
      pushActivity(
        {
          ...st,
          invoices: replace(st.invoices, invoiceId, { payments, status }),
        },
        'invoice_paid',
        `${inv.number} ${status === 'paid' ? 'paid' : 'partially paid'} by ${clientName}`,
      ),
    )
  },

  // ---- Services ----
  saveService(
    input: Omit<Service, 'organization_id' | 'id'> & { id?: string },
  ) {
    if (input.id) {
      const { id, ...patch } = input
      setState((s) => ({ ...s, services: replace(s.services, id, patch) }))
      return id
    }
    const svc: Service = {
      ...input,
      id: uid('svc'),
      organization_id: activeOrgId(),
    }
    setState((s) => ({ ...s, services: [...s.services, svc] }))
    return svc.id
  },
  updateService(id: string, patch: Partial<Service>) {
    setState((s) => ({ ...s, services: replace(s.services, id, patch) }))
  },

  // ---- Team ----
  addCrew(name: string, color: string) {
    const crew: Crew = {
      id: uid('crew'),
      organization_id: activeOrgId(),
      name,
      color,
      memberIds: [],
      leadId: null,
      vehicle: null,
    }
    setState((s) => ({ ...s, crews: [...s.crews, crew] }))
  },
  updateCrew(id: string, patch: Partial<Crew>) {
    setState((s) => ({ ...s, crews: replace(s.crews, id, patch) }))
  },
  /** Crew builder: move a member into a crew (or to unassigned with null). */
  moveMemberToCrew(memberId: string, crewId: string | null) {
    setState((s) => {
      const crews = s.crews.map((c) => {
        if (c.organization_id !== s.activeOrgId) return c
        const without = c.memberIds.filter((m) => m !== memberId)
        if (c.id === crewId) return { ...c, memberIds: [...without, memberId] }
        return {
          ...c,
          memberIds: without,
          leadId: c.leadId === memberId ? null : c.leadId,
        }
      })
      let next: CrmState = { ...s, crews }
      if (crewId) {
        const crew = crews.find((c) => c.id === crewId)
        const member = s.members.find((m) => m.id === memberId)
        if (crew && member) {
          next = {
            ...next,
            members: replace(next.members, memberId, { vehicle: crew.vehicle }),
          }
          next = pushActivity(
            next,
            'crew_assigned',
            `${member.display_name} moved to ${crew.name}`,
          )
        }
      }
      return next
    })
  },
  inviteMember(input: { name: string; email: string; role: OrgRole }) {
    const member: Member = {
      id: uid('mem'),
      organization_id: activeOrgId(),
      display_name: input.name || input.email.split('@')[0],
      email: input.email,
      phone: '',
      role: input.role,
      status: 'invited',
      title: ROLE_LABEL[input.role],
      certifications: [],
      vehicle: null,
      workDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      timeOff: [],
      rating: 0,
      hourlyRateCents: 2600,
      joinedAt: todayISO(),
    }
    setState((s) =>
      pushActivity(
        { ...s, members: [...s.members, member] },
        'member_invited',
        `Invitation sent to ${input.email}`,
      ),
    )
  },
  updateMember(id: string, patch: Partial<Member>) {
    setState((s) => ({ ...s, members: replace(s.members, id, patch) }))
  },
  addTimeOff(memberId: string, entry: Omit<TimeOff, 'id'>) {
    setState((s) => ({
      ...s,
      members: s.members.map((m) =>
        m.id === memberId
          ? { ...m, timeOff: [...m.timeOff, { ...entry, id: uid('to') }] }
          : m,
      ),
    }))
  },
  removeTimeOff(memberId: string, timeOffId: string) {
    setState((s) => ({
      ...s,
      members: s.members.map((m) =>
        m.id === memberId
          ? { ...m, timeOff: m.timeOff.filter((t) => t.id !== timeOffId) }
          : m,
      ),
    }))
  },
  logActivity(kind: ActivityKind, text: string) {
    setState((s) => pushActivity(s, kind, text))
  },
}

export { DEFAULT_HOURS, DEFAULT_SERVICES, inSeason }
