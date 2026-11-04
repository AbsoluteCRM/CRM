import { useState } from 'react'
import {
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { FormEvent } from 'react'
import type { inferRouterOutputs } from '@trpc/server'

import { MONTHS, fmtDate, money } from '#/components/crm/format'
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHeader,
  CheckPill,
  EmptyState,
  Field,
  IconBtn,
  SelectInput,
  StatusBadge,
  TextArea,
  TextInput,
  Toggle,
} from '#/components/crm/ui'
import type { TRPCRouter } from '#/integrations/trpc/router'

type Outputs = inferRouterOutputs<TRPCRouter>
export type QuoteData = Outputs['quotes']['get']
export type QuoteLine = QuoteData['lines'][number]
export type TaxRate = Outputs['quotes']['taxRates'][number]
type ServiceRow = Outputs['services']['list'][number]

export type DetailsInput = {
  title: string
  message: string | null
  conditions: string | null
  validUntil: string | null
}

export type LineInput = {
  lineId: string | null
  serviceId: string | null
  description: string
  quantity: number
  unitPriceCents: number
  isOptional: boolean
  frequency: Frequency
  seasonStartMonth: number | null
  seasonEndMonth: number | null
  taxRateIds: Array<string>
}

type Frequency = QuoteLine['frequency']

const FREQUENCY_LABELS: Record<Frequency, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

function activeMonthsText(line: {
  season_start_month: number | null
  season_end_month: number | null
}) {
  if (line.season_start_month === null || line.season_end_month === null) {
    return 'Year-round'
  }
  return `${MONTHS[line.season_start_month - 1]} to ${MONTHS[line.season_end_month - 1]}`
}

const dollars = (cents: number) => (cents / 100).toFixed(2)

