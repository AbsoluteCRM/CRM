import { useId, useRef, useState } from 'react'
import { Btn, Card, CardHeader, TextArea } from '#/components/crm/ui'
import type { QuoteMessage } from '#/integrations/quotes/public.schemas'

export type QuoteConversationProps = {
  messages: Array<QuoteMessage>
  loading?: boolean
  error?: string | null
  disabled?: boolean
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => Promise<void>
  onRetry?: () => void
  onSend: (input: { body: string; clientMessageId: string }) => Promise<boolean>
}

// Mount with key={organizationId + quoteId}, or key={token}, to isolate drafts.
export default function QuoteConversation({
  messages,
  loading,
  error,
  disabled,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onRetry,
  onSend,
}: QuoteConversationProps) {
  const composeId = useId()
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const attempt = useRef<{ body: string; clientMessageId: string } | null>(null)
  const history = useRef<HTMLDivElement>(null)
  async function send() {
    const text = body.trim()
    if (!text || pending || disabled) return
    if (attempt.current?.body !== text)
      attempt.current = { body: text, clientMessageId: crypto.randomUUID() }
    setPending(true)
    try {
      if (await onSend(attempt.current)) {
        setBody('')
        attempt.current = null
        setFailed(false)
      } else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  async function older() {
    const element = history.current
    const height = element?.scrollHeight ?? 0
    const top = element?.scrollTop ?? 0
    await onLoadOlder?.()
    requestAnimationFrame(() => {
      if (element) element.scrollTop = top + element.scrollHeight - height
    })
  }
  const unique = [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
  return (
    <Card>
      <CardHeader
        title="Conversation"
        subtitle="Messages are shared with the office and stay available until this link expires."
      />
      <div className="space-y-4 p-5">
        {loading ? (
          <p role="status">Loading messages…</p>
        ) : (
          <div
            ref={history}
            className="max-h-96 space-y-4 overflow-y-auto"
            aria-label="Quote messages"
          >
            {hasOlder && (
              <Btn
                variant="outline"
                disabled={loadingOlder}
                onClick={() => void older()}
              >
                {loadingOlder ? 'Loading…' : 'Load older messages'}
              </Btn>
            )}
            {unique.length === 0 && (
              <p className="text-sm text-(--ink-3)">
                No messages yet. Ask a question about this quote.
              </p>
            )}
            {unique.map((message) => (
              <article key={message.id} className="rounded-xl bg-(--sage) p-3">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-(--ink-3)">
                  <strong>
                    {message.sender_kind === 'staff' ? 'Team' : 'Customer'}
                  </strong>
                  <time dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleString()}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {message.body}
                </p>
              </article>
            ))}
          </div>
        )}
        {error && (
          <div role="alert">
            <p>{error}</p>
            {onRetry && (
              <Btn variant="outline" onClick={onRetry}>
                Retry messages
              </Btn>
            )}
          </div>
        )}
        {failed && (
          <p role="alert">
            Message was not confirmed. Your text is saved here; try sending
            again.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-semibold" htmlFor={composeId}>
            Message
          </label>
          <TextArea
            id={composeId}
            value={body}
            maxLength={4000}
            disabled={disabled || loading || pending}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a message…"
          />
          <Btn
            type="submit"
            disabled={disabled || loading || pending || !body.trim()}
          >
            {pending ? 'Sending…' : failed ? 'Retry send' : 'Send message'}
          </Btn>
        </form>
      </div>
    </Card>
  )
}
