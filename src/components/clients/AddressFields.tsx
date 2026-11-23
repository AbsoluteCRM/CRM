import { Field, SelectInput, TextInput } from '#/components/crm/ui'
import AddressAutocomplete from '#/components/portal/AddressAutocomplete'
import type { AddressParts } from '#/components/portal/AddressAutocomplete'
import type { ClientAddressInput } from '#/integrations/clients/clients'
import type { PropertyAddressInput } from '#/integrations/clients/properties'

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
]

export const addressComplete = (a: AddressParts) =>
  a.line1.trim() !== '' && a.city.trim() !== ''

/** True when nothing has been typed or picked yet. */
export const addressBlank = (a: AddressParts) =>
  [a.line1, a.line2, a.city, a.region, a.postalCode].every(
    (v) => v.trim() === '',
  )

/** The boxes as the properties procedures take them. */
export function toAddressInput(a: AddressParts): PropertyAddressInput {
  const located = a.latitude !== undefined && a.longitude !== undefined
  return {
    address_line1: a.line1,
    address_line2: a.line2,
    city: a.city,
    region: a.region,
    postal_code: a.postalCode,
    country: a.countryCode,
    ...(located && { latitude: a.latitude, longitude: a.longitude }),
  }
}

/** The boxes as the clients procedures take them (billing_* columns). */
export function toClientAddress(a: AddressParts): ClientAddressInput {
  return {
    address_line1: a.line1,
    address_line2: a.line2,
    city: a.city,
    region: a.region,
    postal_code: a.postalCode,
    country: a.countryCode,
  }
}

/**
 * Address search plus street, unit, city, province, postal code and country.
 * Typing in a box drops the coordinates from a picked suggestion, since they
 * may no longer match.
 */
export default function AddressFields({
  value,
  onChange,
  touched,
  idPrefix,
}: {
  value: AddressParts
  onChange: (next: AddressParts) => void
  /** Show which required boxes are empty. */
  touched: boolean
  /** Keeps ids unique when two forms are on one page. */
  idPrefix: string
}) {
  const setPart =
    (key: keyof AddressParts) => (e: { target: { value: string } }) =>
      onChange({
        ...value,
        [key]: e.target.value,
        latitude: undefined,
        longitude: undefined,
      })

  // Keep the current country when the result has none we can store.
  const pick = (a: AddressParts) =>
    onChange({
      ...a,
      countryCode: /^[A-Z]{2}$/.test(a.countryCode)
        ? a.countryCode
        : value.countryCode,
    })

  const invalid = (bad: boolean) =>
    touched && bad ? { 'aria-invalid': true } : {}
  const id = (name: string) => `${idPrefix}-${name}`
  const countries = COUNTRIES.some((c) => c.code === value.countryCode)
    ? COUNTRIES
    : [...COUNTRIES, { code: value.countryCode, name: value.countryCode }]

  return (
    <div className="flex flex-col gap-3">
      <AddressAutocomplete onSelect={pick} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field label="Street address" htmlFor={id('line1')}>
          <TextInput
            id={id('line1')}
            autoComplete="off"
            maxLength={200}
            value={value.line1}
            onChange={setPart('line1')}
            {...invalid(value.line1.trim() === '')}
          />
        </Field>
        <Field label="Unit (optional)" htmlFor={id('line2')}>
          <TextInput
            id={id('line2')}
            autoComplete="off"
            maxLength={100}
            value={value.line2}
            onChange={setPart('line2')}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="City" htmlFor={id('city')}>
          <TextInput
            id={id('city')}
            autoComplete="off"
            maxLength={100}
            value={value.city}
            onChange={setPart('city')}
            {...invalid(value.city.trim() === '')}
          />
        </Field>
        <Field label="Province / state" htmlFor={id('region')}>
          <TextInput
            id={id('region')}
            autoComplete="off"
            maxLength={60}
            value={value.region}
            onChange={setPart('region')}
          />
        </Field>
        <Field label="Postal code" htmlFor={id('postal')}>
          <TextInput
            id={id('postal')}
            autoComplete="off"
            maxLength={20}
            value={value.postalCode}
            onChange={setPart('postalCode')}
          />
        </Field>
      </div>
      <Field label="Country" htmlFor={id('country')}>
        <SelectInput
          id={id('country')}
          value={value.countryCode}
          onChange={setPart('countryCode')}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      </Field>
    </div>
  )
}
