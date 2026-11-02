/**
 * Company settings kept in `organizations.settings` (jsonb). Shared by the
 * settings tRPC router, the trusted public portal code, and the Settings page,
 * so every reader applies the same defaults. Keys are documented in
 * docs/database/tables/tenancy.md.
 */
import { z } from 'zod'

export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const
export type Weekday = (typeof WEEKDAYS)[number]

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const dayHoursSchema = z
  .object({ closed: z.boolean(), open: time, close: time })
  .refine((d) => d.closed || d.open < d.close, {
    message: 'Closing time must be after opening time',
    path: ['close'],
  })
export type DayHours = z.infer<typeof dayHoursSchema>

export const businessHoursSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, dayHoursSchema])) as Record<
    Weekday,
    typeof dayHoursSchema
  >,
)
export type BusinessHours = z.infer<typeof businessHoursSchema>

export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

/**
 * Public request page colours. `primary` is the top bar, buttons and headings
 * accent; `secondary` the light tint behind the intro and footer; `accent` the
 * highlight on the primary colour (the header button, mission rule).
 */
export const paletteSchema = z.object({
  primary: brandColorSchema,
  secondary: brandColorSchema,
  accent: brandColorSchema,
})
export type PortalPalette = z.infer<typeof paletteSchema>

/** The CRM's own colours: menu-bar green, sage, and lime. */
export const DEFAULT_PALETTE: PortalPalette = {
  primary: '#11301f',
  secondary: '#e7ecdf',
  accent: '#c6ef6a',
}

export const serviceAreasSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(50)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()

/** A website origin: https (or http for localhost), no path. */
export const originSchema = z
  .string()
  .trim()
  .max(200)
  .transform((v, ctx) => {
    try {
      const url = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`)
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
        throw new Error('protocol')
      if (url.username || url.password) throw new Error('credentials')
      return url.origin
    } catch {
      ctx.addIssue({ code: 'custom', message: `${v} isn’t a website address` })
      return z.NEVER
    }
  })

export const embedSchema = z.object({
  /** When false, other sites can't frame the `?embed=true` view. */
  enabled: z.boolean(),
  /** `inline` embeds the form in an iframe; `button` links out to the page. */
  style: z.enum(['inline', 'button']),
  /** Iframe height in pixels. */
  height: z.number().int().min(400).max(2000),
  button_label: z.string().trim().min(1).max(40),
  /** Hide the company intro (mission, hours, areas) inside the iframe. */
  compact: z.boolean(),
  /**
   * Sites allowed to frame the form, as origins (`https://example.com`).
   * Empty allows any site. Enforced with CSP frame-ancestors (src/start.ts).
   */
  allowed_origins: z.array(originSchema).max(20),
})
export type EmbedSettings = z.infer<typeof embedSchema>

export const onlineRequestsSchema = z.object({
  /** Accept requests from the public page. Off blocks submissions server-side. */
  enabled: z.boolean(),
  tagline: optionalText(140),
  mission: optionalText(600),
  about: optionalText(2000),
  show_prices: z.boolean(),
  show_hours: z.boolean(),
  show_service_areas: z.boolean(),
  show_contact: z.boolean(),
  palette: paletteSchema,
  embed: embedSchema,
})
export type OnlineRequestSettings = z.infer<typeof onlineRequestsSchema>

export const DEFAULT_BRAND_COLOR = '#2f7350'

// Open every day, 8 to 5, until the company changes it in Settings → Hours.
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { closed: false, open: '08:00', close: '17:00' },
  tue: { closed: false, open: '08:00', close: '17:00' },
  wed: { closed: false, open: '08:00', close: '17:00' },
  thu: { closed: false, open: '08:00', close: '17:00' },
  fri: { closed: false, open: '08:00', close: '17:00' },
  sat: { closed: false, open: '08:00', close: '17:00' },
  sun: { closed: false, open: '08:00', close: '17:00' },
}

