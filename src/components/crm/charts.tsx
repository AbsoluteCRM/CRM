/**
 * Lightweight SVG charts (no chart library in package.json).
 * Thin marks, recessive grid, hover tooltips, legend + values for the donut.
 */
import { useEffect, useRef, useState } from 'react'

import { cn } from '#/lib/utils'

/** Categorical order, validated for CVD separation. Assign in this order; never cycle. */
export const CATEGORICAL = [
  '#1f8a4c',
  '#2b7cc4',
  '#7aa51f',
  '#8b54c4',
  '#d9752a',
]
export const OTHER_COLOR = '#a3ab9c'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * exp
}

interface Point {
  label: string
  value: number
  detail?: string
}

function Tooltip({
  x,
  y,
  title,
  value,
  dark,
}: {
  x: number
  y: number
  title: string
  value: string
  dark?: boolean
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 text-xs whitespace-nowrap shadow-lg',
        dark ? 'bg-(--cream) text-(--ink)' : 'bg-(--leaf-950) text-(--cream)',
      )}
      style={{ left: x, top: y - 10 }}
    >
      <div className="opacity-70">{title}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}

export function LineChart({
  data,
  height = 220,
  color = '#2f7350',
  format = (v: number) => String(v),
  dark = false,
  ariaLabel,
}: {
  data: Array<Point>
  height?: number
  color?: string
  format?: (v: number) => string
  dark?: boolean
  ariaLabel: string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { top: 16, right: 12, bottom: 26, left: 48 }
  const w = Math.max(0, width - pad.left - pad.right)
  const h = height - pad.top - pad.bottom
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const x = (i: number) =>
    pad.left + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w)
  const y = (v: number) => pad.top + h - (v / max) * h
  const path = data
    .map(
      (d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`,
    )
    .join(' ')
  const area = data.length
    ? `${path} L${x(data.length - 1)},${pad.top + h} L${x(0)},${pad.top + h} Z`
    : ''
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const labelEvery = Math.max(
    1,
    Math.ceil(data.length / Math.max(2, Math.floor(w / 70))),
  )
  const gradId = `lc-${color.replace('#', '')}-${dark ? 'd' : 'l'}`
  const gridColor = dark ? 'rgba(255,255,255,0.09)' : 'var(--line)'
  const textColor = dark ? 'rgba(244,242,234,0.55)' : 'var(--ink-3)'

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const px = e.clientX - rect.left - pad.left
            const i = Math.round((px / Math.max(1, w)) * (data.length - 1))
            setHover(Math.max(0, Math.min(data.length - 1, i)))
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0"
                stopColor={color}
                stopOpacity={dark ? 0.35 : 0.22}
              />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={pad.left + w}
                y1={y(t)}
                y2={y(t)}
                stroke={gridColor}
                strokeDasharray={t === 0 ? undefined : '3 4'}
              />
              <text
                x={pad.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill={textColor}
              >
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text
                key={d.label + i}
                x={x(i)}
                y={height - 6}
                textAnchor="middle"
                fontSize="11"
                fill={textColor}
              >
                {d.label}
              </text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gradId})`} />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover !== null && data[hover] && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={pad.top + h}
                stroke={dark ? 'rgba(255,255,255,0.3)' : 'var(--line-2)'}
              />
              <circle
                cx={x(hover)}
                cy={y(data[hover].value)}
                r="5"
                fill={color}
                stroke={dark ? 'var(--leaf-900)' : 'var(--paper)'}
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip
          x={x(hover)}
          y={y(data[hover].value)}
          title={data[hover].detail ?? data[hover].label}
          value={format(data[hover].value)}
          dark={dark}
        />
      )}
    </div>
  )
}

