import { useState } from 'react'
import { z } from 'zod'
import { Btn, Modal } from '#/components/crm/ui'

export default function SendQuoteDialog({
  open,
  onOpenChange,
  recipient,
  title,
  validUntil,
  lineCount,
  unsaved = false,
  retry = false,
  busy = false,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: string | null
  title: string | null
  validUntil: string | null
  lineCount: number
  unsaved?: boolean
  retry?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => Promise<boolean>
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const issues = [
    !title?.trim() && 'Save a title for this quote.',
    lineCount < 1 && 'Add at least one line item.',
    !validUntil && 'Set a valid-until date.',
    validUntil &&
      new Date(validUntil + 'T23:59:59').getTime() < Date.now() &&
      'Choose a valid-until date that has not passed.',
    !z.email().safeParse(recipient).success &&
      'Add a valid email address to the client.',
    unsaved && 'Save your pending changes before sending.',
  ].filter(Boolean)
  async function confirm() {
    setPending(true)
    try {
      if (await onConfirm()) onOpenChange(false)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy && !pending) onOpenChange(false)
      }}
      title={retry ? 'Send a new quote link?' : 'Send quote?'}
      subtitle="The customer can review this quote, accept or decline, and message your office."
    >
      <div className="space-y-4 text-sm">
        <dl className="space-y-2">
          <div>
            <dt className="font-semibold">Recipient</dt>
            <dd>{recipient || 'No email address'}</dd>
          </div>
          <div>
            <dt className="font-semibold">Quote</dt>
            <dd>{title || 'Untitled quote'}</dd>
          </div>
          <div>
            <dt className="font-semibold">Valid until</dt>
            <dd>{validUntil || 'Not set'}</dd>
          </div>
        </dl>
        <p>
          Optional items are excluded from the total. The customer cannot select
          extras yet.
        </p>
        {retry && (
          <p className="font-semibold">
            The old link stops working. Only the newest email link will work. A
            previous delivery may have reached the customer even if it was not
            confirmed.
          </p>
        )}
        {issues.length > 0 && (
          <ul className="list-inside list-disc" role="alert">
            {issues.map((issue) => (
              <li key={String(issue)}>{issue}</li>
            ))}
          </ul>
        )}
        {error && <p role="alert">{error}</p>}
        {failed && !error && (
          <p role="alert">Delivery was not confirmed. Please try again.</p>
        )}
        <div className="flex justify-end gap-2">
          <Btn
            variant="outline"
            disabled={busy || pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Btn>
          <Btn
            disabled={busy || pending || issues.length > 0}
            onClick={() => void confirm()}
          >
            {busy || pending
              ? 'Sending…'
              : retry
                ? 'Send new link'
                : 'Send quote'}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
