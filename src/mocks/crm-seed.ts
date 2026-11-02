/**
 * Demo data for two tenants, generated relative to today so the app always
 * looks "live". Deterministic (seeded RNG) so reloads look the same.
 *
 * Replace with tRPC queries once the domain procedures exist. Every record
 * carries `organization_id`, and every screen reads through `useTenant()`,
 * which filters by the active organization.
 */
import { inSeason } from '#/integrations/services/types'
import {
  addDays,
  fromMinutes,
  parseDate,
  toMinutes,
  todayISO,
} from '#/components/crm/format'
import type {
  Activity,
  Client,
  ClientKind,
  ClientStatus,
  CrmState,
  Crew,
  DayHours,
  Invoice,
  Job,
  JobStatus,
  Member,
  OrgRole,
  Organization,
  Property,
  Service,
  ServiceRequest,
  TimeOff,
  Weekday,
} from './crm-types'

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WEEKDAYS: Array<Weekday> = ['mon', 'tue', 'wed', 'thu', 'fri']

export const DEFAULT_HOURS: Record<Weekday, DayHours> = {
  mon: { open: '07:00', close: '18:00', closed: false },
  tue: { open: '07:00', close: '18:00', closed: false },
  wed: { open: '07:00', close: '18:00', closed: false },
  thu: { open: '07:00', close: '18:00', closed: false },
  fri: { open: '07:00', close: '18:00', closed: false },
  sat: { open: '08:00', close: '14:00', closed: false },
  sun: { open: '09:00', close: '13:00', closed: true },
}