// Enabled by default so portals that existed before this setting keep working.
export const DEFAULT_ONLINE_REQUESTS: OnlineRequestSettings = {
  enabled: true,
  tagline: null,
  mission: null,
  about: null,
  show_prices: true,
  show_hours: true,
  show_service_areas: true,
  show_contact: true,
  palette: DEFAULT_PALETTE,
  embed: {
    enabled: true,
    style: 'inline',
    height: 900,
    button_label: 'Request a quote',
    compact: false,
    allowed_origins: [],
  },
}

export type CompanySettings = {
  brand_color: string
  business_hours: BusinessHours
  service_areas: Array<string>
  online_requests: OnlineRequestSettings
}

/** The writable subset; each key is validated on its own. */
export const companySettingsPatchSchema = z.object({
  brand_color: brandColorSchema.optional(),
  business_hours: businessHoursSchema.optional(),
  service_areas: serviceAreasSchema.optional(),
  online_requests: onlineRequestsSchema
    .omit({ embed: true })
    .extend({ embed: embedSchema.partial() })
    .partial()
    .optional(),
})
export type CompanySettingsPatch = z.input<typeof companySettingsPatchSchema>

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}

/** Takes one field from stored JSON, falling back when it is missing or invalid. */
function pick<T>(schema: z.ZodType, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value)
  return parsed.success ? (parsed.data as T) : fallback
}

/** Reads stored settings field by field, so one bad key never hides the rest. */
export function parseCompanySettings(raw: unknown): CompanySettings {
  const s = asRecord(raw)
  const hours = asRecord(s.business_hours)
  const online = asRecord(s.online_requests)
  const embed = asRecord(online.embed)
  const d = DEFAULT_ONLINE_REQUESTS
  const field = <TKey extends keyof OnlineRequestSettings>(key: TKey) =>
    pick(onlineRequestsSchema.shape[key], online[key], d[key])
  const embedField = <TKey extends keyof EmbedSettings>(key: TKey) =>
    pick(embedSchema.shape[key], embed[key], d.embed[key])

  return {
    brand_color: pick(brandColorSchema, s.brand_color, DEFAULT_BRAND_COLOR),
    business_hours: Object.fromEntries(
      WEEKDAYS.map((day) => [
        day,
        pick(dayHoursSchema, hours[day], DEFAULT_BUSINESS_HOURS[day]),
      ]),
    ) as BusinessHours,
    service_areas: pick(serviceAreasSchema, s.service_areas, []),
    online_requests: {
      enabled: field('enabled'),
      tagline: field('tagline'),
      mission: field('mission'),
      about: field('about'),
      show_prices: field('show_prices'),
      show_hours: field('show_hours'),
      show_service_areas: field('show_service_areas'),
      show_contact: field('show_contact'),
      palette: field('palette'),
      embed: {
        enabled: embedField('enabled'),
        style: embedField('style'),
        height: embedField('height'),
        button_label: embedField('button_label'),
        compact: embedField('compact'),
        allowed_origins: embedField('allowed_origins'),
      },
    },
  }
}

/**
 * Merges a validated patch into the stored JSON. Keys this module doesn't own
 * (`workers_see_prices`, document prefixes, …) are kept as they are.
 */
export function mergeCompanySettings(
  raw: unknown,
  patch: z.output<typeof companySettingsPatchSchema>,
): Record<string, unknown> {
  const current = parseCompanySettings(raw)
  const next: Record<string, unknown> = { ...asRecord(raw) }
  if (patch.brand_color !== undefined) next.brand_color = patch.brand_color
  if (patch.business_hours !== undefined)
    next.business_hours = patch.business_hours
  if (patch.service_areas !== undefined)
    next.service_areas = [...new Set(patch.service_areas)]
  if (patch.online_requests !== undefined) {
    const { embed, ...rest } = patch.online_requests
    next.online_requests = {
      ...current.online_requests,
      ...rest,
      embed: { ...current.online_requests.embed, ...embed },
    }
  }
  return next
}
