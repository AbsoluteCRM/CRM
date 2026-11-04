/**
 * The service shape the services screens work with, mapped from
 * `services` rows by `toService` in ./services.ts.
 */

/** `service_unit` in catalog-tax.md. */
export type ServiceUnit =
  'monthly' | 'hour' | 'visit' | 'sqft' | 'linear_ft' | 'yard' | 'bag'
export type Frequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly'

export interface Service {
  id: string
  organization_id: string
  name: string
  description: string
  unit: ServiceUnit
  default_price_cents: number
  default_duration_minutes: number
  is_active: boolean
  color: string
  equipment: Array<string>
  frequencies: Array<Frequency>
  precipitation_type: 'none' | 'rain' | 'snow' | 'any'
  precipitation_action: 'none' | 'schedule' | 'reschedule'
  /** Seasonal availability, months 1-12 inclusive (wraps over new year). Null = year-round. */
  season: { start: number; end: number } | null
}

/** Whether a service with this season is offered in `month` (1-12). */
export function inSeason(service: Pick<Service, 'season'>, month: number) {
  if (!service.season) return true
  const { start, end } = service.season
  return start <= end
    ? month >= start && month <= end
    : month >= start || month <= end
}
