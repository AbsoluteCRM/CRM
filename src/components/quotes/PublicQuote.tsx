import { useState } from 'react'
import type { ReactNode } from 'react'
import { Btn, Card, TextArea } from '#/components/crm/ui'
import { MONTHS } from '#/components/crm/format'
import type { PublicQuoteData } from '#/integrations/quotes/public.schemas'

export default function PublicQuote({
  data,
  loading,
  unavailable,
  error,
  busy,
  onRetry,
  onApprove,
  onDecline,
  conversation,
}: {
  data?: PublicQuoteData | null
  loading?: boolean
  unavailable?: boolean
  error?: string | null
  busy?: boolean
  onRetry: () => void
  onApprove: () => Promise<boolean>
  onDecline: (reason: string | null) => Promise<boolean>
  conversation?: ReactNode
}) {
  const [decision, setDecision] = useState<'approve' | 'decline' | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  if (unavailable)
    return (
      <main className="mx-auto max-w-xl p-6">
        <Card className="space-y-3 p-6">
          <h1 className="text-xl font-bold">Quote unavailable</h1>
          <p>
            This link is unavailable or has expired. Ask the office for a
            current quote link.
          </p>
        </Card>
      </main>
    )
  if (loading)
    return (
      <main className="p-6" role="status">
        Loading quote…
      </main>
    )
  if (!data)
    return (
      <main className="space-y-3 p-6">
        <p role="alert">We could not load this quote. Please try again.</p>
        <Btn onClick={onRetry}>Try again</Btn>
      </main>
    )
  const money = (cents: number) =>
    new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: data.currency,
    }).format(cents / 100)
  async function confirm() {
    setPending(true)
    try {
      const ok =
        decision === 'approve'
          ? await onApprove()
          : await onDecline(reason.trim() || null)
      setFailed(!ok)
      if (ok) setDecision(null)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 text-(--ink) sm:p-8">
      <header>
        <p className="text-sm font-semibold text-(--leaf-700)">
          {data.organization_name}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {data.title || 'Your quote'}
        </h1>
        <p className="mt-2 text-sm text-(--ink-3)">
          {data.number} · Prepared for {data.client_name}
        </p>
      </header>
      <Card className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap justify-between gap-3">
          <p className="font-semibold capitalize">{data.status}</p>
          <Btn variant="outline" disabled>
            PDF · Coming soon
          </Btn>
        </div>
        {data.message && <p className="whitespace-pre-wrap">{data.message}</p>}
        <div className="divide-y divide-(--line)">
          {data.lines.map((line) => (
            <article key={line.id} className="space-y-2 py-4">
              <div className="flex justify-between gap-3">
                <h2 className="font-semibold">{line.description}</h2>
                <span className="whitespace-nowrap">
                  {money(line.amount_cents)}
                </span>
              </div>
              <p className="text-sm text-(--ink-3)">
                {line.quantity} × {money(line.unit_price_cents)} ·{' '}
                {
                  {
                    one_time: 'One-time',
                    weekly: 'Weekly',
                    biweekly: 'Every 2 weeks',
                    monthly: 'Monthly',
                  }[line.frequency]
                }{' '}
                ·{' '}
                {line.season_start_month && line.season_end_month
                  ? `${MONTHS[line.season_start_month - 1]} to ${MONTHS[line.season_end_month - 1]}`
                  : 'Year-round'}
              </p>
              <p className="text-sm text-(--ink-3)">
                Tax: {money(line.tax_cents)}
              </p>
              {line.is_optional && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled checked={false} readOnly />
                  Optional extra · Excluded from total · Coming soon
                </label>
              )}
            </article>
          ))}
        </div>
        <dl className="ml-auto max-w-sm space-y-2">
          <div className="flex justify-between gap-4">
            <dt>Subtotal</dt>
            <dd>{money(data.subtotal_cents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Tax</dt>
            <dd>{money(data.tax_cents)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-lg font-bold">
            <dt>Total</dt>
            <dd>{money(data.total_cents)}</dd>
          </div>
        </dl>
        {data.conditions && (
          <section>
            <h2 className="font-semibold">Terms and conditions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {data.conditions}
            </p>
          </section>
        )}
        <p className="text-sm">
          Valid until {data.valid_until || 'the link expires'}.
        </p>
        {error && <p role="alert">{error}</p>}
        {failed && (
          <p role="alert">Your decision was not confirmed. Please try again.</p>
        )}
        {data.status === 'sent' ? (
          <div className="space-y-4">
            {!decision ? (
              <div className="flex flex-wrap gap-2">
                <Btn disabled={busy} onClick={() => setDecision('approve')}>
                  Accept quote
                </Btn>
                <Btn
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDecision('decline')}
                >
                  Decline quote
                </Btn>
              </div>
            ) : (
              <section
                aria-label="Confirm decision"
                className="space-y-3 rounded-xl bg-(--sage) p-4"
              >
                <h2 className="font-semibold">
                  {decision === 'approve'
                    ? 'Accept this quote?'
                    : 'Decline this quote?'}
                </h2>
                {decision === 'approve' ? (
                  <p>
                    Confirm the total of {money(data.total_cents)} and the terms
                    shown above.
                  </p>
                ) : (
                  <>
                    <label htmlFor="decline-reason">Reason (optional)</label>
                    <TextArea
                      id="decline-reason"
                      maxLength={1000}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      disabled={pending}
                    />
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <Btn
                    disabled={pending || busy}
                    onClick={() => void confirm()}
                  >
                    {pending
                      ? 'Confirming…'
                      : decision === 'approve'
                        ? 'Confirm acceptance'
                        : 'Confirm decline'}
                  </Btn>
                  <Btn
                    variant="outline"
                    disabled={pending}
                    onClick={() => setDecision(null)}
                  >
                    Cancel
                  </Btn>
                </div>
              </section>
            )}
          </div>
        ) : (
          <p role="status" className="rounded-xl bg-(--sage) p-4">
            This quote has been {data.status}. You can still message the office
            until this link expires.
          </p>
        )}
      </Card>
      {conversation}
    </main>
  )
}
