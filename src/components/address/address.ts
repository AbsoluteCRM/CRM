export type AddressParts = {
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  /** ISO 3166-1 alpha-2, e.g. CA. */
  country: string
}

export const EMPTY_ADDRESS: AddressParts = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'CA',
}

export const COUNTRIES = [
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
]

export const isComplete = (a: AddressParts) =>
  a.line1.trim() !== '' && a.city.trim() !== ''

export const isBlank = (a: AddressParts) =>
  [a.line1, a.line2, a.city, a.region, a.postalCode].every(
    (v) => v.trim() === '',
  )

/** "12 Elm St, Unit 4, Calgary, AB T2X 1A1, Canada" */
export function formatAddress(a: AddressParts) {
  const country = COUNTRIES.find((c) => c.code === a.country)?.name ?? a.country
  return [
    a.line1,
    a.line2,
    a.city,
    [a.region.trim(), a.postalCode.trim()].filter(Boolean).join(' '),
    country,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ')
}

/** The fields of a Geoapify autocomplete result that we read. */
export type GeoapifyResult = {
  place_id?: string
  formatted?: string
  address_line1?: string
  address_line2?: string
  housenumber?: string
  street?: string
  city?: string
  town?: string
  village?: string
  state?: string
  state_code?: string
  postcode?: string
  country_code?: string
}

export function fromGeoapify(r: GeoapifyResult): AddressParts {
  return {
    line1:
      [r.housenumber, r.street].filter(Boolean).join(' ') ||
      r.address_line1 ||
      '',
    line2: '',
    city: r.city ?? r.town ?? r.village ?? '',
    region: r.state_code?.toUpperCase() ?? r.state ?? '',
    postalCode: r.postcode?.toUpperCase() ?? '',
    country: r.country_code?.toUpperCase() ?? '',
  }
}
