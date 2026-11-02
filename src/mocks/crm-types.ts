/**
 * Types for the in-memory demo store (src/mocks/crm-store.ts). See
 * src/mocks/README.md for which live table replaces each one.
 *
 * Field names follow docs/database where a table already exists
 * (`organization_id`, `*_cents` money, `client_status`, `org_role`, ...).
 * A few UI concepts don't have a table yet (service requests, crew time off,
 * service seasons); those are marked below so they can be mapped when the
 * tRPC procedures land.
 */

import type { OrgRole } from '#/integrations/organization/permissions'
import type { Frequency, Service } from '#/integrations/services/types'

export type { OrgRole } from '#/integrations/organization/permissions'
export type {
  Frequency,
  Service,
  ServiceUnit,
} from '#/integrations/services/types'

export type ID = string

export type Plan = 'starter' | 'professional' | 'enterprise'
export type BillingCycle = 'monthly' | 'annual'

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface DayHours {
  open: string // 'HH:MM'
  close: string
  closed: boolean
}

export interface Organization {
  id: ID
  name: string
  slug: string
  timezone: string
  currency: string
  email: string
  phone: string
  address_line1: string
  city: string
  region: string
  postal_code: string
  serviceAreas: Array<string>
  teamSize: string
  businessHours: Record<Weekday, DayHours>
  brandColor: string
  logoDataUrl: string | null
  plan: Plan
  billingCycle: BillingCycle
  trialEndsAt: string // ISO date
  createdAt: string
}

export type MemberStatus = 'invited' | 'active' | 'disabled'

/** No table yet: crew time off. */
export interface TimeOff {
  id: ID
  kind: 'vacation' | 'sick' | 'personal'
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD inclusive
  note?: string
}

export interface Member {
  id: ID
  organization_id: ID
  display_name: string
  email: string
  phone: string
  role: OrgRole
  status: MemberStatus
  title: string
  certifications: Array<string>
  vehicle: string | null
  workDays: Array<Weekday>
  timeOff: Array<TimeOff>
  rating: number // 0-5
  hourlyRateCents: number
  joinedAt: string
}

export interface Crew {
  id: ID
  organization_id: ID
  name: string
  color: string
  memberIds: Array<ID>
  leadId: ID | null
  vehicle: string | null
}

/** `client_kind`: individual = Residential, company = Commercial. */
export type ClientKind = 'individual' | 'company'
export type ClientStatus = 'lead' | 'active' | 'inactive'

export interface ClientNote {
  id: ID
  at: string // ISO datetime
  author: string
  text: string
}

export interface Client {
  id: ID
  organization_id: ID
  kind: ClientKind
  status: ClientStatus
  display_name: string
  email: string
  phone: string
  createdAt: string
  notes: Array<ClientNote>
}

export interface Property {
  id: ID
  organization_id: ID
  client_id: ID
  label: string
  address_line1: string
  city: string
  region: string
  postal_code: string
  lawnSqft: number
  gateCode: string
  pets: string
  accessNotes: string
  instructions: string
  /** Position on the demo route map, 0-100 on each axis. Replaced by `geography location`. */
  x: number
  y: number
}

/**
 * No table yet: inbound service requests. The closest match is a `client`
 * with status `lead` plus a `quote` (draft → sent → approved/declined → converted).
 */
export type RequestStatus =
  | 'submitted'
  | 'reviewing'
  | 'estimated'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'converted'

export interface QuoteLine {
  id: ID
  kind: 'labor' | 'materials' | 'equipment'
  description: string
  quantity: number
  unit_price_cents: number
}

export interface Quote {
  number: string
  lines: Array<QuoteLine>
  taxPercent: number
  discountCents: number
  createdAt: string
}

export interface Photo {
  id: ID
  label: string
  /** Real uploads become object URLs; seeded photos render as a tinted placeholder. */
  url: string | null
  hue: number
  kind?: 'before' | 'after' | 'request'
}

export interface ServiceRequest {
  id: ID
  organization_id: ID
  client_id: ID | null
  prospect: { name: string; email: string; phone: string } | null
  address: string
  service_id: ID
  submittedAt: string
  status: RequestStatus
  notes: string
  photos: Array<Photo>
  quote: Quote | null
  job_id: ID | null
  source: 'web_form' | 'phone' | 'email' | 'client_portal'
}

/** UI job states from the spec. Map to `visit_status` (+ crew assignment) when wired. */
export type JobStatus =
  'scheduled' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

export interface Job {
  id: ID
  number: string
  organization_id: ID
  client_id: ID
  property_id: ID
  service_ids: Array<ID>
  crew_id: ID | null
  date: string // YYYY-MM-DD
  start: string // HH:MM
  durationMinutes: number
  status: JobStatus
  recurrence: Frequency
  price_cents: number
  notes: string
  completionNotes: string
  photos: Array<Photo>
  invoice_id: ID | null
  request_id: ID | null
}

/** `invoice_status` in billing.md. */
export type InvoiceStatus =
  'draft' | 'sent' | 'partially_paid' | 'paid' | 'void'

export interface Payment {
  id: ID
  amount_cents: number
  method: 'card' | 'cash' | 'cheque' | 'etransfer'
  at: string
}

export interface Invoice {
  id: ID
  number: string
  organization_id: ID
  client_id: ID
  job_ids: Array<ID>
  issuedAt: string // YYYY-MM-DD
  dueAt: string
  total_cents: number
  status: InvoiceStatus
  payments: Array<Payment>
}

export type ActivityKind =
  | 'client_created'
  | 'job_completed'
  | 'job_scheduled'
  | 'request_submitted'
  | 'request_approved'
  | 'request_rejected'
  | 'crew_assigned'
  | 'invoice_paid'
  | 'invoice_sent'
  | 'member_invited'
  | 'settings'

export interface Activity {
  id: ID
  organization_id: ID
  at: string // ISO datetime
  kind: ActivityKind
  text: string
  actor: string
}

export interface CrmState {
  organizations: Array<Organization>
  activeOrgId: ID
  role: OrgRole
  members: Array<Member>
  crews: Array<Crew>
  clients: Array<Client>
  properties: Array<Property>
  services: Array<Service>
  requests: Array<ServiceRequest>
  jobs: Array<Job>
  invoices: Array<Invoice>
  activity: Array<Activity>
}
