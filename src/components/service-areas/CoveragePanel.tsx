import { MapPinOff, ShieldCheck, TriangleAlert } from 'lucide-react'

import type { ServiceAreaCoverage } from '#/integrations/trpc/serviceAreas'

/** Counts from `serviceAreas.coverage`: where the service areas leave gaps. */
export function CoveragePanel({ coverage }: { coverage: ServiceAreaCoverage }) {
  const tiles = [
    {
      key: 'covered',
      icon: ShieldCheck,
      count: coverage.covered_count,
      label: 'in an area',
      tone: 'text-(--leaf-700)',
    },
    {
      key: 'uncovered',
      icon: TriangleAlert,
      count: coverage.uncovered_count,
      label: 'outside every area',
      tone: coverage.uncovered_count > 0 ? 'text-(--sun)' : 'text-(--ink-3)',
    },
    {
      key: 'nolocation',
      icon: MapPinOff,
      count: coverage.no_location_count,
      label: 'with no location yet',
      tone: coverage.no_location_count > 0 ? 'text-(--sun)' : 'text-(--ink-3)',
    },
  ]
  return (
    <section aria-label="Coverage" className="px-5 pb-5">
      <ul className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ key, icon: Icon, count, label, tone }) => (
          <li
            key={key}
            data-testid={`coverage-${key}`}
            className="flex items-center gap-3 rounded-2xl bg-(--cream) px-4 py-3"
          >
            <Icon className={`size-5 shrink-0 ${tone}`} />
            <span className="text-sm text-(--ink-2)">
              <strong className="text-lg text-(--ink)">{count}</strong>{' '}
              {count === 1 ? 'property' : 'properties'} {label}
            </span>
          </li>
        ))}
      </ul>
      {coverage.no_location_count > 0 && (
        <p className="mt-3 text-xs text-(--ink-3)">
          Properties without a location cannot be matched to an area until they
          are geocoded or pinned.
        </p>
      )}
    </section>
  )
}