export default function QuoteEditor({
  data,
  taxRates,
  services,
  busy = false,
  error,
  onSaveDetails,
  onSaveLine,
  onDeleteLine,
  onPullBack,
  onSend,
  onRetryDelivery,
}: {
  data: QuoteData
  taxRates: Array<TaxRate>
  services: Array<ServiceRow>
  busy?: boolean
  error?: string | null
  onSaveDetails: (input: DetailsInput) => Promise<boolean>
  onSaveLine: (input: LineInput) => Promise<boolean>
  onDeleteLine: (lineId: string) => Promise<boolean>
  onPullBack: () => Promise<boolean>
  onSend: () => Promise<boolean>
  onRetryDelivery: () => Promise<boolean>
}) {
  const { quote, lines, delivery, recipient } = data
  const editable = quote.status === 'draft'
  // 'new' adds a line, a line id edits that line.
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        {error && (
          <Alert tone="danger" title="That didn't save">
            {error}
          </Alert>
        )}
        {!editable && (
          <Alert
            tone="info"
            title={
              quote.status === 'sent'
                ? 'This revision has been sent and is read-only'
                : 'This revision is read-only'
            }
            action={
              quote.status === 'sent' ? (
                <Btn
                  variant="outline"
                  icon={Undo2}
                  disabled={busy}
                  onClick={() => void onPullBack()}
                >
                  Pull back to draft
                </Btn>
              ) : undefined
            }
          >
            {quote.status === 'sent'
              ? 'Pulling it back makes the client link stop working so you can edit it.'
              : 'Start a new revision from the request to change the quote.'}
          </Alert>
        )}

        <DetailsCard
          // Remount when the saved values change so the form resets.
          key={`${quote.id}:${quote.updated_at}`}
          quote={quote}
          editable={editable}
          busy={busy}
          onSave={onSaveDetails}
        />

        <Card>
          <CardHeader
            title="Line items"
            subtitle="Optional lines count toward the total only when the client selects them."
            action={
              editable && editing === null ? (
                <Btn
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  onClick={() => setEditing('new')}
                >
                  Add line
                </Btn>
              ) : undefined
            }
          />
          {lines.length === 0 && editing !== 'new' ? (
            <EmptyState
              title="No line items yet"
              body={
                editable
                  ? 'Add at least one line before this quote can be sent.'
                  : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-(--line)">
              {lines.map((line) =>
                editing === line.id ? (
                  <li key={line.id} className="bg-(--cream) p-4">
                    <LineForm
                      line={line}
                      taxRates={taxRates}
                      services={services}
                      busy={busy}
                      onCancel={() => setEditing(null)}
                      onSave={async (input) => {
                        if (await onSaveLine(input)) setEditing(null)
                      }}
                    />
                  </li>
                ) : (
                  <LineRow
                    key={line.id}
                    line={line}
                    taxRates={taxRates}
                    editable={editable && editing === null}
                    busy={busy}
                    onEdit={() => setEditing(line.id)}
                    onDelete={() => void onDeleteLine(line.id)}
                  />
                ),
              )}
              {editing === 'new' && (
                <li className="bg-(--cream) p-4">
                  <LineForm
                    line={null}
                    taxRates={taxRates}
                    services={services}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={async (input) => {
                      if (await onSaveLine(input)) setEditing(null)
                    }}
                  />
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <aside className="flex flex-col gap-5">
        <Card className="p-5">
          <h3 className="text-[15px] font-bold text-(--ink)">Totals</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-(--ink-2)">Subtotal</dt>
              <dd>{money(quote.subtotal_cents, true)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-(--ink-2)">Tax</dt>
              <dd>{money(quote.tax_cents, true)}</dd>
            </div>
            <div className="flex justify-between border-t border-(--line) pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{money(quote.total_cents ?? 0, true)}</dd>
            </div>
          </dl>
        </Card>
        {editable && (
          <SendCard
            recipient={recipient}
            busy={busy}
            problem={
              lines.length === 0
                ? 'Add at least one line.'
                : !quote.valid_until
                  ? 'Set a “valid until” date.'
                  : !recipient.email
                    ? 'The client has no email address.'
                    : null
            }
            onSend={onSend}
          />
        )}
        {delivery && (
          <Card className="p-5">
            <h3 className="text-[15px] font-bold text-(--ink)">Delivery</h3>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Badge
                tone={
                  delivery.delivery_status === 'sent'
                    ? 'green'
                    : delivery.delivery_status === 'failed'
                      ? 'clay'
                      : 'gray'
                }
                dot
              >
                {delivery.delivery_status === 'sent'
                  ? 'Email sent'
                  : delivery.delivery_status === 'failed'
                    ? 'Email failed'
                    : 'Email pending'}
              </Badge>
              {delivery.viewed_at && (
                <span className="text-(--ink-3)">
                  Viewed {fmtDate(delivery.viewed_at.slice(0, 10))}
                </span>
              )}
            </div>
            {delivery.last_delivery_error && (
              <p className="mt-2 text-xs text-(--clay)">
                {delivery.last_delivery_error}
              </p>
            )}
            {recipient.email && (
              <p className="mt-2 text-xs break-all text-(--ink-3)">
                To {recipient.email}
              </p>
            )}
            {quote.status === 'sent' && (
              <Btn
                className="mt-3"
                variant="outline"
                size="sm"
                icon={RefreshCw}
                disabled={busy}
                onClick={() => void onRetryDelivery()}
              >
                Send again
              </Btn>
            )}
            {quote.status === 'sent' && (
              <p className="mt-2 text-[11px] text-(--ink-3)">
                Sending again emails a new link; the previous link stops
                working.
              </p>
            )}
          </Card>
        )}
      </aside>
    </div>
  )
}

function SendCard({
  recipient,
  busy,
  problem,
  onSend,
}: {
  recipient: QuoteData['recipient']
  busy: boolean
  problem: string | null
  onSend: () => Promise<boolean>
}) {
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-bold text-(--ink)">Send to client</h3>
      {recipient.email ? (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <Mail className="mt-0.5 size-4 shrink-0 text-(--leaf-600)" />
          <span className="min-w-0 break-all">
            <span className="block font-semibold">{recipient.name}</span>
            <span className="text-(--ink-2)">{recipient.email}</span>
          </span>
        </p>
      ) : null}
      {!recipient.isClient && (
        <p className="mt-2 text-xs text-(--ink-3)">
          There’s no client record yet. When they approve, the client is matched
          by email or created from the request.
        </p>
      )}
      {problem && (
        <p className="mt-3 text-xs font-semibold text-(--clay)">{problem}</p>
      )}
      <Btn
        className="mt-4 w-full justify-center"
        icon={Send}
        disabled={busy || problem !== null}
        onClick={() => void onSend()}
      >
        Send quote
      </Btn>
      <p className="mt-2 text-[11px] text-(--ink-3)">
        They get an email with a link to approve or decline. No account needed.
      </p>
    </Card>
  )
}

function DetailsCard({
  quote,
  editable,
  busy,
  onSave,
}: {
  quote: QuoteData['quote']
  editable: boolean
  busy: boolean
  onSave: (input: DetailsInput) => Promise<boolean>
}) {
  const [title, setTitle] = useState(quote.title)
  const [message, setMessage] = useState(quote.message ?? '')
  const [conditions, setConditions] = useState(quote.conditions ?? '')
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? '')
  const dirty =
    title !== quote.title ||
    message !== (quote.message ?? '') ||
    conditions !== (quote.conditions ?? '') ||
    validUntil !== (quote.valid_until ?? '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSave({
      title,
      message: message.trim() || null,
      conditions: conditions.trim() || null,
      validUntil: validUntil || null,
    })
  }

  return (
    <Card>
      <CardHeader
        title="Quote details"
        subtitle="The client sees the title, message, conditions and expiry date."
      />
      <form onSubmit={submit} className="grid gap-4 p-5 pt-2">
        <Field label="Title" htmlFor="quote-title">
          <TextInput
            id="quote-title"
            value={title}
            maxLength={200}
            required
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Message to client" htmlFor="quote-message">
          <TextArea
            id="quote-message"
            value={message}
            maxLength={4000}
            disabled={!editable}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        <Field
          label="Conditions"
          htmlFor="quote-conditions"
          hint="For example: price confirmed after a site visit, or pending square footage."
        >
          <TextArea
            id="quote-conditions"
            value={conditions}
            maxLength={4000}
            disabled={!editable}
            onChange={(e) => setConditions(e.target.value)}
          />
        </Field>
        <Field
          label="Valid until"
          htmlFor="quote-valid-until"
          hint="Leave blank for no expiry."
        >
          <TextInput
            id="quote-valid-until"
            type="date"
            value={validUntil}
            disabled={!editable}
            onChange={(e) => setValidUntil(e.target.value)}
            className="max-w-48"
          />
        </Field>
        {editable && (
          <div>
            <Btn type="submit" disabled={busy || !dirty || !title.trim()}>
              Save details
            </Btn>
          </div>
        )}
      </form>
    </Card>
  )
}

function LineRow({
  line,
  taxRates,
  editable,
  busy,
  onEdit,
  onDelete,
}: {
  line: QuoteLine
  taxRates: Array<TaxRate>
  editable: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const names = line.quote_line_item_taxes
    .map((t) => taxRates.find((r) => r.id === t.tax_rate_id)?.name)
    .filter(Boolean)
    .join(', ')
  return (
    <li className="flex items-start gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {line.description}
          {line.is_optional && <Badge tone="sky">Optional</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-(--ink-3)">
          {line.quantity} × {money(line.unit_price_cents, true)} ·{' '}
          {FREQUENCY_LABELS[line.frequency]} · {activeMonthsText(line)}
          {names && ` · ${names}`}
        </p>
      </div>
      <p className="text-sm font-semibold whitespace-nowrap">
        {money(line.amount_cents ?? 0, true)}
      </p>
      {editable && (
        <div className="flex gap-1">
          <IconBtn
            icon={Pencil}
            label={`Edit ${line.description}`}
            disabled={busy}
            onClick={onEdit}
          />
          <IconBtn
            icon={Trash2}
            label={`Delete ${line.description}`}
            disabled={busy}
            onClick={onDelete}
          />
        </div>
      )}
    </li>
  )
}

function LineForm({
  line,
  taxRates,
  services,
  busy,
  onSave,
  onCancel,
}: {
  line: QuoteLine | null
  taxRates: Array<TaxRate>
  services: Array<ServiceRow>
  busy: boolean
  onSave: (input: LineInput) => Promise<unknown>
  onCancel: () => void
}) {
  const [serviceId, setServiceId] = useState(line?.service_id ?? '')
  const [description, setDescription] = useState(line?.description ?? '')
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1))
  const [price, setPrice] = useState(line ? dollars(line.unit_price_cents) : '')
  const [isOptional, setIsOptional] = useState(line?.is_optional ?? false)
  const [frequency, setFrequency] = useState<Frequency>(
    line?.frequency ?? 'one_time',
  )
  const [startMonth, setStartMonth] = useState(
    line?.season_start_month ? String(line.season_start_month) : '',
  )
  const [endMonth, setEndMonth] = useState(
    line?.season_end_month ? String(line.season_end_month) : '',
  )
  const [taxIds, setTaxIds] = useState<Array<string>>(
    line?.quote_line_item_taxes.map((t) => t.tax_rate_id) ?? [],
  )

  const qty = Number(quantity)
  const unit = Number(price)
  const valid =
    description.trim().length > 0 &&
    Number.isFinite(qty) &&
    qty > 0 &&
    price.trim() !== '' &&
    Number.isFinite(unit) &&
    unit >= 0 &&
    (startMonth === '') === (endMonth === '')

  const pickService = (id: string) => {
    setServiceId(id)
    const service = services.find((s) => s.id === id)
    if (!service) return
    if (!description.trim()) setDescription(service.name)
    if (!price.trim()) setPrice(dollars(service.default_price_cents))
    if (!line) {
      setFrequency(service.frequencies[0] ?? 'one_time')
      setStartMonth(
        service.season_start_month ? String(service.season_start_month) : '',
      )
      setEndMonth(
        service.season_end_month ? String(service.season_end_month) : '',
      )
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    void onSave({
      lineId: line?.id ?? null,
      serviceId: serviceId || null,
      description: description.trim(),
      quantity: qty,
      unitPriceCents: Math.round(unit * 100),
      isOptional,
      frequency,
      seasonStartMonth: startMonth ? Number(startMonth) : null,
      seasonEndMonth: endMonth ? Number(endMonth) : null,
      taxRateIds: taxIds,
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service (optional)" htmlFor="line-service">
          <SelectInput
            id="line-service"
            value={serviceId}
            onChange={(e) => pickService(e.target.value)}
          >
            <option value="">Custom item</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Description" htmlFor="line-description">
          <TextInput
            id="line-description"
            value={description}
            maxLength={500}
            required
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Quantity" htmlFor="line-quantity">
          <TextInput
            id="line-quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Unit price ($)" htmlFor="line-price">
          <TextInput
            id="line-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Billed" htmlFor="line-frequency">
          <SelectInput
            id="line-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Active from" htmlFor="line-start-month">
            <SelectInput
              id="line-start-month"
              value={startMonth}
              onChange={(e) => {
                setStartMonth(e.target.value)
                if (!e.target.value) setEndMonth('')
                else if (!endMonth) setEndMonth(e.target.value)
              }}
            >
              <option value="">Year-round</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Active to" htmlFor="line-end-month">
            <SelectInput
              id="line-end-month"
              value={endMonth}
              disabled={startMonth === ''}
              onChange={(e) => setEndMonth(e.target.value)}
            >
              {startMonth === '' && <option value="">Year-round</option>}
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Toggle
          checked={isOptional}
          onChange={setIsOptional}
          label="Optional line"
        />
        <span className="text-(--ink-2)">
          Optional: the client chooses whether to include it
        </span>
      </div>
      {taxRates.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-(--ink-2)">
            Taxes
          </p>
          <div className="flex flex-wrap gap-2">
            {taxRates.map((rate) => (
              <CheckPill
                key={rate.id}
                checked={taxIds.includes(rate.id)}
                onChange={(on) =>
                  setTaxIds((ids) =>
                    on ? [...ids, rate.id] : ids.filter((i) => i !== rate.id),
                  )
                }
              >
                {rate.name} ({rate.percentage}%)
              </CheckPill>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Btn type="submit" disabled={busy || !valid}>
          {line ? 'Save line' : 'Add line'}
        </Btn>
        <Btn variant="ghost" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </form>
  )
}

export function QuoteHeaderBadges({ quote }: { quote: QuoteData['quote'] }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status={quote.status} />
      <span>
        {quote.number}
        {quote.revision !== null && ` · revision ${quote.revision}`}
      </span>
    </span>
  )
}
