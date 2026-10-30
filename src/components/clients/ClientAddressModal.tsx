import { useState } from 'react'
import { MapPin, Trash2 } from 'lucide-react'

import AddressFields from '#/components/address/AddressFields'
import { EMPTY_ADDRESS, isComplete } from '#/components/address/address'
import { Btn, Modal } from '#/components/crm/ui'
import {
  clientAddressParts,
  toClientAddress,
} from '#/integrations/clients/clients'
import type {
  ClientAddressInput,
  ClientRow,
} from '#/integrations/clients/clients'

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
  const [address, setAddress] = useState(() =>
    existing ? clientAddressParts(client) : EMPTY_ADDRESS,
  )
  const [touched, setTouched] = useState(false)

  const save = (value: ClientAddressInput | null) =>
    onSave(value).then(onClose, () => {
      // The mutation already showed the error; keep the form open.
    })

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
              if (isComplete(address)) void save(toClientAddress(address))
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
