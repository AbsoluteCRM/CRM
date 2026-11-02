import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarRange,
  Clock,
  Leaf,
  Repeat,
  SearchX,
  Wrench,
} from 'lucide-react'

import { fmtDuration, money } from '#/components/crm/format'
import { inSeason } from '#/integrations/services/types'
import { Logo } from '#/components/crm/Logo'
import { Badge, Btn, Card, EmptyState } from '#/components/crm/ui'
import { Toaster } from '#/lib/toast'
import RequestModal, { UNIT_LABEL } from '#/components/portal/RequestModal'
import SeasonBar, { seasonText } from '#/components/services/SeasonBar'
import { useTRPC } from '#/integrations/trpc/react'
import type { PortalService } from '#/server/trusted/portal'

const FREQ_LABEL: Record<string, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
}

const toSeasonal = (s: PortalService) => ({
  color: s.color,
  season:
    s.season_start_month !== null && s.season_end_month !== null
      ? { start: s.season_start_month, end: s.season_end_month }
      : null,
})

export const Route = createFileRoute('/portal/$orgSlug')({
  head: () => ({ meta: [{ title: 'Request a service' }] }),
  component: PortalPage,
})

function PortalPage() {
  const { orgSlug } = Route.useParams()
  const trpc = useTRPC()
  const portal = useQuery({
    ...trpc.portal.get.queryOptions({ orgSlug }),
    retry: false,
  })
  const month = new Date().getMonth() + 1
  const [selected, setSelected] = useState<PortalService | null>(null)

  return (
    <div className="min-h-svh bg-(--cream)">
      <header className="border-b border-(--line) bg-(--paper)">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        {portal.isPending ? (
          <p className="py-20 text-center text-sm text-(--ink-3)">Loading…</p>
        ) : portal.isError ? (
          <EmptyState
            icon={SearchX}
            title={
              portal.error.data?.code === 'NOT_FOUND'
                ? 'We couldn’t find that page'
                : 'Something went wrong'
            }
            body={
              portal.error.data?.code === 'NOT_FOUND'
                ? 'Check the link you were given and try again.'
                : 'Please reload the page in a moment.'
            }
          />
        ) : (
          <>
            <div className="mb-8">
              <h1 className="crm-display text-3xl font-semibold text-(--ink)">
                {portal.data.organization_name}
              </h1>
              <p className="mt-1 text-(--ink-3)">
                Choose a service to send us a request.
              </p>
            </div>
            {portal.data.services.length === 0 ? (
              <EmptyState
                icon={Leaf}
                title="No services available yet"
                body="This business hasn't published any services. Please check back soon."
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {portal.data.services.map((s) => {
                  const service = toSeasonal(s)
                  const open = inSeason(service, month)
                  return (
                    <li key={s.id}>
                      <Card className="flex h-full flex-col">
                        <div className="flex items-start gap-3 p-5 pb-3">
                          <span
                            className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
                            style={{
                              background: `color-mix(in oklab, ${s.color} 22%, white)`,
                              color: s.color,
                            }}
                          >
                            <Wrench className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-[15px] font-bold">
                              {s.name}
                            </h2>
                            <p className="mt-0.5">
                              {open ? (
                                <Badge tone="green" dot>
                                  Available now
                                </Badge>
                              ) : (
                                <Badge tone="sun" dot>
                                  Off-season
                                </Badge>
                              )}
                            </p>
                          </div>
                        </div>
                        {s.description && (
                          <p className="line-clamp-3 px-5 text-[13px] text-(--ink-2)">
                            {s.description}
                          </p>
                        )}
                        <div className="mt-4 flex items-end justify-between gap-3 px-5">
                          <div>
                            <p className="crm-display text-[26px] leading-none font-semibold">
                              {s.default_price_cents
                                ? money(s.default_price_cents)
                                : 'Quote'}
                            </p>
                            <p className="mt-1 text-xs text-(--ink-3)">
                              {UNIT_LABEL[s.unit] ?? ''}
                            </p>
                          </div>
                          {s.default_duration_minutes && (
                            <p className="flex items-center gap-1 text-[13px] font-semibold text-(--ink-2)">
                              <Clock className="size-3.5" />{' '}
                              {fmtDuration(s.default_duration_minutes)}
                            </p>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5 px-5">
                          {s.frequencies.map((f) => (
                            <Badge
                              key={f}
                              tone={f === 'one_time' ? 'gray' : 'lime'}
                            >
                              {f !== 'one_time' && (
                                <Repeat className="size-3" />
                              )}
                              {FREQ_LABEL[f]}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-auto px-5 pt-4">
                          <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-(--ink-3)">
                            <CalendarRange className="size-3" />{' '}
                            {seasonText(service)}
                          </p>
                          <SeasonBar service={service} currentMonth={month} />
                        </div>
                        <div className="p-5">
                          <Btn
                            className="w-full justify-center"
                            onClick={() => setSelected(s)}
                          >
                            Request this service
                          </Btn>
                        </div>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            )}
            <RequestModal
              orgSlug={orgSlug}
              orgName={portal.data.organization_name}
              service={selected}
              onClose={() => setSelected(null)}
            />
          </>
        )}
      </main>
      <Toaster />
    </div>
  )
}