export function BarChart({
  data,
  height = 220,
  color = '#2f7350',
  highlightColor = '#1f8a4c',
  highlightIndex,
  format = (v: number) => String(v),
  ariaLabel,
}: {
  data: Array<Point>
  height?: number
  color?: string
  highlightColor?: string
  highlightIndex?: number
  format?: (v: number) => string
  ariaLabel: string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { top: 16, right: 8, bottom: 26, left: 36 }
  const w = Math.max(0, width - pad.left - pad.right)
  const h = height - pad.top - pad.bottom
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const slot = data.length ? w / data.length : 0
  const barW = Math.max(6, Math.min(34, slot * 0.56))
  const y = (v: number) => pad.top + h - (v / max) * h
  const ticks = [0, 0.5, 1].map((t) => t * max)

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={pad.left + w}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeDasharray={t === 0 ? undefined : '3 4'}
              />
              <text
                x={pad.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--ink-3)"
              >
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + slot * i + slot / 2
            const top = y(d.value)
            const bh = pad.top + h - top
            const r = Math.min(4, bh / 2, barW / 2)
            const isHi = i === (highlightIndex ?? -1)
            const fill = isHi ? highlightColor : color
            return (
              <g key={d.label + i} onMouseEnter={() => setHover(i)}>
                <rect
                  x={cx - slot / 2}
                  y={pad.top}
                  width={slot}
                  height={h}
                  fill="transparent"
                />
                {bh > 0 && (
                  <path
                    d={`M${cx - barW / 2},${pad.top + h} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${pad.top + h} Z`}
                    fill={fill}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isHi ? 'var(--ink)' : 'var(--ink-3)'}
                  fontWeight={isHi ? 700 : 400}
                >
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip
          x={pad.left + slot * hover + slot / 2}
          y={y(data[hover].value)}
          title={data[hover].detail ?? data[hover].label}
          value={format(data[hover].value)}
        />
      )}
    </div>
  )
}

export function DonutChart({
  data,
  size = 180,
  format = (v: number) => String(v),
  centerLabel,
  centerValue,
}: {
  data: Array<{ label: string; value: number; color: string }>
  size?: number
  format?: (v: number) => string
  centerLabel: string
  centerValue: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = size / 2 - 6
  const inner = r * 0.64
  const gap = 0.012 // radians of surface gap between segments
  let angle = -Math.PI / 2
  const arcs = data.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2
    const a0 = angle + (data.length > 1 ? gap : 0)
    const a1 = angle + sweep - (data.length > 1 ? gap : 0)
    angle += sweep
    return { ...d, a0, a1: Math.max(a0 + 0.001, a1) }
  })
  const pt = (rad: number, a: number) => [
    size / 2 + rad * Math.cos(a),
    size / 2 + rad * Math.sin(a),
  ]
  const arcPath = (a0: number, a1: number, ro: number, ri: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [x0, y0] = pt(ro, a0)
    const [x1, y1] = pt(ro, a1)
    const [x2, y2] = pt(ri, a1)
    const [x3, y3] = pt(ri, a0)
    return `M${x0},${y0} A${ro},${ro} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${large} 0 ${x3},${y3} Z`
  }
  const active = hover !== null ? data[hover] : null

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={`${centerLabel}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}
        >
          {arcs.map((a, i) => (
            <path
              key={a.label}
              d={arcPath(a.a0, a.a1, hover === i ? r + 4 : r, inner)}
              fill={a.color}
              opacity={hover === null || hover === i ? 1 : 0.45}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-semibold tracking-wide text-(--ink-3) uppercase">
            {active ? active.label : centerLabel}
          </span>
          <span className="crm-display text-2xl font-semibold text-(--ink)">
            {active
              ? `${Math.round((active.value / total) * 100)}%`
              : centerValue}
          </span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d, i) => (
          <li
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 py-1 text-[13px] transition-colors',
              hover === i && 'bg-(--sage)',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="min-w-0 flex-1 truncate text-(--ink-2)">
              {d.label}
            </span>
            <span className="font-semibold text-(--ink)">
              {format(d.value)}
            </span>
            <span className="w-9 text-right text-xs text-(--ink-3)">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Sparkline({
  values,
  color = '#2f7350',
  width = 96,
  height = 32,
}: {
  values: Array<number>
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const pts = values.map((v, i) => {
    const px = (i / (values.length - 1)) * (width - 4) + 2
    const py = height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
    return `${px.toFixed(1)},${py.toFixed(1)}`
  })
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
