import { useState } from 'react'
import { Archive, Pencil } from 'lucide-react'

import { Badge, Btn, IconBtn } from '#/components/crm/ui'
import type { ServiceAreaFeature } from '#/integrations/trpc/serviceAreas'
import { cn } from '#/lib/utils'
import { DEFAULT_AREA_COLOR, crewLabel, formatAreaSize, plural } from './model'
import type { CrewOption } from './model'

/**
 * The keyboard-accessible equivalent of the map: every area, selectable,
 * with its crew, colour, property count and overlaps. Selecting highlights
 * the area on the map.
 */
export function AreaList({
  areas,
  crews,
  selectedId,
  canEdit,
  busyId,
  onSelect,
  onEdit,
  onArchive,
}: {
  areas: Array<ServiceAreaFeature>
  crews: Array<CrewOption>
  selectedId: string | null
  canEdit: boolean
  /** An area with a pending archive. */
  busyId?: string | null
  onSelect: (id: string | null) => void
  onEdit: (id: string) => void
  onArchive: (id: string) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  return (
    <ul aria-label="Service areas" className="divide-y divide-(--line)">
      {areas.map((area) => {
        const p = area.properties
        const selected = p.id === selectedId
        const overlaps = p.overlapping_area_ids.length
        return (
          <li
            key={p.id}
            className={cn(
              'flex flex-wrap items-center gap-2 px-3 py-2.5',
              selected && 'bg-(--lime-100)/60',
            )}
          >
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${p.name}, ${crewLabel(crews, p.crew_id)}`}
              onClick={() => onSelect(selected ? null : p.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-(--lime)"
            >
              <span
                aria-hidden
                data-testid="area-swatch"
                className="size-4 shrink-0 rounded-md border border-black/10"
                style={{ background: p.color ?? DEFAULT_AREA_COLOR }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-(--ink)">
                  {p.name}
                </span>
                <span className="block truncate text-xs text-(--ink-3)">
                  {crewLabel(crews, p.crew_id)} · {formatAreaSize(p.area_m2)}
                  {p.priority !== 0 && ` · priority ${p.priority}`}
                </span>
              </span>
            </button>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone="green">
                {plural(p.property_count, 'property', 'properties')}
              </Badge>
              {overlaps > 0 && <Badge tone="sun">Overlaps {overlaps}</Badge>}
              {p.rotations.length > 0 && <Badge tone="sky">Rotation</Badge>}
            </span>
            {canEdit &&
              (confirming === p.id ? (
                <span className="flex items-center gap-1.5">
                  <Btn
                    size="sm"
                    variant="danger"
                    disabled={busyId === p.id}
                    onClick={() => {
                      setConfirming(null)
                      onArchive(p.id)
                    }}
                  >
                    Archive {p.name}
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </Btn>
                </span>
              ) : (
                <span className="flex items-center">
                  <IconBtn
                    icon={Pencil}
                    label={`Edit ${p.name}`}
                    onClick={() => onEdit(p.id)}
                  />
                  <IconBtn
                    icon={Archive}
                    label={`Archive ${p.name}`}
                    disabled={busyId === p.id}
                    onClick={() => setConfirming(p.id)}
                  />
                </span>
              ))}
          </li>
        )
      })}
    </ul>
  )
}
