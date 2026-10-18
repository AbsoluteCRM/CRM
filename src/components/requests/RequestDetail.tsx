import { useState } from 'react'
import { FilePlus2, Files } from 'lucide-react'
import type { inferRouterOutputs } from '@trpc/server'

import { fmtDate, money, relativeTime } from '#/components/crm/format'
import {
  Alert,
  Btn,
  Card,
  CardHeader,
  EmptyState,
  Field,
  KeyValue,
  StatusBadge,
  TextArea,
} from '#/components/crm/ui'
import type { TRPCRouter } from '#/integrations/trpc/router'

type Outputs = inferRouterOutputs<TRPCRouter>
type RequestRow = Outputs['requests']['list'][number]
type ServiceRow = Outputs['services']['list'][number]
export type QuoteSummary = Outputs['quotes']['listForRequest'][number]

export default function RequestDetail({
  request,
  service,
  quotes,
  busy = false,
  error,
  onSaveInfoNeeded,
  onCreateDraft,
  onOpenQuote,
}: {
  request: RequestRow
  service: ServiceRow | undefined
  quotes: Array<QuoteSummary>
  busy?: boolean
  error?: string | null
  onSaveInfoNeeded: (note: string | null) => Promise<boolean>
  onCreateDraft: (copyFromQuoteId: string | null) => Promise<boolean>
  onOpenQuote: (quoteId: string) => void
}) {
  const [note, setNote] = useState(request.info_needed ?? '')
  const latest = quotes.at(0)
  const hasDraft = quotes.some((q) => q.status === 'draft')
  const closed = request.status === 'converted' || request.status === 'rejected'

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        {error && (
          <Alert tone="danger" title="That didn't work">
            {error}
          </Alert>
        )}
        <Card>
          <CardHeader
            title="Quote revisions"
            subtitle="A new revision replaces the previous one once it is sent."
            action={
              !closed && !hasDraft ? (
                <Btn
                  icon={FilePlus2}
                  disabled={busy}
                  onClick={() => void onCreateDraft(latest?.id ?? null)}
                >
                  {latest ? 'New revision' : 'Build quote'}
                </Btn>
              ) : undefined
            }
          />
          {quotes.length === 0 ? (
            <EmptyState
              icon={Files}
              title="No quote yet"
              body="Build a quote from this request. Client details are copied from the request."
            />
          ) : (
            <ul className="divide-y divide-(--line)">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <button
                    type="button"
                    onClick={() => onOpenQuote(quote.id)}
                    className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left hover:bg-(--cream)"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        Revision {quote.revision} · {quote.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-(--ink-3)">
                        {quote.number} · updated{' '}
                        {relativeTime(quote.updated_at)}
                        {quote.valid_until &&
                          ` · valid until ${fmtDate(quote.valid_until)}`}
                      </span>
                    </span>
                    <span className="text-sm font-semibold">
                      {money(quote.total_cents ?? 0, true)}
                    </span>
                    <StatusBadge status={quote.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Information needed"
            subtitle="Internal note: what to ask the client, such as square footage or number of properties."
          />
          <form
            className="grid gap-3 p-5 pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              void onSaveInfoNeeded(note.trim() || null)
            }}
          >
            <Field label="Note" htmlFor="info-needed">
              <TextArea
                id="info-needed"
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div>
              <Btn
                type="submit"
                variant="outline"
                disabled={busy || note.trim() === (request.info_needed ?? '')}
              >
                Save note
              </Btn>
            </div>
          </form>
        </Card>
      </div>

      <Card className="h-fit p-5">
        <div className="mb-4 flex items-center gap-2">
          <StatusBadge status={request.status} />
          <span className="text-xs text-(--ink-3)">
            submitted {relativeTime(request.submitted_at)}
          </span>
        </div>
        <dl className="grid gap-4">
          <KeyValue label="Customer">{request.contact_name}</KeyValue>
          <KeyValue label="Email">{request.contact_email}</KeyValue>
          <KeyValue label="Phone">{request.contact_phone}</KeyValue>
          <KeyValue label="Address">{request.address}</KeyValue>
          <KeyValue label="Service">
            {service?.name ?? 'Service unavailable'}
          </KeyValue>
          <KeyValue label="Notes">
            {request.notes || 'No notes provided.'}
          </KeyValue>
        </dl>
      </Card>
    </div>
  )
}
