import { Warehouse } from 'lucide-react'

import { cn } from '#/lib/utils'
import { fmtTime } from './format'
import { DEPOT, driveMinutes } from './route'
import type { RouteStop } from './route'

/**
 * Stylized service-area map. Pins are HTML (so they stay round at any size);
 * roads and the route line are SVG stretched to the container.
 * Swap for a real map (Mapbox/Google) once properties carry coordinates.
 */
export default function RouteMap({
  stops,
  color = '#2f7350',
  activeJobId,
  onSelect,
  className,
  showLegs = true,
}: {
  stops: Array<RouteStop>
  color?: string
  activeJobId?: string | null
  onSelect?: (jobId: string) => void
  className?: string
  showLegs?: boolean
}) {
  const pts = [DEPOT, ...stops.map((s) => s.property), DEPOT]
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div
      className={cn(
        'relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#e8eedf]',
        className,
      )}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        {/* parks */}
        <ellipse cx="18" cy="24" rx="12" ry="9" fill="#d3e3c2" />
        <ellipse cx="80" cy="78" rx="14" ry="10" fill="#d3e3c2" />
        <ellipse cx="72" cy="18" rx="8" ry="6" fill="#d3e3c2" />
        {/* river */}
        <path
          d="M-5 70 C 20 60, 30 78, 52 70 S 85 52, 105 60"
          fill="none"
          stroke="#c4dceb"
          strokeWidth="5"
          vectorEffect="non-scaling-stroke"
        />
        {/* roads */}
        {[15, 35, 55, 75, 92].map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1="0"
            y2="100"
            stroke="#fff"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            opacity="0.85"
          />
        ))}
        {[12, 32, 50, 86].map((y) => (
          <line
            key={`h${y}`}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke="#fff"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            opacity="0.85"
          />
        ))}
        <path
          d="M0 95 L100 5"
          stroke="#f6f1df"
          strokeWidth="5"
          vectorEffect="non-scaling-stroke"
        />
        {/* route */}
        {stops.length > 0 && (
          <>
            <polyline
              points={line}
              fill="none"
              stroke="#fff"
              strokeWidth="6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeDasharray="1 0"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {showLegs &&
        stops.map((s, i) => {
          const prev = i === 0 ? DEPOT : stops[i - 1].property
          return (
            <span
              key={`leg-${s.job.id}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 px-1.5 py-px text-[10px] font-semibold text-(--ink-2) shadow-sm"
              style={{
                left: `${(prev.x + s.property.x) / 2}%`,
                top: `${(prev.y + s.property.y) / 2}%`,
              }}
            >
              {driveMinutes(prev, s.property)}m
            </span>
          )
        })}

      <span
        className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-(--leaf-900) text-(--lime) shadow-md"
        style={{ left: `${DEPOT.x}%`, top: `${DEPOT.y}%` }}
        title="Yard"
      >
        <Warehouse className="size-4" />
      </span>

      {stops.map((s, i) => {
        const active = s.job.id === activeJobId
        return (
          <button
            key={s.job.id}
            type="button"
            onClick={() => onSelect?.(s.job.id)}
            title={`${i + 1}. ETA ${fmtTime(s.eta)}`}
            className={cn(
              'absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-white font-bold shadow-md transition-transform hover:scale-110',
              active
                ? 'z-10 size-9 text-sm ring-4 ring-(--lime)'
                : 'size-7 text-xs',
              s.job.status === 'completed' ? 'opacity-70' : '',
            )}
            style={{
              left: `${s.property.x}%`,
              top: `${s.property.y}%`,
              background: color,
              color: '#fff',
            }}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}
