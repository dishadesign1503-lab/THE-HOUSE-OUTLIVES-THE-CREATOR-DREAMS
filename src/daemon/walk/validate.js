// Can this layout be entered? Errors block entry; warnings explain what the walk will be like.

import { adjacencyPairs, GRID } from '../engine/layout.js'
import { ROOM_TYPES } from '../engine/rooms.js'

export const SIDES = [
  { id: 'N', dc: 0, dr: -1, rot: 0 },
  { id: 'E', dc: 1, dr: 0, rot: 90 },
  { id: 'S', dc: 0, dr: 1, rot: 180 },
  { id: 'W', dc: -1, dr: 0, rot: 270 },
]

// The side of the entrance that gets the front door: the side it faces if that side is open,
// otherwise the first open side.
export function frontDoorSide(entrance, rooms) {
  const taken = new Set(rooms.map((r) => `${r.col},${r.row}`))
  const open = SIDES.filter((s) => !taken.has(`${entrance.col + s.dc},${entrance.row + s.dr}`))
  return open.find((s) => s.rot === entrance.rotation % 360) ?? open[0] ?? null
}

export function validateLayout(rooms, { corridors = false } = {}) {
  const errors = []
  const warnings = []
  const entrances = rooms.filter((r) => r.type === 'entrance')
  if (rooms.length < 3) errors.push('A house needs at least three rooms.')
  if (!entrances.length) errors.push('Place the Entrance block: it is the way in.')
  const entrance = entrances[0]
  let door = null
  if (entrance) {
    if (entrance.dormant) errors.push('The entrance has gone dormant. Restore it in the upgrade shop before entering.')
    door = frontDoorSide(entrance, rooms)
    if (!door) errors.push('The entrance is surrounded by rooms on all four sides, so it has no front door. Free one side.')
  }

  // Which rooms can be walked to from the entrance (dormant rooms are sealed).
  const reachable = new Set()
  if (entrance && door) {
    const pairs = adjacencyPairs(rooms, { corridors })
    const byId = new Map(rooms.map((r) => [r.id, r]))
    const queue = [entrance.id]
    reachable.add(entrance.id)
    while (queue.length) {
      const id = queue.shift()
      for (const p of pairs) {
        const other = p.a === id ? p.b : p.b === id ? p.a : null
        if (!other || reachable.has(other) || byId.get(other).dormant) continue
        reachable.add(other)
        queue.push(other)
      }
    }
    const cut = rooms.filter((r) => !reachable.has(r.id))
    if (cut.length) {
      const names = cut.map((r) => ROOM_TYPES[r.type].label.toLowerCase())
      warnings.push(
        `${cut.length === 1 ? `The ${names[0]} cannot` : `${cut.length} rooms (${names.join(', ')}) cannot`} be reached from the entrance. You will only hear ${cut.length === 1 ? 'it' : 'them'} through the walls.`,
      )
    }
  }
  return { ok: errors.length === 0, errors, warnings, entrance, door, reachable, grid: GRID }
}
