import { localClockHour, sunElevation, sunTimes } from './solar'
import type { WorkWindow } from '../orgsClient'

// Daylight + working-hours model for one location, given the (server-resolved)
// work window for the person/office. Ported from the PlexiTeam prototype.

export type Daypart = 'night' | 'dawn' | 'day' | 'dusk'

export interface DaylightInfo {
  hour: number
  elevation: number
  part: Daypart
  label: string
  color: string
  working: boolean
  workLabel: string
  work: WorkWindow
  sunrise: number | null
  sunset: number | null
  polarDay: boolean
  polarNight: boolean
}

export const DAYPART_COLOR: Record<Daypart, string> = {
  night: '#5b6bd6',
  dawn: '#ff9d5c',
  day: '#ffce5a',
  dusk: '#ff7a8a'
}

export const DEFAULT_WORK: WorkWindow = { start: 9, end: 17 }

export function fmtHour(h: number | null): string {
  if (h == null) return '—'
  let hr = Math.floor(h) % 24
  const m = Math.round((h - Math.floor(h)) * 60) % 60
  const ampm = hr >= 12 ? 'PM' : 'AM'
  hr = hr % 12 || 12
  return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function fmtWindow(w: WorkWindow): string {
  const h = (n: number): string => {
    const hh = ((Math.floor(n) % 24) + 24) % 24
    const ampm = hh >= 12 ? 'pm' : 'am'
    return `${hh % 12 || 12}${ampm}`
  }
  return `${h(w.start)}–${h(w.end)}`
}

export function daylightFor(
  lat: number,
  lng: number,
  tzOffsetMin: number,
  now = new Date(),
  work: WorkWindow = DEFAULT_WORK
): DaylightInfo {
  const hour = localClockHour(tzOffsetMin, now)
  const elevation = sunElevation(lat, lng, now)
  const { sunrise, sunset, polarDay, polarNight } = sunTimes(lat, lng, tzOffsetMin, now)

  let part: Daypart
  if (elevation > 6) part = 'day'
  else if (elevation < -6) part = 'night'
  else part = hour < 12 ? 'dawn' : 'dusk'

  const label =
    part === 'day'
      ? 'Daytime'
      : part === 'night'
        ? hour < 5 || hour >= 22
          ? 'Night'
          : 'After dark'
        : part === 'dawn'
          ? 'Sunrise'
          : 'Sunset'

  const working = hour >= work.start && hour < work.end && elevation > -6
  const workLabel = working
    ? 'Working hours'
    : hour >= work.start - 3 && hour < work.start
      ? 'Early hours'
      : hour >= work.end && hour < work.end + 3
        ? 'Wrapping up'
        : 'After hours'

  return {
    hour,
    elevation,
    part,
    label,
    color: DAYPART_COLOR[part],
    working,
    workLabel,
    work,
    sunrise,
    sunset,
    polarDay,
    polarNight
  }
}

// CSS linear-gradient (left→right over 24h) where the bright band aligns with
// this location's real daylight, for the day-bar component.
export function dayBarGradient(info: DaylightInfo): string {
  if (info.polarDay) return 'linear-gradient(90deg, #ffce5a, #ffe7a8, #ffce5a)'
  if (info.polarNight) return 'linear-gradient(90deg, #1a2348, #232f5e, #1a2348)'
  const sr = ((info.sunrise ?? 6) / 24) * 100
  const ss = ((info.sunset ?? 18) / 24) * 100
  const noon = (sr + ss) / 2
  const c = (n: number): number => Math.max(0, Math.min(100, n))
  const NIGHT = '#16204a'
  const TWI = '#7a5aa6'
  const EDGE = '#ff9d5c'
  const DAY = '#ffd27a'
  const NOON = '#ffe9b0'
  return (
    `linear-gradient(90deg,` +
    ` ${NIGHT} 0%,` +
    ` ${NIGHT} ${c(sr - 7)}%,` +
    ` ${TWI} ${c(sr - 3)}%,` +
    ` ${EDGE} ${c(sr)}%,` +
    ` ${DAY} ${c(sr + 5)}%,` +
    ` ${NOON} ${c(noon)}%,` +
    ` ${DAY} ${c(ss - 5)}%,` +
    ` ${EDGE} ${c(ss)}%,` +
    ` ${TWI} ${c(ss + 3)}%,` +
    ` ${NIGHT} ${c(ss + 7)}%,` +
    ` ${NIGHT} 100%)`
  )
}
