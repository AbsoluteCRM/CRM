import { useState } from 'react'
import { Hammer, Package, Plus, Save, Trash2, Truck, Users } from 'lucide-react'

import { quoteTotals } from './store'
import { Btn, Card, IconBtn, TextInput } from './ui'
import { money, uid } from './format'
import type { Quote, QuoteLine, Service } from './types'
import type { LucideIcon } from 'lucide-react'

const SECTIONS: Array<{
  kind: QuoteLine['kind']
  label: string
  icon: LucideIcon
  qtyLabel: string
  priceLabel: string
  placeholder: string
}> = [
  {
    kind: 'labor',
    label: 'Labor',
    icon: Users,
    qtyLabel: 'Hours',
    priceLabel: 'Rate / hr',
    placeholder: 'e.g. Crew of 2, install',
  },
  {
    kind: 'materials',
    label: 'Materials',
    icon: Package,
    qtyLabel: 'Qty',
    priceLabel: 'Unit cost',
    placeholder: 'e.g. Cedar mulch (yd³)',
  },
  {
    kind: 'equipment',
    label: 'Equipment',
    icon: Truck,
    qtyLabel: 'Qty / days',
    priceLabel: 'Rate',
    placeholder: 'e.g. Skid steer rental',
  },
]

function starterLines(service: Service | undefined): Array<QuoteLine> {
  if (!service) return []
  const hours = Math.max(
    1,
    Math.round((service.default_duration_minutes / 60) * 2) / 2,
  )
  const lines: Array<QuoteLine> = [
    {
      id: uid('ql'),
      kind: 'labor',
      description: `${service.name} labor`,
      quantity: hours,
      unit_price_cents:
        Math.round(service.default_price_cents / hours / 100) * 100 || 6500,
    },
  ]
  service.equipment.slice(0, 1).forEach((e) =>
    lines.push({
      id: uid('ql'),
      kind: 'equipment',
      description: e,
      quantity: 1,
      unit_price_cents: 0,
    }),
  )
  return lines
}

/** Estimate builder: labor, materials, and equipment lines, with discount and tax. */
export default function QuoteBuilder({
  initial,
  service,
  onSave,
  onCancel,
}: {
  initial: Quote | null
  service: Service | undefined
  onSave: (q: Omit<Quote, 'number' | 'createdAt'>) => void
  onCancel?: () => void
}) {
  const [lines, setLines] = useState<Array<QuoteLine>>(
    initial?.lines ?? starterLines(service),
  )
  const [taxPercent, setTaxPercent] = useState(initial?.taxPercent ?? 5)
  const [discount, setDiscount] = useState(
    initial ? (initial.discountCents / 100).toFixed(2) : '',
  )
  const discountCents = Math.round((Number(discount) || 0) * 100)
  const totals = quoteTotals({ lines, taxPercent, discountCents })

  const update = (id: string, patch: Partial<QuoteLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const add = (kind: QuoteLine['kind']) =>
    setLines((ls) => [
      ...ls,
      {
        id: uid('ql'),
        kind,
        description: '',
        quantity: 1,
        unit_price_cents: 0,
      },
    ])
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id))

  return (
    <div className="space-y-4">
      {SECTIONS.map((sec) => {
        const rows = lines.filter((l) => l.kind === sec.kind)
        const subtotal = totals[sec.kind]
        return (
          <Card key={sec.kind} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-bold">
                <span className="flex size-7 items-center justify-center rounded-lg bg-(--lime-100) text-(--leaf-700)">
                  <sec.icon className="size-4" />
                </span>
                {sec.label}
              </p>
              <span className="text-sm font-semibold text-(--ink-2)">
                {money(subtotal, true)}
              </span>
            </div>
            {rows.length > 0 && (
              <div className="mb-2 hidden grid-cols-[1fr_88px_110px_90px_36px] gap-2 px-1 text-[11px] font-semibold tracking-wide text-(--ink-3) uppercase sm:grid">
                <span>Description</span>
                <span>{sec.qtyLabel}</span>
                <span>{sec.priceLabel}</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
            )}
            <div className="space-y-2">
              {rows.map((l) => (
                <div
                  key={l.id}
                  className="grid grid-cols-[1fr_88px] gap-2 sm:grid-cols-[1fr_88px_110px_90px_36px] sm:items-center"
                >
                  <TextInput
                    aria-label={`${sec.label} description`}
                    value={l.description}
                    placeholder={sec.placeholder}
                    onChange={(e) =>
                      update(l.id, { description: e.target.value })
                    }
                    className="col-span-2 sm:col-span-1"
                  />
                  <TextInput
                    aria-label={sec.qtyLabel}
                    type="number"
                    min={0}
                    step="0.5"
                    value={l.quantity}
                    onChange={(e) =>
                      update(l.id, { quantity: Number(e.target.value) })
                    }
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-(--ink-3)">
                      $
                    </span>
                    <TextInput
                      aria-label={sec.priceLabel}
                      type="number"
                      min={0}
                      step="0.01"
                      value={(l.unit_price_cents / 100).toString()}
                      onChange={(e) =>
                        update(l.id, {
                          unit_price_cents: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        })
                      }
                      className="pl-6"
                    />
                  </div>
                  <span className="text-right text-sm font-semibold">
                    {money(Math.round(l.quantity * l.unit_price_cents), true)}
                  </span>
                  <IconBtn
                    icon={Trash2}
                    label="Remove line"
                    onClick={() => remove(l.id)}
                  />
                </div>
              ))}
            </div>
            <Btn
              variant="ghost"
              size="sm"
              icon={Plus}
              className="mt-2 -ml-2"
              onClick={() => add(sec.kind)}
            >
              Add {sec.label.toLowerCase()} line
            </Btn>
          </Card>
        )
      })}

      <Card className="overflow-hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="text-[13px] font-semibold text-(--ink-2)">
            Discount ($)
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="mt-1.5"
              placeholder="0.00"
            />
          </label>
          <label className="text-[13px] font-semibold text-(--ink-2)">
            Tax (%)
            <TextInput
              type="number"
              min={0}
              max={100}
              step="0.25"
              value={taxPercent}
              onChange={(e) => setTaxPercent(Number(e.target.value))}
              className="mt-1.5"
            />
          </label>
        </div>
        <dl className="space-y-1.5 border-t border-(--line) bg-(--cream)/60 px-5 py-4 text-sm">
          <div className="flex justify-between text-(--ink-2)">
            <dt>Subtotal</dt>
            <dd>{money(totals.subtotal, true)}</dd>
          </div>
          {discountCents > 0 && (
            <div className="flex justify-between text-(--ink-2)">
              <dt>Discount</dt>
              <dd>−{money(discountCents, true)}</dd>
            </div>
          )}
          <div className="flex justify-between text-(--ink-2)">
            <dt>Tax ({taxPercent}%)</dt>
            <dd>{money(totals.tax, true)}</dd>
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <dt className="font-bold">Estimate total</dt>
            <dd className="crm-display text-2xl font-semibold">
              {money(totals.total, true)}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Btn variant="ghost" onClick={onCancel}>
            Cancel
          </Btn>
        )}
        <Btn
          icon={initial ? Save : Hammer}
          disabled={!lines.length || totals.total <= 0}
          onClick={() => onSave({ lines, taxPercent, discountCents })}
        >
          {initial ? 'Update estimate' : 'Create estimate'}
        </Btn>
      </div>
    </div>
  )
}
