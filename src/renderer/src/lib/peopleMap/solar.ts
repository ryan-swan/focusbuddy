// Real-enough solar geometry so daylight indicators are accurate, not faked.
// Computes sun elevation, the subsolar point (for the terminator), and local
// sunrise/sunset by latitude + date. Good to a few minutes, which is plenty.
// Ported from the PlexiTeam prototype; dependency-free.

const RAD = Math.PI / 180

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((d.getTime() - start) / 86_400_000)
}

function utcHours(d: Date): number {
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
}

// Solar declination (degrees), Cooper's approximation.
export function declination(date: Date): number {
  const n = dayOfYear(date)
  return -23.44 * Math.cos(RAD * (360 / 365) * (n + 10))
}

// Equation of time (minutes).
function equationOfTime(date: Date): number {
  const b = RAD * (360 / 365) * (dayOfYear(date) - 81)
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

// Sun elevation angle (degrees) at a point, now.
export function sunElevation(lat: number, lng: number, date: Date): number {
  const dec = declination(date)
  const tst = utcHours(date) + lng / 15 + equationOfTime(date) / 60 // true solar time hrs
  const H = (tst - 12) * 15 // hour angle, degrees
  const sin =
    Math.sin(lat * RAD) * Math.sin(dec * RAD) +
    Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(H * RAD)
  return Math.asin(Math.max(-1, Math.min(1, sin))) / RAD
}

// The point on Earth where the sun is directly overhead.
export function subsolarPoint(date: Date): { lat: number; lng: number } {
  const lng = (12 - utcHours(date) - equationOfTime(date) / 60) * 15
  return { lat: declination(date), lng: ((((lng + 180) % 360) + 360) % 360) - 180 }
}

export interface SunTimes {
  sunrise: number | null // local clock hour (0..24)
  sunset: number | null
  daylight: number // hours
  polarDay: boolean
  polarNight: boolean
}

// Sunrise / sunset in the location's local clock hours.
export function sunTimes(lat: number, lng: number, tzOffsetMin: number, date: Date): SunTimes {
  const dec = declination(date)
  const cosH = -Math.tan(lat * RAD) * Math.tan(dec * RAD)
  if (cosH < -1) return { sunrise: null, sunset: null, daylight: 24, polarDay: true, polarNight: false }
  if (cosH > 1) return { sunrise: null, sunset: null, daylight: 0, polarDay: false, polarNight: true }

  const H0 = Math.acos(cosH) / RAD // degrees
  const daylight = (2 * H0) / 15
  const noonUTC = 12 - lng / 15 - equationOfTime(date) / 60
  const noonLocal = noonUTC + tzOffsetMin / 60
  const norm = (h: number): number => ((h % 24) + 24) % 24
  return {
    sunrise: norm(noonLocal - daylight / 2),
    sunset: norm(noonLocal + daylight / 2),
    daylight,
    polarDay: false,
    polarNight: false
  }
}

// Current local clock hour (decimal) for a timezone offset.
export function localClockHour(tzOffsetMin: number, date = new Date()): number {
  return (((utcHours(date) + tzOffsetMin / 60) % 24) + 24) % 24
}
