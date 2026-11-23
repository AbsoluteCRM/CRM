import { addDays, format, startOfWeek } from 'date-fns'

import type { LonLat } from '#/lib/map/geo'

export type StopStatus = 'scheduled' | 'in-progress' | 'completed'

export interface RouteStop {
  id: string
  time: string
  customer: string
  address: string
  jobType: string
  status: StopStatus
  durationMinutes: number
  notes?: string
  /** The property's lon/lat; stops without one are listed under the map. */
  location?: LonLat | null
  /** Set when stops come from real crews; the calendar then shows one route per crew. */
  crew?: { id: string; name: string; color: string }
}

/** What the "Update" dialog can change on a stop. */
export interface StopUpdate {
  status: StopStatus
  date: string // yyyy-MM-dd
  time: string // HH:mm
  durationMinutes: number
  notes: string
}

export interface DayRoute {
  date: string
  stops: Array<RouteStop>
}

// Approximate lon/lat for each address (demo data).
const CUSTOMERS = [
  [
    'Maria Alvarez',
    '800 Macleod Trail SE, Calgary, AB, Canada',
    -114.0573,
    51.0453,
  ],
  ['Tom Becker', '125 9 Ave SE, Calgary, AB, Canada', -114.0606, 51.0444],
  ['Dana Whitfield', '601 9 Ave SW, Calgary, AB, Canada', -114.0768, 51.0452],
  [
    'Hector Ruiz',
    '200 Barclay Parade SW, Calgary, AB, Canada',
    -114.0716,
    51.0533,
  ],
  ['Priya Nair', '1115 4 St SW, Calgary, AB, Canada', -114.0733, 51.0408],
  [
    'Sam Okafor',
    '5111 Northland Dr NW, Calgary, AB, Canada',
    -114.1605,
    51.0958,
  ],
  [
    'Lena Fischer',
    '3625 Shaganappi Trail NW, Calgary, AB, Canada',
    -114.1557,
    51.0853,
  ],
  ['Carl Dunn', '1212 37 St SE, Calgary, AB, Canada', -113.9853, 51.0393],
  ['Ruth Kaplan', '100 5 Ave SW, Calgary, AB, Canada', -114.0646, 51.0486],
  [
    'Ben Ortiz',
    '2500 University Dr NW, Calgary, AB, Canada',
    -114.1305,
    51.0784,
  ],
] as const

const JOB_TYPES = [
  'Lawn mowing',
  'Gutter cleaning',
  'HVAC tune-up',
  'Pressure washing',
  'Irrigation repair',
]
const STATUSES: Array<StopStatus> = ['completed', 'in-progress', 'scheduled']
const COUNTS = [8, 10, 6, 9, 7, 4, 0]

export function getMockWeekRoutes(weekAnchor: Date): Array<DayRoute> {
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 })
  return COUNTS.map((count, dayIndex) => {
    const date = format(addDays(weekStart, dayIndex), 'yyyy-MM-dd')
    const stops = Array.from({ length: count }, (_, i): RouteStop => {
      const [customer, address, lon, lat] =
        CUSTOMERS[(i + dayIndex) % CUSTOMERS.length]
      const startMinutes = 8 * 60 + i * 60
      return {
        id: `${date}-${i}`,
        time: `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`,
        customer,
        address,
        jobType: JOB_TYPES[(i + dayIndex) % JOB_TYPES.length],
        status: STATUSES[(i + dayIndex) % STATUSES.length],
        durationMinutes: 30 + ((i * 15) % 60),
        notes: i % 3 === 0 ? 'Gate code 4821. Dog in backyard.' : undefined,
        location: { lon, lat },
      }
    })
    return { date, stops }
  })
}
