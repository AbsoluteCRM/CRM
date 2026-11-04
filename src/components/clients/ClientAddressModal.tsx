import { useState } from 'react'
import { MapPin, Trash2 } from 'lucide-react'

import { Btn, Modal } from '#/components/crm/ui'
import { EMPTY_ADDRESS } from '#/components/portal/AddressAutocomplete'
import AddressFields, {
  addressComplete,
  toClientAddress,
} from './AddressFields'
import type { AddressParts } from '#/components/portal/AddressAutocomplete'
import type {
  ClientAddressInput,
  ClientRow,
} from '#/integrations/clients/clients'

/** The client's saved billing_* address as form boxes. */
export function clientAddressParts(c: ClientRow): AddressParts {
  return {
    line1: c.billing_address_line1 ?? '',
    line2: c.billing_address_line2 ?? '',
    city: c.billing_city ?? '',
    region: c.billing_region ?? '',
    postalCode: c.billing_postal_code ?? '',
    country: '',
    countryCode: c.billing_country ?? 'CA',
  }
}

/** Adds, changes or removes a client's address. */
export default function ClientAddressModal({
  client,
  saving,
  onSave,
  onClose,
}: {
  client: ClientRow
  saving: boolean
  /** Null removes the address. Rejects when the save fails. */
  onSave: (address: ClientAddressInput | null) => Promise<unknown>
  onClose: () => void
}) {
  const existing = Boolean(client.billing_address_line1)
  const [address, setAddress] = useState<AddressParts>(() =>
    existing
      ? clientAddressParts(client)
      : { ...EMPTY_ADDRESS, countryCode: 'CA' },
  )
  const [touched, setTouched] = useState(false)

  const save = async (value: ClientAddressInput | null) => {
    try {
      await onSave(value)
      onClose()
    } catch {
      // The mutation already showed an error; keep the form open to retry.
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit address' : 'Add an address'}
      subtitle={client.display_name}
      width={620}
      footer={
        <>
          {existing && (
            <Btn
              variant="ghost"
              icon={Trash2}
              disabled={saving}
              onClick={() => void save(null)}
              className="mr-auto"
            >
              Remove address
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            icon={MapPin}
            disabled={saving}
            onClick={() => {
              setTouched(true)
              if (addressComplete(address)) void save(toClientAddress(address))
            }}
          >
            Save address
          </Btn>
        </>
      }
    >
      <AddressFields
        idPrefix="client-address"
        value={address}
        onChange={setAddress}
        touched={touched}
      />
    </Modal>
  )
}
