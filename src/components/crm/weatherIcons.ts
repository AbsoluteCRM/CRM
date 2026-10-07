import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react'

import type { LucideIcon } from 'lucide-react'
import type { WeatherCondition } from './store'

export const WEATHER_ICON: Record<WeatherCondition, LucideIcon> = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  wind: Wind,
}
