// THE HOUSE: what has been built, unlocked and repaired. Pure data and functions.
//
// The 6 × 6 grid starts with only its 4 × 4 core built. The outer ring is unbuilt ground
// that opens wing by wing; a corner opens once both of its wings are open.

import { GRID } from '../engine/layout.js'
import { ROOM_TYPES } from '../engine/rooms.js'
import { INITIAL_COINS } from './economy.js'

const LAST = GRID - 1
const span = (fn) => Array.from({ length: GRID - 2 }, (_, i) => fn(i + 1))

export const WINGS = {
  north: { label: 'North wing', zone: 'N', cells: span((c) => [c, 0]) },
  east: { label: 'East wing', zone: 'E', cells: span((r) => [LAST, r]) },
  south: { label: 'South wing', zone: 'S', cells: span((c) => [c, LAST]) },
  west: { label: 'West wing', zone: 'W', cells: span((r) => [0, r]) },
}
export const CORNERS = [
  { cell: [LAST, 0], wings: ['north', 'east'] },
  { cell: [LAST, LAST], wings: ['south', 'east'] },
  { cell: [0, LAST], wings: ['south', 'west'] },
  { cell: [0, 0], wings: ['north', 'west'] },
]

export const BASE_TYPES = ['entrance', 'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'storage']

export function initialHouse() {
  return {
    coins: INITIAL_COINS,
    maxRooms: 8,
    wings: [],
    types: [...BASE_TYPES],
    features: {}, // doorways, jali, basin, ventilation, pipes, city, lamps
    neglected: [], // zone keys the house stopped maintaining
    stabilised: [], // zone keys braced against neglect
    purchases: {}, // upgrade id → times bought
  }
}

// Which cells can hold a room?
export function usableFn(house) {
  const open = new Set(house.wings)
  return (c, r) => {
    if (c < 0 || r < 0 || c > LAST || r > LAST) return false
    const inCore = c >= 1 && c <= LAST - 1 && r >= 1 && r <= LAST - 1
    if (inCore) return true
    const corner = CORNERS.find((k) => k.cell[0] === c && k.cell[1] === r)
    if (corner) return corner.wings.every((w) => open.has(w))
    if (r === 0) return open.has('north')
    if (c === LAST) return open.has('east')
    if (r === LAST) return open.has('south')
    return open.has('west')
  }
}

// The wing a locked cell belongs to (for labels on the board).
export function wingOf(c, r) {
  for (const [id, w] of Object.entries(WINGS)) if (w.cells.some(([x, y]) => x === c && y === r)) return id
  return null
}

export function openWingCells(house) {
  return Object.fromEntries(house.wings.map((id) => [id, WINGS[id].cells]))
}

// How many more of a room type may be placed.
export function remaining(house, rooms, type) {
  if (!house.types.includes(type)) return 0
  const used = rooms.filter((r) => r.type === type).length
  return Math.max(0, ROOM_TYPES[type].max - used)
}

// Options handed to the daemon's analysis so it hears the house as it is now.
export function layoutOptions(house) {
  return {
    corridors: !!house.features.doorways,
    neglected: house.neglected,
    wings: openWingCells(house),
    basin: !!house.features.basin,
    usable: usableFn(house),
  }
}
