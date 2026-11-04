import { useState } from 'react'
import { MapPin } from 'lucide-react'

import { Btn, Field, Modal, TextArea, TextInput } from '#/components/crm/ui'
import { EMPTY_ADDRESS } from '#/components/portal/AddressAutocomplete'
import AddressFields, { addressComplete, toAddressInput } from './AddressFields'
import type { AddressParts } from '#/components/portal/AddressAutocomplete'
import type {
  PropertyAddressInput,
  PropertyRow,
} from '#/integrations/clients/properties'

export type PropertyValues = {
  /** Only set when the address changed, so untouched geocodes are kept. */
  address?: PropertyAddressInput
  name: string | null
  access_notes: string | null
  lot_size_sqft: number | null
}

function fromProperty(p: PropertyRow | undefined): AddressParts {
  if (!p) return { ...EMPTY_ADDRESS, countryCode: 'CA' }
  return {
    line1: p.address_line1,
    line2: p.address_line2 ?? '',
    city: p.city,
    region: p.region ?? '',
    postalCode: p.postal_code ?? '',
    country: '',
    countryCode: p.country,
    ...(p.latitude !== null &&
      p.longitude !== null && { latitude: p.latitude, longitude: p.longitude }),
  }
}

/** Adds a property to a client, or edits one. */
export default function PropertyModal({
  property,
  clientName,
  saving,
  onSave,
  onClose,
}: {
  property?: PropertyRow
  clientName: string
  saving: boolean
  onSave: (values: PropertyValues) => Promise<unknown>
  onClose: () => void
}) {
  const [address, setAddress] = useState<AddressParts>(() =>
    fromProperty(property),
  )
  const [addressChanged, setAddressChanged] = useState(!property)
  const [name, setName] = useState(property?.name ?? '')
  const [notes, setNotes] = useState(property?.access_notes ?? '')
  const [lot, setLot] = useState(
    property?.lot_size_sqft ? String(property.lot_size_sqft) : '',
  )
  const [touched, setTouched] = useState(false)

  const lotNumber = lot.trim() === '' ? null : Number(lot)
  const lotOk =
    lotNumber === null || (Number.isInteger(lotNumber) && lotNumber > 0)
  const valid = addressComplete(address) && lotOk

  const submit = async () => {
    setTouched(true)
    if (!valid || saving) return
    try {
      await onSave({
        ...(addressChanged && { address: toAddressInput(address) }),
        name: name.trim() || null,
        access_notes: notes.trim() || null,
        lot_size_sqft: lotNumber,
      })
      onClose()
    } catch {
      // The mutation already showed an error; keep the form open to retry.
    }
  }

  const invalid = (bad: boolean) =>
    touched && bad ? { 'aria-invalid': true } : {}
  return (
    <Modal
      open
      onClose={onClose}
      title={property ? 'Edit property' : 'Add a property'}
      subtitle={`Service address for ${clientName}.`}
      width={620}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn icon={MapPin} disabled={saving} onClick={() => void submit()}>
            {property ? 'Save property' : 'Add property'}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <AddressFields
          idPrefix="prop"
          value={address}
          touched={touched}
          onChange={(next) => {
            setAddressChanged(true)
            setAddress(next)
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Property name (optional)"
            htmlFor="prop-name"
            hint="Helps tell properties apart, e.g. Home or Cottage."
          >
            <TextInput
              id="prop-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Lot size (sq ft, optional)"
            htmlFor="prop-lot"
            hint={touched && !lotOk ? 'Enter a whole number' : undefined}
          >
            <TextInput
              id="prop-lot"
              type="number"
              min={1}
              step={1}
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              {...invalid(!lotOk)}
            />
          </Field>
        </div>
        <Field label="Access notes (optional)" htmlFor="prop-notes">
          <TextArea
            id="prop-notes"
            maxLength={2000}
            placeholder="Gate code, pets, where to park, special instructions"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