/** Default service catalog a new workspace starts with (onboarding). */
export const DEFAULT_SERVICES: Array<Omit<Service, 'id' | 'organization_id'>> =
  [
    {
      name: 'Lawn Mowing',
      description:
        'Mowing, string trimming, edging, and blowing clippings off hard surfaces.',
      unit: 'visit',
      default_price_cents: 5500,
      default_duration_minutes: 60,
      is_active: true,
      color: '#7fb547',
      equipment: [
        'Zero-turn mower',
        'String trimmer',
        'Edger',
        'Backpack blower',
      ],
      frequencies: ['weekly', 'biweekly'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: { start: 4, end: 10 },
    },
    {
      name: 'Fertilization',
      description:
        'Slow-release granular fertilizer program matched to the season.',
      unit: 'visit',
      default_price_cents: 8500,
      default_duration_minutes: 45,
      is_active: true,
      color: '#3f8f5b',
      equipment: ['Broadcast spreader'],
      frequencies: ['monthly', 'one_time'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: { start: 4, end: 9 },
    },
    {
      name: 'Weed Control',
      description: 'Targeted broadleaf weed treatment for lawns and beds.',
      unit: 'visit',
      default_price_cents: 7500,
      default_duration_minutes: 45,
      is_active: true,
      color: '#a5c25a',
      equipment: ['Backpack sprayer', 'PPE kit'],
      frequencies: ['monthly', 'one_time'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: { start: 5, end: 9 },
    },
    {
      name: 'Snow Removal',
      description:
        'Driveway and walkway clearing after each snowfall over 2 cm, with ice melt.',
      unit: 'visit',
      default_price_cents: 6500,
      default_duration_minutes: 45,
      is_active: true,
      color: '#6aa6c9',
      equipment: ['Plow truck', 'Snow blower', 'Salt spreader'],
      frequencies: ['one_time', 'weekly'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: { start: 11, end: 3 },
    },
    {
      name: 'Fall Cleanup',
      description:
        'Leaf removal, bed cutback, final mow, and debris haul-away before winter.',
      unit: 'monthly',
      default_price_cents: 17500,
      default_duration_minutes: 150,
      is_active: true,
      color: '#d98a3d',
      equipment: ['Leaf vacuum', 'Backpack blower', 'Dump trailer'],
      frequencies: ['one_time'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: { start: 9, end: 11 },
    },
    {
      name: 'Spring Cleanup',
      description:
        'Debris removal, power raking, bed edging, and first cut of the season.',
      unit: 'monthly',
      default_price_cents: 22500,
      default_duration_minutes: 180,
      is_active: true,
      color: '#c8d96a',
      equipment: ['Power rake', 'Backpack blower', 'Dump trailer'],
      frequencies: ['one_time'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: { start: 3, end: 5 },
    },
    {
      name: 'Tree Trimming',
      description:
        'Removal of small dead or overgrown branches to keep trees healthy.',
      unit: 'hour',
      default_price_cents: 30000,
      default_duration_minutes: 180,
      is_active: true,
      color: '#5c7c3a',
      equipment: ['Chainsaw', 'Pole saw', 'Ladder', 'Chipper'],
      frequencies: ['one_time'],
      precipitation_type: 'none',
      precipitation_action: 'none',
      season: null,
    },
  ]

const EXTRA_SERVICES: Array<Omit<Service, 'id' | 'organization_id'>> = [
  {
    name: 'Hedge & Shrub Trimming',
    description:
      'Pruning and shaping of hedges, shrubs, and ornamental bushes.',
    unit: 'monthly',
    default_price_cents: 13500,
    default_duration_minutes: 120,
    is_active: true,
    color: '#8bbf9f',
    equipment: ['Hedge trimmer', 'Hand pruners', 'Tarps'],
    frequencies: ['one_time', 'monthly'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season: { start: 5, end: 10 },
  },
  {
    name: 'Lawn Aeration',
    description:
      'Core aeration to improve soil oxygen, water absorption, and root growth.',
    unit: 'monthly',
    default_price_cents: 12000,
    default_duration_minutes: 60,
    is_active: true,
    color: '#b9a46b',
    equipment: ['Core aerator'],
    frequencies: ['one_time'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season: { start: 4, end: 10 },
  },
  {
    name: 'Irrigation Winterization',
    description: 'Blow-out and shutdown of residential irrigation systems.',
    unit: 'monthly',
    default_price_cents: 12500,
    default_duration_minutes: 60,
    is_active: true,
    color: '#4fa3a5',
    equipment: ['Tow-behind compressor'],
    frequencies: ['one_time'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season: { start: 9, end: 11 },
  },
  {
    name: 'Mulch Installation',
    description:
      'Supply and install decorative mulch in garden beds and landscaped areas.',
    unit: 'yard',
    default_price_cents: 27500,
    default_duration_minutes: 180,
    is_active: true,
    color: '#8a5a3c',
    equipment: ['Wheelbarrows', 'Dump trailer'],
    frequencies: ['one_time'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season: { start: 4, end: 10 },
  },
  {
    name: 'Sod Installation',
    description:
      'Turf removal, soil prep, and installation of fresh sod. Priced per sq ft.',
    unit: 'sqft',
    default_price_cents: 120000,
    default_duration_minutes: 480,
    is_active: true,
    color: '#4c9a2a',
    equipment: ['Sod cutter', 'Roller', 'Skid steer'],
    frequencies: ['one_time'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season: { start: 5, end: 9 },
  },
  {
    name: 'Seasonal Flower Planting',
    description: 'Seasonal annuals and ornamentals in existing beds.',
    unit: 'monthly',
    default_price_cents: 18000,
    default_duration_minutes: 120,
    is_active: false,
    color: '#e07a8f',
    equipment: ['Hand tools'],
    frequencies: ['one_time'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season: { start: 5, end: 6 },
  },
]

interface ClientSeed {
  name: string
  kind: ClientKind
  status: ClientStatus
  street: string
  area: string
  phone: string
}

const STREETS = [
  'Aspen Ridge Way SW',
  'Prospect Ave SW',
  '8 Ave NE',
  'Tuscany Springs Blvd NW',
  'Signal Hill Dr SW',
  '33 Ave SW',
  'Bowness Rd NW',
  'Kensington Rd NW',
  'Lake Bonavista Dr SE',
  'Varsity Dr NW',
  'Centre St N',
  '9 Ave SE',
  'Elbow Dr SW',
  'Crowchild Trl NW',
  'Glenmore Trl SW',
  'Macleod Trl SE',
]

const PET_NOTES = [
  'None',
  'Friendly golden retriever, keep gate latched',
  'Two cats indoors',
  'None',
  'Dog in yard before 9 AM, call ahead',
  'None',
]
const ACCESS_NOTES = [
  'Side gate on the left of the garage',
  'Back lane access, park on the street',
  'Use the front walkway, side gate sticks',
  'Ring the bell on arrival',
  'Loading dock entrance off the north lot',
  'Text the client 15 minutes before arrival',
]
const INSTRUCTIONS = [
  'Avoid the vegetable garden along the back fence.',
  'Bag clippings, the client composts them.',
  'Mow at 3" height. Skip the wildflower strip.',
  'Do not blow debris onto the neighbour’s driveway.',
  'Sprinkler heads near the curb are marked with flags.',
  'Leave the gate open for the dog walker on Thursdays.',
]

interface OrgSeedConfig {
  org: Organization
  seed: number
  members: Array<{
    name: string
    role: OrgRole
    title: string
    status?: Member['status']
    certs?: Array<string>
    vehicle?: string | null
    crew?: number
    lead?: boolean
    timeOff?: Array<Omit<TimeOff, 'id'>>
    workDays?: Array<Weekday>
  }>
  crews: Array<{ name: string; color: string; vehicle: string }>
  clients: Array<ClientSeed>
  services: Array<Omit<Service, 'id' | 'organization_id'>>
  daysBack: number
  daysForward: number
  jobsPerCrewPerDay: number
  jobPrefixStart: number
}

function seedOrg(cfg: OrgSeedConfig) {
  const r = rng(cfg.seed)
  const pick = <T>(arr: Array<T>) => arr[Math.floor(r() * arr.length)]
  const orgId = cfg.org.id
  const today = todayISO()
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const services: Array<Service> = cfg.services.map((s, i) => ({
    ...s,
    id: `${orgId}_svc_${i + 1}`,
    organization_id: orgId,
  }))

  const crews: Array<Crew> = cfg.crews.map((c, i) => ({
    id: `${orgId}_crew_${i + 1}`,
    organization_id: orgId,
    name: c.name,
    color: c.color,
    vehicle: c.vehicle,
    memberIds: [],
    leadId: null,
  }))

  const members: Array<Member> = cfg.members.map((m, i) => {
    const id = `${orgId}_mem_${i + 1}`
    const first = m.name.split(' ')[0].toLowerCase()
    if (m.crew !== undefined) {
      crews[m.crew].memberIds.push(id)
      if (m.lead) crews[m.crew].leadId = id
    }
    return {
      id,
      organization_id: orgId,
      display_name: m.name,
      email: `${first}@${cfg.org.slug}.ca`,
      phone: `(403) 555-${String(1200 + i * 37).slice(-4)}`,
      role: m.role,
      status: m.status ?? 'active',
      title: m.title,
      certifications: m.certs ?? [],
      vehicle:
        m.vehicle ?? (m.crew !== undefined ? cfg.crews[m.crew].vehicle : null),
      workDays:
        m.workDays ??
        (m.role === 'worker' ? [...WEEKDAYS, 'sat'] : [...WEEKDAYS]),
      timeOff: (m.timeOff ?? []).map((t, j) => ({ ...t, id: `${id}_to_${j}` })),
      rating: Math.round((4.2 + r() * 0.8) * 10) / 10,
      hourlyRateCents:
        m.role === 'worker' ? 2400 + Math.round(r() * 8) * 100 : 3800,
      joinedAt: addDays(today, -Math.round(120 + r() * 900)),
    }
  })

  const clients: Array<Client> = []
  const properties: Array<Property> = []
  cfg.clients.forEach((c, i) => {
    const id = `${orgId}_cli_${i + 1}`
    const createdDaysAgo =
      c.status === 'lead'
        ? Math.round(r() * 6)
        : i < 3
          ? Math.round(3 + r() * 20)
          : Math.round(40 + r() * 700)
    clients.push({
      id,
      organization_id: orgId,
      kind: c.kind,
      status: c.status,
      display_name: c.name,
      email:
        c.kind === 'company'
          ? `facilities@${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.ca`
          : `${c.name.split(' ')[0].toLowerCase()}.${(c.name.split(' ')[1] ?? 'home').toLowerCase()}@mail.com`,
      phone: c.phone,
      createdAt: new Date(
        parseDate(addDays(today, -createdDaysAgo)).getTime() + 10 * 3600_000,
      ).toISOString(),
      notes:
        i % 3 === 0
          ? [
              {
                id: `${id}_note_1`,
                at: new Date(Date.now() - (5 + i) * 86_400_000).toISOString(),
                author: cfg.members[0].name,
                text:
                  c.kind === 'company'
                    ? 'Prefers invoices consolidated monthly. Contact property manager for access changes.'
                    : 'Very happy with last visit. Interested in adding aeration next season.',
              },
            ]
          : [],
    })
    const propCount = c.kind === 'company' && i % 2 === 0 ? 2 : 1
    for (let p = 0; p < propCount; p++) {
      properties.push({
        id: `${id}_prop_${p + 1}`,
        organization_id: orgId,
        client_id: id,
        label:
          propCount > 1
            ? p === 0
              ? 'Main site'
              : 'North lot'
            : c.kind === 'company'
              ? 'Main site'
              : 'Home',
        address_line1: `${Math.round(40 + r() * 2900)} ${p === 0 ? c.street : pick(STREETS)}`,
        city: cfg.org.city,
        region: cfg.org.region,
        postal_code: `T${Math.round(1 + r() * 3)}${pick(['A', 'B', 'C', 'E', 'G', 'H'])} ${Math.round(r() * 9)}${pick(['K', 'L', 'M', 'N'])}${Math.round(r() * 9)}`,
        lawnSqft:
          c.kind === 'company'
            ? Math.round((12000 + r() * 40000) / 100) * 100
            : Math.round((1800 + r() * 5200) / 50) * 50,
        gateCode: r() > 0.5 ? `#${Math.round(1000 + r() * 8999)}` : '',
        pets: c.kind === 'company' ? 'None' : pick(PET_NOTES),
        accessNotes: pick(ACCESS_NOTES),
        instructions: pick(INSTRUCTIONS),
        x: Math.round(8 + r() * 84),
        y: Math.round(10 + r() * 80),
      })
    }
  })

  // ---- Jobs ----------------------------------------------------------------
  const jobsRaw: Array<Omit<Job, 'number'>> = []
  const activeProps = properties.filter((p) => {
    const client = clients.find((c) => c.id === p.client_id)
    return client && client.status === 'active'
  })
  let jobCounter = 0
  const DAY_END = toMinutes('17:30')
  const crewAway = (crew: Crew, date: string) =>
    crew.memberIds.every((id) => {
      const m = members.find((x) => x.id === id)
      return !!m && m.timeOff.some((t) => t.start <= date && t.end >= date)
    })
  for (let offset = -cfg.daysBack; offset <= cfg.daysForward; offset++) {
    const date = addDays(today, offset)
    const dow = parseDate(date).getDay()
    if (dow === 0) continue
    // Each property is visited at most once a day (shuffled per day).
    const dayPool = [...activeProps].sort(() => r() - 0.5)
    const month = parseDate(date).getMonth() + 1
    const seasonal = services.filter((s) => s.is_active && inSeason(s, month))
    const pool = seasonal.length
      ? seasonal
      : services.filter((s) => s.is_active)
    crews.forEach((crew, ci) => {
      if (crew.memberIds.length === 0) return
      if (dow === 6 && ci > 0) return
      // Don't book a crew whose whole team is away, except one deliberate
      // conflict tomorrow so the calendar has something to flag.
      if (crewAway(crew, date) && offset !== 1) return
      const count =
        dow === 6
          ? 2
          : cfg.jobsPerCrewPerDay -
            (ci === crews.length - 1 && crews.length > 2 ? 1 : 0)
      let cursor = toMinutes('08:00') + Math.round(r() * 2) * 15
      for (let k = 0; k < count; k++) {
        if (!dayPool.length) break
        const prop = dayPool.pop()!
        const client = clients.find((c) => c.id === prop.client_id)!
        // Recurring mowing dominates, with a few seasonal one-offs.
        const mowing = pool.find((s) => s.name === 'Lawn Mowing')
        const svc = mowing && r() < 0.55 ? mowing : pick(pool)
        const svcIds = [svc.id]
        if (r() < 0.15) {
          const extra = pick(pool)
          if (extra.id !== svc.id) svcIds.push(extra.id)
        }
        const svcList = svcIds.map((id) => services.find((s) => s.id === id)!)
        const multiplier = client.kind === 'company' ? 2.6 : 1
        const duration = Math.min(
          240,
          Math.round(
            (svcList.reduce((sum, s) => sum + s.default_duration_minutes, 0) *
              (client.kind === 'company' ? 1.5 : 1)) /
              15,
          ) * 15,
        )
        if (cursor + duration > DAY_END) {
          dayPool.push(prop)
          break
        }
        const price =
          Math.round(
            (svcList.reduce((sum, s) => sum + s.default_price_cents, 0) *
              multiplier) /
              500,
          ) * 500
        const start = fromMinutes(cursor)
        cursor += duration + 30 + Math.round(r() * 2) * 15

        let status: JobStatus
        if (offset < 0) status = r() < 0.05 ? 'cancelled' : 'completed'
        else if (offset === 0) {
          const s = toMinutes(start)
          status =
            s + duration <= nowMinutes
              ? 'completed'
              : s <= nowMinutes
                ? 'in_progress'
                : 'assigned'
        } else status = 'assigned'

        jobCounter += 1
        jobsRaw.push({
          id: `${orgId}_job_${jobCounter}`,
          organization_id: orgId,
          client_id: client.id,
          property_id: prop.id,
          service_ids: svcIds,
          crew_id: crew.id,
          date,
          start,
          durationMinutes: duration,
          status,
          recurrence: svc.frequencies.includes('weekly')
            ? 'weekly'
            : 'one_time',
          price_cents: price,
          notes:
            k === 0 && r() < 0.3
              ? 'Client asked for a text when the crew is on the way.'
              : '',
          completionNotes:
            status === 'completed' && r() < 0.4
              ? 'Completed as scheduled. Gate re-latched.'
              : '',
          photos:
            status === 'completed' && r() < 0.25
              ? [
                  {
                    id: `${orgId}_ph_${jobCounter}_b`,
                    label: 'Before',
                    url: null,
                    hue: 70,
                    kind: 'before',
                  },
                  {
                    id: `${orgId}_ph_${jobCounter}_a`,
                    label: 'After',
                    url: null,
                    hue: 120,
                    kind: 'after',
                  },
                ]
              : [],
          invoice_id: null,
          request_id: null,
        })
      }
    })
    // A couple of unassigned jobs in the near future for the dispatcher to place.
    if (offset > 0 && offset <= 10 && offset % 3 === 1) {
      const prop = activeProps[Math.floor(r() * activeProps.length)]
      const svc = pick(pool)
      jobCounter += 1
      jobsRaw.push({
        id: `${orgId}_job_${jobCounter}`,
        organization_id: orgId,
        client_id: prop.client_id,
        property_id: prop.id,
        service_ids: [svc.id],
        crew_id: null,
        date,
        start: '13:00',
        durationMinutes: svc.default_duration_minutes,
        status: 'scheduled',
        recurrence: 'one_time',
        price_cents: svc.default_price_cents,
        notes: 'Needs a crew assigned.',
        completionNotes: '',
        photos: [],
        invoice_id: null,
        request_id: null,
      })
    }
  }

  // Deliberate scheduling conflicts so the calendar's conflict detection has something to show.
  const tomorrow = addDays(today, isSunday(addDays(today, 1)) ? 2 : 1)
  const crewB = crews.at(1)
  if (crewB) {
    const first = jobsRaw.find(
      (j) => j.date === tomorrow && j.crew_id === crewB.id,
    )
    if (first) {
      const prop = activeProps[3 % activeProps.length]
      jobCounter += 1
      jobsRaw.push({
        ...first,
        id: `${orgId}_job_${jobCounter}`,
        property_id: prop.id,
        client_id: prop.client_id,
        start: fromMinutes(toMinutes(first.start) + 30),
        notes: 'Booked by phone. Check crew availability.',
        photos: [],
      })
    }
  }

  jobsRaw.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const jobs: Array<Job> = jobsRaw.map((j, i) => ({
    ...j,
    number: `J-${cfg.jobPrefixStart + i}`,
  }))

  // ---- Invoices ------------------------------------------------------------
  const invoices: Array<Invoice> = []
  let invCounter = 0
  for (const job of jobs) {
    if (job.status !== 'completed') continue
    invCounter += 1
    const age = -Math.round(
      (parseDate(job.date).getTime() - parseDate(today).getTime()) / 86_400_000,
    )
    const paid = age > 20 ? r() > 0.06 : age > 3 ? r() > 0.4 : false
    const payDate = addDays(job.date, Math.min(age, Math.round(2 + r() * 14)))
    const invoice: Invoice = {
      id: `${orgId}_inv_${invCounter}`,
      number: `INV-${2000 + invCounter}`,
      organization_id: orgId,
      client_id: job.client_id,
      job_ids: [job.id],
      issuedAt: job.date,
      dueAt: addDays(job.date, 30),
      total_cents: job.price_cents,
      status: paid ? 'paid' : 'sent',
      payments: paid
        ? [
            {
              id: `${orgId}_pay_${invCounter}`,
              amount_cents: job.price_cents,
              method: pick(['card', 'card', 'etransfer', 'cheque'] as const),
              at: new Date(
                parseDate(payDate).getTime() + 14 * 3600_000,
              ).toISOString(),
            },
          ]
        : [],
    }
    job.invoice_id = invoice.id
    invoices.push(invoice)
  }

  return { services, crews, members, clients, properties, jobs, invoices }
}

function isSunday(iso: string) {
  return parseDate(iso).getDay() === 0
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

function makeOrg(
  partial: Partial<Organization> & Pick<Organization, 'id' | 'name' | 'slug'>,
): Organization {
  return {
    timezone: 'America/Edmonton',
    currency: 'CAD',
    email: `hello@${partial.slug}.ca`,
    phone: '(403) 555-0142',
    address_line1: '2150 Industrial Way SE',
    city: 'Calgary',
    region: 'AB',
    postal_code: 'T2C 4L9',
    serviceAreas: ['Calgary SW', 'Calgary NW', 'Cochrane', 'Okotoks'],
    teamSize: '11-25',
    businessHours: DEFAULT_HOURS,
    brandColor: '#2f7350',
    logoDataUrl: null,
    plan: 'professional',
    billingCycle: 'monthly',
    trialEndsAt: addDays(todayISO(), 9),
    createdAt: addDays(todayISO(), -420),
    ...partial,
  }
}

export function createSeed(): CrmState {
  const today = todayISO()

  const greenleaf = makeOrg({
    id: 'org_greenleaf',
    name: 'GreenLeaf Landscaping Co.',
    slug: 'greenleaf',
  })
  const northline = makeOrg({
    id: 'org_northline',
    name: 'Northline Grounds & Snow',
    slug: 'northline',
    city: 'Edmonton',
    address_line1: '9020 34 Ave NW',
    postal_code: 'T6E 5P4',
    phone: '(780) 555-0199',
    serviceAreas: ['Edmonton South', 'Sherwood Park', 'St. Albert'],
    teamSize: '2-5',
    plan: 'starter',
    brandColor: '#245a7a',
  })

  const a = seedOrg({
    org: greenleaf,
    seed: 20261006,
    jobPrefixStart: 1001,
    daysBack: 70,
    daysForward: 35,
    jobsPerCrewPerDay: 4,
    members: [
      {
        name: 'Morgan Ellis',
        role: 'owner',
        title: 'Owner',
        certs: ['Pesticide Applicator (AB)'],
      },
      {
        name: 'Emma Brooks',
        role: 'admin',
        title: 'Operations Manager',
        certs: ['First Aid / CPR'],
      },
      { name: 'Hannah Price', role: 'dispatcher', title: 'Dispatcher' },
      {
        name: 'John Carter',
        role: 'worker',
        title: 'Crew Lead',
        crew: 0,
        lead: true,
        certs: [
          'Class 5 licence',
          'First Aid / CPR',
          'Pesticide Applicator (AB)',
        ],
      },
      {
        name: 'Sarah Kim',
        role: 'worker',
        title: 'Landscaper',
        crew: 0,
        certs: ['First Aid / CPR'],
        timeOff: [
          { kind: 'sick', start: addDays(today, 2), end: addDays(today, 2) },
        ],
      },
      {
        name: 'Mike Alvarez',
        role: 'worker',
        title: 'Landscaper',
        crew: 0,
        certs: ['Chainsaw Safety'],
      },
      {
        name: 'David Osei',
        role: 'worker',
        title: 'Crew Lead',
        crew: 1,
        lead: true,
        certs: ['Class 5 licence', 'ISA Certified Arborist'],
      },
      {
        name: 'Alex Turner',
        role: 'worker',
        title: 'Landscaper',
        crew: 1,
        workDays: ['mon', 'tue', 'wed', 'thu'],
      },
      {
        name: 'Priya Nair',
        role: 'worker',
        title: 'Crew Lead',
        crew: 2,
        lead: true,
        certs: ['Class 5 licence', 'Irrigation Technician'],
      },
      {
        name: 'Liam Walsh',
        role: 'worker',
        title: 'Landscaper',
        crew: 2,
        timeOff: [
          {
            kind: 'personal',
            start: addDays(today, 8),
            end: addDays(today, 9),
            note: 'Family event',
          },
        ],
      },
      {
        name: 'Jordan Lee',
        role: 'worker',
        title: 'Seasonal Labourer',
        crew: 2,
      },
      {
        name: 'Noah Fischer',
        role: 'worker',
        title: 'Equipment Operator',
        crew: 3,
        lead: true,
        certs: ['Skid Steer Operator', 'Class 3 licence'],
        timeOff: [
          {
            kind: 'vacation',
            start: addDays(today, -2),
            end: addDays(today, 4),
            note: 'Booked in July',
          },
        ],
      },
      {
        name: 'Chloe Martin',
        role: 'worker',
        title: 'Landscaper',
        status: 'invited',
      },
    ],
    crews: [
      {
        name: 'Crew A · Evergreen',
        color: '#7fb547',
        vehicle: 'Truck 1 · Ford F-250',
      },
      {
        name: 'Crew B · Cedar',
        color: '#5b9bc4',
        vehicle: 'Truck 2 · Silverado 2500',
      },
      {
        name: 'Crew C · Maple',
        color: '#e0a03c',
        vehicle: 'Truck 3 · Ram 3500',
      },
      {
        name: 'Crew D · Birch',
        color: '#b0759c',
        vehicle: 'Truck 4 · Skid steer trailer',
      },
      {
        name: 'Crew E · Spruce',
        color: '#8a8f6a',
        vehicle: null as unknown as string,
      },
    ],
    clients: [
      {
        name: 'Olivia Bennett',
        kind: 'individual',
        status: 'active',
        street: 'Aspen Ridge Way SW',
        area: 'Aspen Woods',
        phone: '(403) 555-0187',
      },
      {
        name: 'Bow River Business Park',
        kind: 'company',
        status: 'active',
        street: 'Macleod Trl SE',
        area: 'Manchester',
        phone: '(403) 555-0110',
      },
      {
        name: 'Marcus Chen',
        kind: 'individual',
        status: 'active',
        street: 'Prospect Ave SW',
        area: 'Mount Royal',
        phone: '(403) 555-0133',
      },
      {
        name: 'Maple Ridge HOA',
        kind: 'company',
        status: 'active',
        street: 'Lake Bonavista Dr SE',
        area: 'Lake Bonavista',
        phone: '(403) 555-0164',
      },
      {
        name: 'Grace Holloway',
        kind: 'individual',
        status: 'active',
        street: 'Signal Hill Dr SW',
        area: 'Signal Hill',
        phone: '(403) 555-0121',
      },
      {
        name: 'Ethan Rivera',
        kind: 'individual',
        status: 'active',
        street: '33 Ave SW',
        area: 'Altadore',
        phone: '(403) 555-0158',
      },
      {
        name: 'Prairie Oaks Dental',
        kind: 'company',
        status: 'active',
        street: 'Crowchild Trl NW',
        area: 'Varsity',
        phone: '(403) 555-0176',
      },
      {
        name: 'Sophie Laurent',
        kind: 'individual',
        status: 'active',
        street: 'Kensington Rd NW',
        area: 'Kensington',
        phone: '(403) 555-0149',
      },
      {
        name: 'Daniel Okafor',
        kind: 'individual',
        status: 'active',
        street: 'Tuscany Springs Blvd NW',
        area: 'Tuscany',
        phone: '(403) 555-0192',
      },
      {
        name: 'Westbrook Apartments',
        kind: 'company',
        status: 'active',
        street: 'Bowness Rd NW',
        area: 'Bowness',
        phone: '(403) 555-0105',
      },
      {
        name: 'Ava Thompson',
        kind: 'individual',
        status: 'active',
        street: 'Elbow Dr SW',
        area: 'Elbow Park',
        phone: '(403) 555-0138',
      },
      {
        name: 'The Patel Family',
        kind: 'individual',
        status: 'active',
        street: 'Varsity Dr NW',
        area: 'Varsity',
        phone: '(403) 555-0169',
      },
      {
        name: 'Sunnyside Community Church',
        kind: 'company',
        status: 'active',
        street: 'Centre St N',
        area: 'Crescent Heights',
        phone: '(403) 555-0117',
      },
      {
        name: 'Isabella Rossi',
        kind: 'individual',
        status: 'active',
        street: '9 Ave SE',
        area: 'Inglewood',
        phone: '(403) 555-0145',
      },
      {
        name: 'Glenmore Retail Plaza',
        kind: 'company',
        status: 'active',
        street: 'Glenmore Trl SW',
        area: 'Glenmore',
        phone: '(403) 555-0128',
      },
      {
        name: 'Henry Walker',
        kind: 'individual',
        status: 'inactive',
        street: '8 Ave NE',
        area: 'Bridgeland',
        phone: '(403) 555-0153',
      },
      {
        name: 'Lucas Fournier',
        kind: 'individual',
        status: 'inactive',
        street: 'Bowness Rd NW',
        area: 'Montgomery',
        phone: '(403) 555-0181',
      },
      {
        name: 'Mia Johansson',
        kind: 'individual',
        status: 'lead',
        street: 'Signal Hill Dr SW',
        area: 'Signal Hill',
        phone: '(403) 555-0102',
      },
    ],
    services: [...DEFAULT_SERVICES, ...EXTRA_SERVICES],
  })
  // Crew E exists but has nobody on it yet (shows as an "available" crew with no vehicle).
  const spruce = a.crews.find((c) => c.name.includes('Spruce'))
  if (spruce) spruce.vehicle = null

  const b = seedOrg({
    org: northline,
    seed: 777,
    jobPrefixStart: 501,
    daysBack: 30,
    daysForward: 14,
    jobsPerCrewPerDay: 3,
    members: [
      { name: 'Riley Gauthier', role: 'owner', title: 'Owner' },
      {
        name: 'Sam Kowalski',
        role: 'worker',
        title: 'Crew Lead',
        crew: 0,
        lead: true,
      },
      { name: 'Tess Moreau', role: 'worker', title: 'Landscaper', crew: 0 },
      {
        name: 'Omar Haddad',
        role: 'worker',
        title: 'Crew Lead',
        crew: 1,
        lead: true,
      },
      { name: 'Zoe Clarke', role: 'worker', title: 'Landscaper', crew: 1 },
    ],
    crews: [
      { name: 'North Crew', color: '#5b9bc4', vehicle: 'Unit 7 · F-350 plow' },
      { name: 'South Crew', color: '#e0a03c', vehicle: 'Unit 9 · Sierra 2500' },
    ],
    clients: [
      {
        name: 'Whyte Ave Lofts',
        kind: 'company',
        status: 'active',
        street: 'Whyte Ave NW',
        area: 'Strathcona',
        phone: '(780) 555-0101',
      },
      {
        name: 'Karen Dubois',
        kind: 'individual',
        status: 'active',
        street: 'Saskatchewan Dr NW',
        area: 'Belgravia',
        phone: '(780) 555-0122',
      },
      {
        name: 'Terwillegar Medical',
        kind: 'company',
        status: 'active',
        street: 'Terwillegar Dr NW',
        area: 'Terwillegar',
        phone: '(780) 555-0134',
      },
      {
        name: 'Ben Achterberg',
        kind: 'individual',
        status: 'active',
        street: 'Riverbend Rd NW',
        area: 'Riverbend',
        phone: '(780) 555-0156',
      },
      {
        name: 'Priscilla Wong',
        kind: 'individual',
        status: 'lead',
        street: '109 St NW',
        area: 'Garneau',
        phone: '(780) 555-0177',
      },
    ],
    services: DEFAULT_SERVICES.filter((s) =>
      [
        'Lawn Mowing',
        'Snow Removal',
        'Fall Cleanup',
        'Spring Cleanup',
      ].includes(s.name),
    ),
  })

  const svcA = (name: string) => a.services.find((s) => s.name === name)!.id
  const cliA = (name: string) =>
    a.clients.find((c) => c.display_name === name)!.id
  const addrA = (name: string) => {
    const p = a.properties.find((x) => x.client_id === cliA(name))!
    return `${p.address_line1}, ${p.city}`
  }

  const scheduledJob = a.jobs.find(
    (j) => j.status === 'assigned' && j.date > today,
  )
  if (scheduledJob) scheduledJob.request_id = 'org_greenleaf_req_10'

  const requestsA: Array<ServiceRequest> = [
    {
      id: 'org_greenleaf_req_1',
      organization_id: 'org_greenleaf',
      client_id: null,
      prospect: {
        name: 'Nathan Brooks',
        email: 'nathan.brooks@mail.com',
        phone: '(403) 555-0611',
      },
      address: '412 Discovery Ridge Blvd SW, Calgary',
      service_id: svcA('Fall Cleanup'),
      submittedAt: hoursAgo(2),
      status: 'submitted',
      notes:
        'Large maple dropped everything this week. Need leaves gone before first snow, plus beds cut back.',
      photos: [
        { id: 'p1', label: 'Front yard', url: null, hue: 35, kind: 'request' },
        { id: 'p2', label: 'Side bed', url: null, hue: 55, kind: 'request' },
      ],
      quote: null,
      job_id: null,
      source: 'web_form',
    },
    {
      id: 'org_greenleaf_req_2',
      organization_id: 'org_greenleaf',
      client_id: cliA('Grace Holloway'),
      prospect: null,
      address: addrA('Grace Holloway'),
      service_id: svcA('Irrigation Winterization'),
      submittedAt: hoursAgo(5),
      status: 'submitted',
      notes: 'Please blow out the sprinklers before the end of the month.',
      photos: [],
      quote: null,
      job_id: null,
      source: 'client_portal',
    },
    {
      id: 'org_greenleaf_req_3',
      organization_id: 'org_greenleaf',
      client_id: null,
      prospect: {
        name: 'Fatima Al-Sayed',
        email: 'fatima.alsayed@mail.com',
        phone: '(403) 555-0644',
      },
      address: '88 Cranston Way SE, Calgary',
      service_id: svcA('Snow Removal'),
      submittedAt: hoursAgo(20),
      status: 'submitted',
      notes:
        'Looking for a seasonal snow removal contract for driveway and sidewalk. Corner lot.',
      photos: [
        { id: 'p3', label: 'Driveway', url: null, hue: 200, kind: 'request' },
      ],
      quote: null,
      job_id: null,
      source: 'phone',
    },
    {
      id: 'org_greenleaf_req_4',
      organization_id: 'org_greenleaf',
      client_id: cliA('Westbrook Apartments'),
      prospect: null,
      address: addrA('Westbrook Apartments'),
      service_id: svcA('Hedge & Shrub Trimming'),
      submittedAt: hoursAgo(30),
      status: 'reviewing',
      notes:
        'Cedar hedge along the parking lot is blocking sight lines at the exit.',
      photos: [
        {
          id: 'p4',
          label: 'Parking exit',
          url: null,
          hue: 110,
          kind: 'request',
        },
      ],
      quote: null,
      job_id: null,
      source: 'email',
    },
    {
      id: 'org_greenleaf_req_5',
      organization_id: 'org_greenleaf',
      client_id: null,
      prospect: {
        name: 'Jacob Steinmann',
        email: 'jsteinmann@mail.com',
        phone: '(403) 555-0677',
      },
      address: '1530 Elveden Dr SW, Calgary',
      service_id: svcA('Sod Installation'),
      submittedAt: hoursAgo(52),
      status: 'reviewing',
      notes:
        'Backyard is mostly dirt after a renovation, about 1,100 sq ft. Want sod before the ground freezes.',
      photos: [
        { id: 'p5', label: 'Backyard', url: null, hue: 30, kind: 'request' },
        { id: 'p6', label: 'Grade', url: null, hue: 40, kind: 'request' },
        { id: 'p7', label: 'Access', url: null, hue: 90, kind: 'request' },
      ],
      quote: null,
      job_id: null,
      source: 'web_form',
    },
    {
      id: 'org_greenleaf_req_6',
      organization_id: 'org_greenleaf',
      client_id: cliA('Marcus Chen'),
      prospect: null,
      address: addrA('Marcus Chen'),
      service_id: svcA('Tree Trimming'),
      submittedAt: hoursAgo(76),
      status: 'estimated',
      notes: 'Two spruce trees near the garage need deadwood removed.',
      photos: [
        { id: 'p8', label: 'Spruce', url: null, hue: 140, kind: 'request' },
      ],
      quote: {
        number: 'Q-3104',
        createdAt: hoursAgo(50),
        taxPercent: 5,
        discountCents: 0,
        lines: [
          {
            id: 'l1',
            kind: 'labor',
            description: 'Arborist crew (2 people)',
            quantity: 4,
            unit_price_cents: 9500,
          },
          {
            id: 'l2',
            kind: 'equipment',
            description: 'Chipper rental',
            quantity: 1,
            unit_price_cents: 12000,
          },
          {
            id: 'l3',
            kind: 'materials',
            description: 'Disposal fee',
            quantity: 1,
            unit_price_cents: 4500,
          },
        ],
      },
      job_id: null,
      source: 'client_portal',
    },
    {
      id: 'org_greenleaf_req_7',
      organization_id: 'org_greenleaf',
      client_id: null,
      prospect: {
        name: 'Ruth Nakamura',
        email: 'ruth.nakamura@mail.com',
        phone: '(403) 555-0702',
      },
      address: '27 Mahogany Shores SE, Calgary',
      service_id: svcA('Mulch Installation'),
      submittedAt: hoursAgo(100),
      status: 'estimated',
      notes: 'Front and back beds, roughly 6 yards of cedar mulch.',
      photos: [],
      quote: {
        number: 'Q-3105',
        createdAt: hoursAgo(80),
        taxPercent: 5,
        discountCents: 2500,
        lines: [
          {
            id: 'l1',
            kind: 'labor',
            description: 'Bed prep and install',
            quantity: 5,
            unit_price_cents: 6500,
          },
          {
            id: 'l2',
            kind: 'materials',
            description: 'Cedar mulch (yd³)',
            quantity: 6,
            unit_price_cents: 5800,
          },
          {
            id: 'l3',
            kind: 'materials',
            description: 'Landscape fabric',
            quantity: 2,
            unit_price_cents: 3900,
          },
          {
            id: 'l4',
            kind: 'equipment',
            description: 'Dump trailer',
            quantity: 1,
            unit_price_cents: 7500,
          },
        ],
      },
      job_id: null,
      source: 'web_form',
    },
    {
      id: 'org_greenleaf_req_8',
      organization_id: 'org_greenleaf',
      client_id: cliA('Prairie Oaks Dental'),
      prospect: null,
      address: addrA('Prairie Oaks Dental'),
      service_id: svcA('Snow Removal'),
      submittedAt: hoursAgo(130),
      status: 'approved',
      notes:
        'Seasonal contract for lot and walkways, open by 7:30 AM on clinic days.',
      photos: [],
      quote: {
        number: 'Q-3102',
        createdAt: hoursAgo(120),
        taxPercent: 5,
        discountCents: 0,
        lines: [
          {
            id: 'l1',
            kind: 'labor',
            description: 'Plow + walkway clearing per event',
            quantity: 20,
            unit_price_cents: 14500,
          },
          {
            id: 'l2',
            kind: 'materials',
            description: 'Ice melt (per application)',
            quantity: 20,
            unit_price_cents: 2500,
          },
        ],
      },
      job_id: null,
      source: 'email',
    },
    {
      id: 'org_greenleaf_req_9',
      organization_id: 'org_greenleaf',
      client_id: null,
      prospect: {
        name: 'Kevin Doyle',
        email: 'kdoyle@mail.com',
        phone: '(403) 555-0723',
      },
      address: '3 Evergreen Hts SW, Calgary',
      service_id: svcA('Lawn Mowing'),
      submittedAt: hoursAgo(160),
      status: 'rejected',
      notes: 'Wants weekly mowing in Airdrie.',
      photos: [],
      quote: null,
      job_id: null,
      source: 'web_form',
    },
    {
      id: 'org_greenleaf_req_10',
      organization_id: 'org_greenleaf',
      client_id: cliA('Daniel Okafor'),
      prospect: null,
      address: addrA('Daniel Okafor'),
      service_id: svcA('Lawn Aeration'),
      submittedAt: hoursAgo(200),
      status: 'scheduled',
      notes: 'Aeration plus overseed if possible.',
      photos: [],
      quote: {
        number: 'Q-3099',
        createdAt: hoursAgo(190),
        taxPercent: 5,
        discountCents: 0,
        lines: [
          {
            id: 'l1',
            kind: 'labor',
            description: 'Core aeration',
            quantity: 1,
            unit_price_cents: 12000,
          },
          {
            id: 'l2',
            kind: 'materials',
            description: 'Overseed blend (bag)',
            quantity: 2,
            unit_price_cents: 4200,
          },
        ],
      },
      job_id: scheduledJob?.id ?? null,
      source: 'client_portal',
    },
    {
      id: 'org_greenleaf_req_11',
      organization_id: 'org_greenleaf',
      client_id: cliA('Isabella Rossi'),
      prospect: null,
      address: addrA('Isabella Rossi'),
      service_id: svcA('Fall Cleanup'),
      submittedAt: hoursAgo(300),
      status: 'converted',
      notes: 'Referred by a neighbour. Converted to weekly client.',
      photos: [],
      quote: null,
      job_id: null,
      source: 'phone',
    },
  ]

  const requestsB: Array<ServiceRequest> = [
    {
      id: 'org_northline_req_1',
      organization_id: 'org_northline',
      client_id: null,
      prospect: {
        name: 'Gordon Hale',
        email: 'ghale@mail.com',
        phone: '(780) 555-0300',
      },
      address: '11 Windermere Dr NW, Edmonton',
      service_id: b.services.find((s) => s.name === 'Snow Removal')!.id,
      submittedAt: hoursAgo(8),
      status: 'submitted',
      notes: 'Driveway + sidewalk, need someone reliable this winter.',
      photos: [],
      quote: null,
      job_id: null,
      source: 'web_form',
    },
  ]

  const memberName = (state: { members: Array<Member> }, idx: number) =>
    state.members[idx]?.display_name ?? 'System'
  const completedToday = a.jobs.filter(
    (j) => j.date === today && j.status === 'completed',
  )
  const recentPaid = a.invoices
    .filter((i) => i.payments.length)
    .sort((x, y) => y.payments[0].at.localeCompare(x.payments[0].at))
    .slice(0, 3)
  const clientName = (id: string) =>
    a.clients.find((c) => c.id === id)?.display_name ?? 'Client'

  const activityA: Array<Activity> = [
    {
      id: 'act_a1',
      organization_id: 'org_greenleaf',
      at: hoursAgo(2),
      kind: 'request_submitted',
      text: 'New request from Nathan Brooks: Fall Cleanup',
      actor: 'Web form',
    },
    ...completedToday.slice(0, 3).map<Activity>((j, i) => ({
      id: `act_job_${j.id}`,
      organization_id: 'org_greenleaf',
      at: hoursAgo(0.5 + i * 1.3),
      kind: 'job_completed',
      text: `${j.number} completed at ${clientName(j.client_id)}`,
      actor: a.crews.find((c) => c.id === j.crew_id)?.name ?? 'Crew',
    })),
    {
      id: 'act_a2',
      organization_id: 'org_greenleaf',
      at: hoursAgo(5),
      kind: 'request_submitted',
      text: 'Grace Holloway requested Irrigation Winterization',
      actor: 'Client portal',
    },
    {
      id: 'act_a3',
      organization_id: 'org_greenleaf',
      at: hoursAgo(9),
      kind: 'crew_assigned',
      text: 'Crew C · Maple assigned to 4 jobs tomorrow',
      actor: memberName(a, 2),
    },
    ...recentPaid.map<Activity>((inv, i) => ({
      id: `act_pay_${inv.id}`,
      organization_id: 'org_greenleaf',
      at:
        inv.payments[0].at > new Date().toISOString()
          ? hoursAgo(12 + i)
          : inv.payments[0].at,
      kind: 'invoice_paid',
      text: `${inv.number} paid by ${clientName(inv.client_id)}`,
      actor: 'Payments',
    })),
    {
      id: 'act_a4',
      organization_id: 'org_greenleaf',
      at: hoursAgo(26),
      kind: 'request_approved',
      text: 'Prairie Oaks Dental approved quote Q-3102',
      actor: memberName(a, 1),
    },
    {
      id: 'act_a5',
      organization_id: 'org_greenleaf',
      at: hoursAgo(54),
      kind: 'client_created',
      text: `New client added: ${a.clients[0].display_name}`,
      actor: memberName(a, 1),
    },
    {
      id: 'act_a6',
      organization_id: 'org_greenleaf',
      at: hoursAgo(160),
      kind: 'request_rejected',
      text: 'Request from Kevin Doyle declined (outside service area)',
      actor: memberName(a, 0),
    },
  ]

  const activityB: Array<Activity> = [
    {
      id: 'act_b1',
      organization_id: 'org_northline',
      at: hoursAgo(8),
      kind: 'request_submitted',
      text: 'New request from Gordon Hale: Snow Removal',
      actor: 'Web form',
    },
  ]

  return {
    organizations: [greenleaf, northline],
    activeOrgId: greenleaf.id,
    role: 'owner',
    members: [...a.members, ...b.members],
    crews: [...a.crews, ...b.crews],
    clients: [...a.clients, ...b.clients],
    properties: [...a.properties, ...b.properties],
    services: [...a.services, ...b.services],
    requests: [...requestsA, ...requestsB],
    jobs: [...a.jobs, ...b.jobs],
    invoices: [...a.invoices, ...b.invoices],
    activity: [...activityA, ...activityB],
  }
}
