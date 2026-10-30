import { useState } from 'react'
import {
  CalendarClock,
  CircleX,
  FileText,
  Repeat,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'

import { MONTHS, fmtDate } from '#/components/crm/format'
import { Alert, Badge, Btn, Card, Field, TextArea } from '#/components/crm/ui'
import { cn } from '#/lib/utils'
import type { LinkedQuote } from '#/server/trusted/quote-links'

const FREQUENCY: Record<LinkedQuote['lines'][number]['frequency'], string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

function months(line: LinkedQuote['lines'][number]) {
  if (line.season_start_month === null || line.season_end_month === null)
    return null
  return `${MONTHS[line.season_start_month - 1]} to ${MONTHS[line.season_end_month - 1]}`
}

/**
 * What a customer sees at /q/$token: the estimate, optional extras to pick,
 * and approve or decline. No account is needed; the link is the credential.
 */
export default function QuoteLinkView({
  quote,
  busy = false,
  error,
  onApprove,
  onDecline,
}: {
  quote: LinkedQuote
  busy?: boolean
  error?: string | null
  onApprove: (selectedOptionalLineIds: Array<string>) => Promise<boolean>
  onDecline: (reason: string | null) => Promise<boolean>
}) {
  const money = (cents: number) =>
    new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: quote.currency,
    }).format(cents / 100)
  const open = quote.status === 'sent'
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        quote.lines
          .filter((l) => l.is_optional && l.is_selected)
          .map((l) => l.id),
      ),
  )
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  const counts = (l: LinkedQuote['lines'][number]) =>
    !l.is_optional || (open ? selected.has(l.id) : l.is_selected)
  const subtotal = open
    ? quote.lines.filter(counts).reduce((s, l) => s + l.amount_cents, 0)
    : quote.subtotal_cents
  const tax = open
    ? quote.lines.filter(counts).reduce((s, l) => s + l.tax_cents, 0)
    : quote.tax_cents
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="min-h-svh bg-(--cream) text-(--ink)">
      <header className="relative overflow-hidden bg-(--leaf-900) text-(--cream)">
        <div
          className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-6 py-10">
          <p className="text-[11px] font-bold tracking-[0.18em] text-(--lime) uppercase">
            Estimate from {quote.organization_name}
          </p>
          <h1 className="crm-display mt-2 text-3xl font-semibold sm:text-4xl">
            {quote.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-(--cream)/75">
            <span className="flex items-center gap-1.5">
              <FileText className="size-4" /> {quote.number}
            </span>
            {quote.valid_until && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-4" /> Valid until{' '}
                {fmtDate(quote.valid_until, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-8">
        {quote.status === 'approved' && (
          <Alert tone="info" title="You approved this estimate">
            Thank you{quote.client_name ? `, ${quote.client_name}` : ''}!{' '}
            {quote.organization_name} will be in touch to schedule the work.
          </Alert>
        )}
        {quote.status === 'declined' && (
          <Alert tone="warning" title="You declined this estimate">
            {quote.organization_name} has been told. Reach out to them if you
            change your mind.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" title="That didn’t go through">
            {error}
          </Alert>
        )}

        {(quote.client_name || quote.message) && (
          <Card className="p-6">
            {quote.client_name && (
              <p className="font-semibold">Hi {quote.client_name},</p>
            )}
            {quote.message && (
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-(--ink-2)">
                {quote.message}
              </p>
            )}
          </Card>
        )}

        <Card className="overflow-hidden">
          <ul className="divide-y divide-(--line)">
            {quote.lines.map((l) => {
              const active = counts(l)
              const season = months(l)
              return (
                <li
                  key={l.id}
                  className={cn(
                    'flex items-start gap-3 px-5 py-4',
                    l.is_optional && !active && 'opacity-60',
                  )}
                >
                  {l.is_optional && open && (
                    <input
                      type="checkbox"
                      className="mt-1 size-4 cursor-pointer accent-(--leaf-700)"
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      aria-label={`Include ${l.description}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {l.description}
                      {l.is_optional && (
                        <Badge tone="lime" className="ml-2 align-middle">
                          Optional
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-(--ink-3)">
                      <span>
                        {l.quantity} × {money(l.unit_price_cents)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat className="size-3" /> {FREQUENCY[l.frequency]}
                      </span>
                      {season && <span>{season}</span>}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {money(l.amount_cents)}
                  </p>
                </li>
              )
            })}
          </ul>
          <dl className="space-y-1.5 border-t border-(--line) bg-(--cream)/60 px-5 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-(--ink-2)">Subtotal</dt>
              <dd className="tabular-nums">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-(--ink-2)">Tax</dt>
              <dd className="tabular-nums">{money(tax)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(subtotal + tax)}</dd>
            </div>
          </dl>
        </Card>

        {quote.conditions && (
          <Card className="p-5">
            <p className="text-sm font-bold">Conditions</p>
            <p className="mt-1 text-sm whitespace-pre-line text-(--ink-2)">
              {quote.conditions}
            </p>
          </Card>
        )}

        {open &&
          (declining ? (
            <Card className="p-5">
              <Field
                label="Anything you’d like them to know? (optional)"
                htmlFor="decline-reason"
              >
                <TextArea
                  id="decline-reason"
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="For example, the timing doesn’t work or the price is too high."
                />
              </Field>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Btn
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDeclining(false)}
                >
                  Back
                </Btn>
                <Btn
                  variant="danger"
                  icon={CircleX}
                  disabled={busy}
                  onClick={() => void onDecline(reason.trim() || null)}
                >
                  Decline estimate
                </Btn>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn
                variant="outline"
                size="lg"
                icon={ThumbsDown}
                disabled={busy}
                onClick={() => setDeclining(true)}
              >
                Decline
              </Btn>
              <Btn
                size="lg"
                icon={busy ? undefined : ThumbsUp}
                disabled={busy}
                onClick={() => void onApprove([...selected])}
              >
                {busy ? 'Saving…' : `Approve ${money(subtotal + tax)}`}
              </Btn>
            </div>
          ))}

        <p className="text-center text-xs text-(--ink-3)">
          Questions? Reply to the email this link came in.
        </p>
      </main>
    </div>
  )
}
