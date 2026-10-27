import { Btn, Field, TextInput } from '#/components/crm/ui'

export interface InvitationDeliveryProps {
  email: string
  inviteLink: string
  delivery: 'sent' | 'failed'
  busy: boolean
  onCopy: () => void
  onRetry: () => void
}

export default function InvitationDelivery(props: InvitationDeliveryProps) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-(--ink-2)" role="status">
        {props.delivery === 'sent'
          ? 'The email provider accepted the invitation for '
          : 'Unable to confirm sending the invitation to '}
        <span className="font-semibold">{props.email}</span>.
        {props.delivery === 'sent'
          ? ' Ask them to check their inbox. You can also share this link.'
          : ' The invitation is saved. Copy this link to share it, or retry sending with a new link.'}
      </p>
      <p className="text-sm text-(--ink-3)">
        Only the latest generated link remains valid. Retrying or sending
        another invitation replaces this link, even if sending fails.
      </p>
      <Field label="Invite link">
        <div className="flex gap-2">
          <TextInput
            aria-label="Invite link"
            readOnly
            value={props.inviteLink}
            onFocus={(event) => event.target.select()}
          />
          <Btn variant="outline" onClick={props.onCopy}>
            Copy
          </Btn>
        </div>
      </Field>
      {props.delivery === 'failed' && (
        <Btn disabled={props.busy} onClick={props.onRetry}>
          {props.busy ? 'Sending…' : 'Retry with new link'}
        </Btn>
      )}
    </div>
  )
}
