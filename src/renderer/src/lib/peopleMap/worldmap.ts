// A dot-matrix world map generated from coarse continent boxes. Land renders as
// a grid of dots, and real lat/lng projects onto the same equirectangular space
// so office/person pins land on land. Ported from the PlexiTeam prototype.

export const COLS = 72
export const ROWS = 34

// [latMin, latMax, lngMin, lngMax]
const BOXES: [number, number, number, number][] = [
  // North America
  [50, 71, -160, -95], [35, 55, -125, -65], [25, 40, -120, -80], [15, 30, -110, -88],
  // Central America
  [8, 18, -92, -78],
  // South America
  [0, 12, -80, -50], [-20, 0, -75, -40], [-25, -15, -50, -40], [-40, -20, -72, -55], [-55, -40, -73, -64],
  // Europe
  [40, 60, -10, 30], [55, 70, 8, 42], [36, 45, -10, 28],
  // Africa
  [12, 33, -14, 35], [0, 15, -16, 42], [-15, 2, 11, 42], [-35, -15, 14, 33],
  // Middle East
  [15, 39, 33, 60],
  // Asia
  [40, 64, 28, 142], [20, 42, 58, 122], [8, 28, 68, 90], [20, 42, 100, 124], [30, 46, 127, 146],
  // SE Asia + islands
  [-9, 16, 94, 120], [-10, 6, 108, 142],
  // Australia + NZ
  [-39, -11, 113, 154], [-47, -34, 165, 179]
]

function cellToLatLng(col: number, row: number): [number, number] {
  const lng = -180 + (col + 0.5) * (360 / COLS)
  const lat = 90 - (row + 0.5) * (180 / ROWS)
  return [lat, lng]
}

// Centre lat/lng of a grid cell, for terminator shading.
export function cellCenter(col: number, row: number): { lat: number; lng: number } {
  const [lat, lng] = cellToLatLng(col, row)
  return { lat, lng }
}

export const LAND: Set<string> = (() => {
  const set = new Set<string>()
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const [lat, lng] = cellToLatLng(col, row)
      for (const [la0, la1, lo0, lo1] of BOXES) {
        if (lat >= la0 && lat <= la1 && lng >= lo0 && lng <= lo1) {
          set.add(`${col},${row}`)
          break
        }
      }
    }
  }
  return set
})()

// Project lat/lng to a 0..1 fractional position on the map rect.
export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: (lng + 180) / 360, y: (90 - lat) / 180 }
}
