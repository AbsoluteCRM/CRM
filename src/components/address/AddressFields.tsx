import { Field, SelectInput, TextInput } from '#/components/crm/ui'
import AddressAutocomplete from './AddressAutocomplete'
import { COUNTRIES } from './address'
import type { AddressParts } from './address'

/** Address search plus street, unit, city, province, postal code and country. */
export default function AddressFields({
  value,
  onChange,
  touched,
  idPrefix,
  autoFill = false,
}: {
  value: AddressParts
  onChange: (next: AddressParts) => void
  /** Flag empty required boxes. */
  touched: boolean
  idPrefix: string
  /** Let the browser fill in the user's own address (customer forms). */
  autoFill?: boolean
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  const set = (key: keyof AddressParts) => (e: { target: { value: string } }) =>
    onChange({ ...value, [key]: e.target.value })
  const invalid = (bad: boolean) =>
    touched && bad ? { 'aria-invalid': true } : {}
  const countries = COUNTRIES.some((c) => c.code === value.country)
    ? COUNTRIES
    : [...COUNTRIES, { code: value.country, name: value.country }]

  const box = (
    key: keyof AddressParts,
    label: string,
    max: number,
    autoComplete: string,
    required = false,
  ) => (
    <Field label={label} htmlFor={id(key)}>
      <TextInput
        id={id(key)}
        autoComplete={autoFill ? autoComplete : 'off'}
        maxLength={max}
        value={value[key]}
        onChange={set(key)}
        {...invalid(required && value[key].trim() === '')}
      />
    </Field>
  )

  return (
    <div className="flex flex-col gap-3">
      <AddressAutocomplete
        // Keep the chosen country when a result has none.
        onSelect={(a) =>
          onChange({ ...a, country: a.country || value.country })
        }
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        {box('line1', 'Street address', 200, 'address-line1', true)}
        {box('line2', 'Unit (optional)', 100, 'address-line2')}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {box('city', 'City', 100, 'address-level2', true)}
        {box('region', 'Province / state', 60, 'address-level1')}
        {box('postalCode', 'Postal code', 20, 'postal-code')}
      </div>
      <Field label="Country" htmlFor={id('country')}>
        <SelectInput
          id={id('country')}
          autoComplete={autoFill ? 'country' : 'off'}
          value={value.country}
          onChange={set('country')}
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
