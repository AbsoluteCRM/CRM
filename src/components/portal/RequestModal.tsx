import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'

import { money } from '#/components/crm/format'
import {
  Alert,
  Btn,
  Field,
  Modal,
  TextArea,
  TextInput,
} from '#/components/crm/ui'
import { useTRPC } from '#/integrations/trpc/react'
import type { PortalService } from '#/server/trusted/portal'

export const UNIT_LABEL: Record<string, string> = {
  monthly: 'per month',
  visit: 'per visit',
  hour: 'per hour',
  sqft: 'per sq ft',
  linear_ft: 'per linear ft',
  yard: 'per yard',
  bag: 'per bag',
}

const EMPTY = { name: '', email: '', phone: '', address: '', notes: '' }

export default function RequestModal({
  orgSlug,
  orgName,
  service,
  onClose,
}: {
  orgSlug: string
  orgName: string
  service: PortalService | null
  onClose: () => void
}) {
  const trpc = useTRPC()
  const [form, setForm] = useState(EMPTY)
  const [website, setWebsite] = useState('')
  const [touched, setTouched] = useState(false)
  const submit = useMutation(trpc.portal.submit.mutationOptions())

  const close = () => {
    setForm(EMPTY)
    setWebsite('')
    setTouched(false)
    submit.reset()
    onClose()
  }

  if (!service) return null

  const emailOk = /^\S+@\S+\.\S+$/.test(form.email.trim())
  const valid = form.name.trim() !== '' && emailOk && form.address.trim() !== ''

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || submit.isPending) return
    submit.mutate({
      orgSlug,
      serviceId: service.id,
      name: form.name,
      email: form.email,
      phone: form.phone.trim() || null,
      address: form.address,
      notes: form.notes.trim() || null,
      website,
    })
  }

  if (submit.isSuccess) {
    return (
      <Modal
        open
        onClose={close}
        title="Request sent"
        footer={<Btn onClick={close}>Done</Btn>}
      >
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="size-10 text-(--leaf-700)" />
          <p className="text-sm text-(--ink-2)">
            Thanks, {form.name.trim()}. {orgName} received your request for{' '}
            <strong>{service.name}</strong> and will be in touch at{' '}
            {form.email.trim()}.
          </p>
        </div>
      </Modal>
    )
  }

  const invalid = (bad: boolean) =>
    touched && bad ? { 'aria-invalid': true } : {}

  return (
    <Modal
      open
      onClose={close}
      title={`Request ${service.name}`}
      subtitle={`From ${money(service.default_price_cents)} ${UNIT_LABEL[service.unit] ?? ''}`}
      footer={
        <>
          <Btn variant="ghost" onClick={close}>
            Cancel
          </Btn>
          <Btn
            type="submit"
            form="portal-request-form"
            disabled={submit.isPending}
          >
            {submit.isPending ? 'Sending…' : 'Send request'}
          </Btn>
        </>
      }
    >
      <form
        id="portal-request-form"
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {submit.error && (
          <Alert tone="danger" title="We couldn't send your request">
            {submit.error.message}
          </Alert>
        )}
        <Field label="Your name" htmlFor="pr-name">
          <TextInput
            id="pr-name"
            autoComplete="name"
            maxLength={200}
            value={form.name}
            onChange={set('name')}
            {...invalid(form.name.trim() === '')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Email"
            htmlFor="pr-email"
            hint={touched && !emailOk ? 'Enter a valid email' : undefined}
          >
            <TextInput
              id="pr-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={form.email}
              onChange={set('email')}
              {...invalid(!emailOk)}
            />
          </Field>
          <Field label="Phone (optional)" htmlFor="pr-phone">
            <TextInput
              id="pr-phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              value={form.phone}
              onChange={set('phone')}
            />
          </Field>
        </div>
        <Field label="Service address" htmlFor="pr-address">
          <TextInput
            id="pr-address"
            autoComplete="street-address"
            maxLength={500}
            value={form.address}
            onChange={set('address')}
            {...invalid(form.address.trim() === '')}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="pr-notes">
          <TextArea
            id="pr-notes"
            maxLength={4000}
            placeholder="Gate codes, pets, anything we should know"
            value={form.notes}
            onChange={set('notes')}
          />
        </Field>
        <div
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        >
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              maxLength={200}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>
      </form>
    </Modal>
  )
}
