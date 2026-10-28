// FROM PLAN TO BUILDING. Turns the 6 × 6 layout into walls, doors, floors and windows, in metres.
// One cell = a 4 m × 4 m room, 3 m high. Column → x (east), row → z (south); north is −z.
// The same boxes are drawn and used for collision, so what you see is what stops you.

import { adjacencyPairs } from '../engine/layout.js'
import { SIDES } from './validate.js'

export const S = 4 // cell size (m)
export const H = 3 // wall height
export const T = 0.18 // wall thickness
export const DOOR_W = 1.3
export const DOOR_H = 2.3
const LOW_H = 1.1 // courtyard parapet
const WINDOWED = new Set(['living', 'bedroom', 'kitchen', 'dining', 'study', 'prayer', 'entrance', 'bathroom'])

const key = (c, r) => `${c},${r}`

export function cellCentre(c, r) {
  return { x: c * S + S / 2, z: r * S + S / 2 }
}

// Boxes along one cell edge: a full wall, or two jambs and a lintel around a door.
function edgeBoxes(c, r, side, { kind, door = false, boarded = false, height = H }) {
  const horizontal = side === 'N' || side === 'S'
  const along0 = horizontal ? c * S : r * S
  const across = side === 'N' ? r * S : side === 'S' ? (r + 1) * S : side === 'W' ? c * S : (c + 1) * S
  const box = (a0, a1, y0, y1, k = kind) => {
    const len = a1 - a0
    const mid = (a0 + a1) / 2
    return horizontal
      ? { x: mid, z: across, w: len, d: T, y: (y0 + y1) / 2, h: y1 - y0, kind: k, side, collide: y0 < 1 }
      : { x: across, z: mid, w: T, d: len, y: (y0 + y1) / 2, h: y1 - y0, kind: k, side, collide: y0 < 1 }
  }
  const a0 = along0 - T / 2
  const a1 = along0 + S + T / 2
  if (!door && !boarded) return [box(a0, a1, 0, height)]
  const mid = along0 + S / 2
  const out = [box(a0, mid - DOOR_W / 2, 0, height), box(mid + DOOR_W / 2, a1, 0, height), box(mid - DOOR_W / 2, mid + DOOR_W / 2, DOOR_H, height, 'lintel')]
  if (boarded) out.push({ ...box(mid - DOOR_W / 2, mid + DOOR_W / 2, 0, DOOR_H, 'board') })
  return out
}

export function buildHouse(rooms, { corridors = false, entrance, door, reachable }) {
  const cells = new Map(rooms.map((r) => [key(r.col, r.row), { ...r, cellType: r.type }]))

  // Corridor cells: an empty cell between two rooms joined by an open doorway.
  const corridorSides = new Map() // cell key → Set of sides that open
  if (corridors) {
    for (const p of adjacencyPairs(rooms, { corridors: true })) {
      if (p.kind !== 'corridor') continue
      for (const e of p.edges) {
        const cc = e.c + e.dc
        const cr = e.r + e.dr
        const k = key(cc, cr)
        if (!corridorSides.has(k)) corridorSides.set(k, new Set())
        const s = corridorSides.get(k)
        if (e.dc) s.add('W').add('E')
        else s.add('N').add('S')
        if (!cells.has(k)) cells.set(k, { id: `corridor-${k}`, col: cc, row: cr, type: 'corridor', cellType: 'corridor' })
      }
    }
  }

  const boxes = []
  const windows = []
  const doors = []
  const walkable = (cell) => cell && !cell.dormant && (cell.cellType === 'corridor' || !reachable || reachable.has(cell.id))
  for (const cell of cells.values()) {
    const { col: c, row: r } = cell
    for (const side of SIDES) {
      const nb = cells.get(key(c + side.dc, r + side.dr))
      // Each shared edge is built once, from its north / west cell or from the room facing outside.
      if (nb && (side.id === 'E' || side.id === 'S')) continue
      const isFront = entrance && cell.id === entrance.id && door && side.id === door.id
      if (nb) {
        const corridorOpen = (x) => x.cellType === 'corridor' && corridorSides.get(key(x.col, x.row))?.has(x === cell ? side.id : opposite(side.id))
        const roomPair = cell.cellType !== 'corridor' && nb.cellType !== 'corridor'
        const open = roomPair || corridorOpen(cell) || corridorOpen(nb)
        const boarded = open && (cell.dormant || nb.dormant)
        boxes.push(...edgeBoxes(c, r, side.id, { kind: 'wall', door: open && !boarded, boarded }))
        if (open && !boarded) doors.push({ ...edgeMid(c, r, side.id), a: cell.id, b: nb.id })
      } else if (isFront) {
        boxes.push(...edgeBoxes(c, r, side.id, { kind: 'ext', door: true }))
        doors.push({ ...edgeMid(c, r, side.id), a: cell.id, b: 'outside', front: true })
      } else if (cell.cellType === 'garden') {
        boxes.push(...edgeBoxes(c, r, side.id, { kind: 'low', height: LOW_H }))
      } else {
        boxes.push(...edgeBoxes(c, r, side.id, { kind: 'ext' }))
        if (WINDOWED.has(cell.cellType) && windows.filter((w) => w.roomId === cell.id).length < 2) {
          windows.push({ ...edgeMid(c, r, side.id), roomId: cell.id, side: side.id })
        }
      }
    }
  }

  // The porch outside the front door: a small enclosed landing that counts as "outside".
  let porch = null
  let spawn = { x: S / 2, z: S / 2, yaw: 0 }
  if (entrance && door) {
    const m = edgeMid(entrance.col, entrance.row, door.id)
    const depth = 2.4
    const half = 1.6
    const cx = m.x + door.dc * depth / 2
    const cz = m.z + door.dr * depth / 2
    porch = { x: cx, z: cz, w: door.dc ? depth : half * 2, d: door.dc ? half * 2 : depth, side: door.id }
    // invisible rails around the porch
    const rail = (x, z, w, d) => boxes.push({ x, z, w, d, y: 0.5, h: 1, kind: 'rail', collide: true })
    if (door.dc) {
      rail(cx, cz - half, depth, 0.1)
      rail(cx, cz + half, depth, 0.1)
      rail(m.x + door.dc * depth, cz, 0.1, half * 2)
    } else {
      rail(cx - half, cz, 0.1, depth)
      rail(cx + half, cz, 0.1, depth)
      rail(cx, m.z + door.dr * depth, half * 2, 0.1)
    }
    const centre = cellCentre(entrance.col, entrance.row)
    const fx = -door.dc
    const fz = -door.dr
    spawn = { x: centre.x + door.dc * 0.9, z: centre.z + door.dr * 0.9, yaw: Math.atan2(-fx, -fz) }
  }

  return {
    cells: [...cells.values()].map((cell) => ({ ...cell, ...cellCentre(cell.col, cell.row), walkable: walkable(cell) })),
    boxes,
    colliders: boxes.filter((b) => b.collide),
    windows,
    doors,
    porch,
    spawn,
  }
}

function opposite(id) {
  return { N: 'S', S: 'N', E: 'W', W: 'E' }[id]
}

function edgeMid(c, r, side) {
  const o = cellCentre(c, r)
  const dx = side === 'E' ? S / 2 : side === 'W' ? -S / 2 : 0
  const dz = side === 'S' ? S / 2 : side === 'N' ? -S / 2 : 0
  return { x: o.x + dx, z: o.z + dz }
}

export function cellAt(x, z) {
  return { col: Math.floor(x / S), row: Math.floor(z / S) }
}
