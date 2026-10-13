import { ArrowDown, ArrowRight } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'

import { cn } from '#/lib/utils'
import { RouteStopCard } from './RouteStopCard'
import type { RouteStop } from './mock-routes'

const GAP_REM = 0.75 // matches gap-3
const ARROW_REM = 1.25 // matches the arrow divider's fixed w-5 width

/** Picks 1–3 columns from the grid's own width so cards never get cramped. */
function useColumns() {
  const ref = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (w: number) => setColumns(w >= 760 ? 3 : w >= 470 ? 2 : 1)
    const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width))
    ro.observe(el)
    update(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return { ref, columns }
}

/**
 * Lays out stops in route order as a boustrophedon ("snake") grid: left to
 * right, then down, then right to left, then down, and so on. Arrows between
 * cards show the direction of travel through the route.
 */
export function RouteStopsGrid({
  stops,
  onUpdate,
}: {
  stops: Array<RouteStop>
  onUpdate?: (stop: RouteStop) => void
}) {
  const { ref, columns } = useColumns()
  const rows: Array<Array<RouteStop>> = []
  for (let i = 0; i < stops.length; i += columns) {
    rows.push(stops.slice(i, i + columns))
  }
  const itemBasis = `calc((100% - ${(columns - 1) * (ARROW_REM + 2 * GAP_REM)}rem) / ${columns})`

  return (
    <div ref={ref} role="list" className="flex w-full flex-col gap-3">
      {rows.map((row, rowIndex) => {
        const reversed = rowIndex % 2 === 1
        const isLastRow = rowIndex === rows.length - 1
        return (
          <Fragment key={rowIndex}>
            <div className={cn('flex gap-3', reversed && 'flex-row-reverse')}>
              {row.map((stop, colIndex) => {
                const isLastInRow = colIndex === row.length - 1
                return (
                  <Fragment key={stop.id}>
                    <div
                      className="min-w-0 shrink-0 grow-0"
                      style={{ flexBasis: itemBasis }}
                    >
                      <RouteStopCard
                        stop={stop}
                        index={rowIndex * columns + colIndex}
                        onUpdate={onUpdate}
                      />
                    </div>
                    {!isLastInRow && (
                      <div
                        aria-hidden="true"
                        className="flex w-5 shrink-0 grow-0 items-center justify-center text-(--leaf-500)"
                      >
                        <ArrowRight
                          className={cn('size-5', reversed && 'rotate-180')}
                        />
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
            {!isLastRow && (
              <div
                aria-hidden="true"
                className={cn(
                  'flex text-(--leaf-500)',
                  reversed ? 'justify-start' : 'justify-end',
                )}
                // Centre the arrow under the last card in the row.
                style={{
                  [reversed ? 'paddingLeft' : 'paddingRight']:
                    `calc(${itemBasis} / 2 - 0.625rem)`,
                }}
              >
                <ArrowDown className="size-5" />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
