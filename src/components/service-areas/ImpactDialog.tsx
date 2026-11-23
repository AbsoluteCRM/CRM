import { ArrowRight } from 'lucide-react'

import { Alert, Btn, Modal } from '#/components/crm/ui'
import type {
  ServiceAreaFeature,
  ServiceAreaPreview,
} from '#/integrations/trpc/serviceAreas'
import { formatAreaSize, plural } from './model'

/** Properties listed before "and N more". */
const SHOWN = 50

/**
 * What saving would do, from `serviceAreas.preview`: the properties that move
 * (from → to) and the areas it overlaps. Overlaps warn but never block;
 * priority decides the owner.
 */
export function ImpactDialog({
  open,
  areaName,
  isNew,
  preview,
  areas,
  saving,
  error,
  onConfirm,
  onBack,
}: {
  open: boolean
  areaName: string
  isNew: boolean
  preview: ServiceAreaPreview | null
  areas: Array<ServiceAreaFeature>
  saving: boolean
  /** The save failed; the draft is kept. */
  error: string | null
  onConfirm: () => void
  onBack: () => void
}) {
  const nameOf = (id: string | null) =>
    id === null
      ? 'No area'
      : (areas.find((a) => a.properties.id === id)?.properties.name ??
        'Another area')
  const overlaps = preview
    ? preview.overlapping_area_ids.map((id) => nameOf(id))
    : []
  const changes = preview?.changes ?? []
  return (
    <Modal
      open={open}
      onClose={onBack}
      title={isNew ? `Add ${areaName}` : `Save ${areaName}`}
      subtitle={
        preview
          ? `${formatAreaSize(preview.area_m2)} · ${plural(preview.vertex_count, 'corner')}`
          : undefined
      }
      width={640}
      footer={
        <>
          <Btn variant="ghost" onClick={onBack} disabled={saving}>
            Back to editing
          </Btn>
          <Btn onClick={onConfirm} disabled={!preview || saving}>
            {saving ? 'Saving' : isNew ? 'Add area' : 'Save area'}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert tone="danger" title="Couldn't save this area">
            {error}
          </Alert>
        )}
        {overlaps.length > 0 && (
          <Alert
            tone="warning"
            title={`Overlaps ${plural(overlaps.length, 'area')}: ${overlaps.join(', ')}`}
          >
            You can still save. Where areas overlap, the one with the higher
            priority owns the address, then the smaller one.
          </Alert>
        )}
        <section aria-label="Properties that would move">
          <h3 className="mb-2 text-sm font-bold text-(--ink)">
            {changes.length === 0
              ? 'No properties would move'
              : `${plural(changes.length, 'property', 'properties')} would move`}
          </h3>
          {changes.length > 0 && (
            <ul className="divide-y divide-(--line) rounded-2xl border border-(--line)">
              {changes.slice(0, SHOWN).map((c) => (
                <li
                  key={c.property_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-(--ink)">
                    {c.address_line1}
                  </span>
                  <span className="flex items-center gap-1.5 text-(--ink-2)">
                    {nameOf(c.from_area_id)}
                    <ArrowRight aria-label="to" className="size-3.5" />
                    <strong className="text-(--ink)">
                      {c.to_preview ? areaName : nameOf(c.to_area_id)}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {changes.length > SHOWN && (
            <p className="mt-2 text-xs text-(--ink-3)">
              and {changes.length - SHOWN} more
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}
