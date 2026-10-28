// Distance in metres and the hot-and-cold scale.

const EARTH_RADIUS_M = 6371008.8

// Great-circle distance between two { lat, lon } points, in metres (haversine formula).
export function distanceMetres(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Within this distance the player can confirm the find.
export const FIND_RADIUS_M = 10

// From hottest to coldest. `max` is the upper edge of the band in metres.
export const HEAT_LEVELS = [
  { key: 'very-hot', label: 'Very hot', range: 'within 10 m', max: 10, color: '#d62828' },
  { key: 'hot', label: 'Hot', range: '10–50 m', max: 50, color: '#f0592b' },
  { key: 'warm', label: 'Warm', range: '50–200 m', max: 200, color: '#f4a62a' },
  { key: 'cold', label: 'Cold', range: '200–500 m', max: 500, color: '#2bb5c9' },
  { key: 'very-cold', label: 'Very cold', range: 'more than 500 m', max: Infinity, color: '#2f5fc4' },
]

// The smooth gradient used to colour buildings: [distance in metres, colour].
// Each band's colour sits in the middle of that band, so the gradient and the bands agree.
export const HEAT_GRADIENT = [
  [5, '#d62828'],
  [30, '#f0592b'],
  [125, '#f4b62a'],
  [350, '#2bb5c9'],
  [700, '#2f5fc4'],
]

// Buildings this close to the player show their heat; between the two radii they fade out.
// Further away they stay neutral, so the map doesn't give the target away from afar.
export const LANTERN_FULL_M = 100
export const LANTERN_FADE_M = 180

export function heatFor(distance) {
  return HEAT_LEVELS.find((level) => distance <= level.max)
}

// Changes smaller than this are treated as standing still, so GPS jitter
// doesn't flip the hint between "warmer" and "colder".
const TREND_DEADBAND_M = 3

export function trendBetween(previous, current) {
  if (previous == null) return null
  if (current < previous - TREND_DEADBAND_M) return 'warmer'
  if (current > previous + TREND_DEADBAND_M) return 'colder'
  return 'same'
}
