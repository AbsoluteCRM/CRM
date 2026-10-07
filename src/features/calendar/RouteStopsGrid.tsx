import { Fragment } from 'react'
import { ArrowDown, ArrowRight } from 'lucide-react'

import { cn } from '#/lib/utils'
import { RouteStopCard } from './RouteStopCard'
import type { RouteStop } from './mock-routes'

const COLUMNS = 3
const GAP_REM = 0.75 // matches gap-3
const ARROW_REM = 1.25 // matches the arrow divider's fixed w-5 width

/**
 * Lays out stops in route order as a boustrophedon ("snake") grid: left to
 * right, then down, then right to left, then down, and so on. Arrows between
 * cards show the direction of travel through the route.
 */
export function RouteStopsGrid({ stops }: { stops: Array<RouteStop> }) {
  const rows: Array<Array<RouteStop>> = []
  for (let i = 0; i < stops.length; i += COLUMNS) {
    rows.push(stops.slice(i, i + COLUMNS))
  }
  const itemBasis = `calc((100% - ${(COLUMNS - 1) * (ARROW_REM + 2 * GAP_REM)}rem) / ${COLUMNS})`

  return (
    <div role="list" className="flex flex-col gap-3">
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
                      className="shrink-0 grow-0"
                      style={{ flexBasis: itemBasis }}
                    >
                      <RouteStopCard
                        stop={stop}
                        index={rowIndex * COLUMNS + colIndex}
                      />
                    </div>
                    {!isLastInRow && (
                      <div
                        aria-hidden="true"
                        className="flex w-5 shrink-0 grow-0 items-center justify-center text-muted-foreground"
                      >
                        <ArrowRight
                          className={`size-8 ${reversed ? 'rotate-180' : ''}`}
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
                  'flex text-muted-foreground',
                  reversed ? 'justify-start pl-32' : 'justify-end pr-32',
                )}
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
