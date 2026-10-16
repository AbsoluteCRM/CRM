import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  Globe,
  Inbox,
  Mail,
  Phone,
  Search as SearchIcon,
  UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { inferRouterOutputs } from '@trpc/server'

import { fmtDate, relativeTime } from '#/components/crm/format'
import {
  Card,
  Drawer,
  EmptyState,
  KeyValue,
  SearchInput,
  Segmented,
  StatusBadge,
} from '#/components/crm/ui'
import { cn } from '#/lib/utils'
import type { TRPCRouter } from '#/integrations/trpc/router'

type RequestRow = inferRouterOutputs<TRPCRouter>['requests']['list'][number]
type ServiceRow = inferRouterOutputs<TRPCRouter>['services']['list'][number]
type RequestStatus = RequestRow['status']
type Filter = 'open' | 'all' | 'rejected' | RequestStatus

const STAGES: Array<{
  key: RequestStatus
  label: string
  icon: LucideIcon
}> = [
  { key: 'submitted', label: 'Submitted', icon: Inbox },
  { key: 'reviewing', label: 'Review', icon: SearchIcon },
  { key: 'estimated', label: 'Estimate', icon: FileText },
  { key: 'approved', label: 'Approved', icon: CalendarCheck },
  { key: 'scheduled', label: 'Scheduled', icon: CalendarCheck },
  { key: 'converted', label: 'Customer', icon: UserCheck },
]

const SOURCE: Record<
  RequestRow['source'],
  { label: string; icon: LucideIcon }
> = {
  web_form: { label: 'Web form', icon: Globe },
  phone: { label: 'Phone', icon: Phone },
  email: { label: 'Email', icon: Mail },
  client_portal: { label: 'Client portal', icon: UserCheck },
}

const OPEN_STATUSES: Array<RequestStatus> = [
  'submitted',
  'reviewing',
  'estimated',
  'approved',
]

export default function RequestsPanel({
  requests,
  services,
}: {
  requests: Array<RequestRow>
  services: Array<ServiceRow>
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<RequestRow | null>(null)
  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  )
  const counts = useMemo(() => {
    const result: Partial<Record<RequestStatus, number>> = {}
    for (const request of requests) {
      result[request.status] = (result[request.status] ?? 0) + 1
    }
    return result
  }, [requests])
  const rows = requests.filter((request) => {
    if (filter === 'open' && !OPEN_STATUSES.includes(request.status))
      return false
    if (filter !== 'open' && filter !== 'all' && request.status !== filter)
      return false
    const search = query.trim().toLowerCase()
    const service = serviceById.get(request.service_id)
    return (
      !search ||
      `${request.contact_name} ${request.address} ${service?.name ?? ''}`
        .toLowerCase()
        .includes(search)
    )
  })

  return (
    <>
      <div className="crm-scroll mb-5 overflow-x-auto">
        <ol className="flex min-w-[900px] items-stretch gap-2">
          {STAGES.map((stage, index) => {
            const active = filter === stage.key
            const Icon = stage.icon
            return (
              <li key={stage.key} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilter(active ? 'open' : stage.key)}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors',
                    active
                      ? 'border-(--leaf-900) bg-(--leaf-900) text-(--cream)'
                      : 'border-(--line) bg-(--paper) hover:border-(--leaf-500)',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl',
                      active
                        ? 'bg-(--lime) text-(--leaf-950)'
                        : 'bg-(--lime-100) text-(--leaf-700)',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="crm-display block text-2xl leading-none font-semibold">
                      {counts[stage.key] ?? 0}
                    </span>
                    <span
                      className={cn(
                        'mt-1 block text-xs font-semibold',
                        active ? 'text-(--cream)/70' : 'text-(--ink-3)',
                      )}
                    >
                      {stage.label}
                    </span>
                  </span>
                </button>
                <ArrowRight
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0 text-(--ink-3)',
                    index === STAGES.length - 1 && 'invisible',
                  )}
                />
              </li>
            )
          })}
        </ol>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, address, service"
            className="w-full sm:w-80"
          />
          <Segmented
            value={
              filter === 'open' || filter === 'all' || filter === 'rejected'
                ? filter
                : 'open'
            }
            onChange={setFilter}
            options={[
              {
                value: 'open',
                label: 'Open',
                count: OPEN_STATUSES.reduce(
                  (count, status) => count + (counts[status] ?? 0),
                  0,
                ),
              },
              {
                value: 'rejected',
                label: 'Rejected',
                count: counts.rejected ?? 0,
              },
              { value: 'all', label: 'All', count: requests.length },
            ]}
          />
        </div>
        {requests.length > 0 && rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No matching requests"
            body="Try another search or status filter."
          />
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No requests yet"
            body="New requests from your website and client portal will appear here."
          />
        ) : (
          <div className="crm-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-3 py-3">Service requested</th>
                  <th className="px-3 py-3">Submitted</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
                  .map((request) => {
                    const service = serviceById.get(request.service_id)
                    const SourceIcon = SOURCE[request.source].icon
                    return (
                      <tr
                        key={request.id}
                        tabIndex={0}
                        aria-label={`Open request from ${request.contact_name}`}
                        onClick={() => setSelected(request)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelected(request)
                          }
                        }}
                        className="cursor-pointer border-t border-(--line) hover:bg-(--cream)"
                      >
                        <td className="px-5 py-3">
                          <p className="flex items-center gap-2 font-bold">
                            {request.contact_name}
                          </p>
                          <p className="max-w-[280px] truncate text-xs text-(--ink-3)">
                            {request.address}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            {service && (
                              <span
                                className="size-2.5 rounded-full"
                                style={{ background: service.color }}
                              />
                            )}
                            {service?.name ?? 'Service unavailable'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-(--ink-2)">
                          {fmtDate(request.submitted_at.slice(0, 10))}
                          <span className="block text-xs text-(--ink-3)">
                            {relativeTime(request.submitted_at)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-(--ink-2)">
                          <span className="flex items-center gap-1.5 text-[13px]">
                            <SourceIcon className="size-3.5 text-(--ink-3)" />
                            {SOURCE[request.source].label}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={request.status} />
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <RequestDetails
          request={selected}
          service={serviceById.get(selected.service_id)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

function RequestDetails({
  request,
  service,
  onClose,
}: {
  request: RequestRow
  service: ServiceRow | undefined
  onClose: () => void
}) {
  return (
    <Drawer
      open
      onClose={onClose}
      title={request.contact_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={request.status} />
          <span>
            {service?.name ?? 'Service unavailable'} · submitted{' '}
            {relativeTime(request.submitted_at)}
          </span>
        </span>
      }
      width={640}
    >
      <dl className="grid gap-5 sm:grid-cols-2">
        <KeyValue label="Email">{request.contact_email}</KeyValue>
        <KeyValue label="Phone">{request.contact_phone}</KeyValue>
        <KeyValue label="Service">
          {service?.name ?? 'Service unavailable'}
        </KeyValue>
        <KeyValue label="Source">{SOURCE[request.source].label}</KeyValue>
        <KeyValue label="Address">{request.address}</KeyValue>
        <KeyValue label="Submitted">
          {fmtDate(request.submitted_at.slice(0, 10), {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
          {' · '}
          {new Date(request.submitted_at).toLocaleTimeString('en-CA', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </KeyValue>
        <KeyValue label="Notes">
          {request.notes || 'No notes provided.'}
        </KeyValue>
      </dl>
    </Drawer>
  )
}
