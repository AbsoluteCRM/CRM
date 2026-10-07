import { addDays, format, startOfWeek } from 'date-fns'

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
}

export interface DayRoute {
  date: string
  stops: Array<RouteStop>
}

const CUSTOMERS = [
  ['Maria Alvarez', '800 Macleod Trail SE, Calgary, AB, Canada'],
  ['Tom Becker', '125 9 Ave SE, Calgary, AB, Canada'],
  ['Dana Whitfield', '601 9 Ave SW, Calgary, AB, Canada'],
  ['Hector Ruiz', '200 Barclay Parade SW, Calgary, AB, Canada'],
  ['Priya Nair', '1115 4 St SW, Calgary, AB, Canada'],
  ['Sam Okafor', '5111 Northland Dr NW, Calgary, AB, Canada'],
  ['Lena Fischer', '3625 Shaganappi Trail NW, Calgary, AB, Canada'],
  ['Carl Dunn', '1212 37 St SE, Calgary, AB, Canada'],
  ['Ruth Kaplan', '100 5 Ave SW, Calgary, AB, Canada'],
  ['Ben Ortiz', '2500 University Dr NW, Calgary, AB, Canada'],
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
      const [customer, address] = CUSTOMERS[(i + dayIndex) % CUSTOMERS.length]
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
      }
    })
    return { date, stops }
  })
}
