// Spatial calculations on the 9 × 9 grid. Column 0 is west, row 0 is north.
// Everything here is computed from the rooms list, never stored separately,
// so adjacency can't drift out of sync with what is on the board.

import { ROOM_TYPES, footprint } from './rooms.js'

export const GRID = 6
// The middle 2 × 2 cells: the open centre of the house (Brahmasthan).
export const CENTRE = { min: 2, max: 3 }

export function cellsOf(room) {
  const { w, h } = footprint(room.type, room.rotation)
  const cells = []
  for (let c = room.col; c < room.col + w; c++) {
    for (let r = room.row; r < room.row + h; r++) cells.push([c, r])
  }
  return cells
}

const key = (c, r) => `${c},${r}`
const anyCell = () => true

export function occupancy(rooms, exceptId) {
  const map = new Map()
  for (const room of rooms) {
    if (room.id === exceptId) continue
    for (const [c, r] of cellsOf(room)) map.set(key(c, r), room.id)
  }
  return map
}

// Can a room of this type sit at (col, row) without leaving the grid, leaving the usable
// (unlocked) part of the house, or overlapping another room?
export function canPlace(rooms, candidate, usable = anyCell) {
  const { w, h } = footprint(candidate.type, candidate.rotation)
  if (candidate.col < 0 || candidate.row < 0) return false
  if (candidate.col + w > GRID || candidate.row + h > GRID) return false
  const occ = occupancy(rooms, candidate.id)
  return cellsOf(candidate).every(([c, r]) => usable(c, r) && !occ.has(key(c, r)))
}

// Zone of a single cell: thirds of the grid.
export function zoneOfCell(c, r) {
  const ns = r < 2 ? 'N' : r > 3 ? 'S' : ''
  const ew = c < 2 ? 'W' : c > 3 ? 'E' : ''
  return ns + ew || 'C'
}

// Eight compass zones plus the centre, from the room's centroid.
// A centroid on a third-line counts toward the edge, so only rooms truly in the middle are "centre".
export function zoneOf(room) {
  const { w, h } = footprint(room.type, room.rotation)
  const cx = room.col + w / 2
  const cy = room.row + h / 2
  const ns = cy <= 2 ? 'N' : cy >= 4 ? 'S' : ''
  const ew = cx <= 2 ? 'W' : cx >= 4 ? 'E' : ''
  return ns + ew || 'C'
}

export const ZONE_NAMES = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
  C: 'centre',
}

export const ZONE_ADJECTIVE = {
  N: 'northern',
  NE: 'north-eastern',
  E: 'eastern',
  SE: 'south-eastern',
  S: 'southern',
  SW: 'south-western',
  W: 'western',
  NW: 'north-western',
  C: 'central',
}

export function centroid(room) {
  const { w, h } = footprint(room.type, room.rotation)
  return { x: room.col + w / 2, y: room.row + h / 2 }
}

// Two rooms are connected when they share at least one cell edge ("door").
// With `corridors`, rooms facing each other across one empty cell also connect ("corridor").
export function adjacencyPairs(rooms, { corridors = false } = {}) {
  const occ = occupancy(rooms)
  const pairs = new Map()
  const add = (a, b, edge, kind) => {
    const id = [a, b].sort().join('|')
    if (!pairs.has(id)) pairs.set(id, { a, b, edges: [], kind })
    const p = pairs.get(id)
    if (kind === 'door' && p.kind === 'corridor') {
      p.kind = 'door'
      p.edges = []
    }
    if (p.kind === kind) p.edges.push(edge)
  }
  for (const room of rooms) {
    for (const [c, r] of cellsOf(room)) {
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const other = occ.get(key(c + dc, r + dr))
        if (other && other !== room.id) add(room.id, other, { c, r, dc, dr }, 'door')
        else if (corridors && !other) {
          const far = occ.get(key(c + 2 * dc, r + 2 * dr))
          if (far && far !== room.id) add(room.id, far, { c, r, dc, dr }, 'corridor')
        }
      }
    }
  }
  return [...pairs.values()]
}

function components(rooms, pairs) {
  const parent = new Map(rooms.map((r) => [r.id, r.id]))
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)))
  for (const { a, b } of pairs) parent.set(find(a), find(b))
  const groups = new Map()
  for (const r of rooms) {
    const root = find(r.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(r.id)
  }
  return [...groups.values()]
}

// Does the room touch the outside of the house (the grid edge or a cell not yet built)?
export function onEdge(room, usable = anyCell) {
  return cellsOf(room).some(([c, r]) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
      const x = c + dc
      const y = r + dr
      return x < 0 || y < 0 || x >= GRID || y >= GRID || !usable(x, y)
    }),
  )
}

// A short text key for a layout: same rooms in the same places → same key.
export function signature(rooms) {
  return rooms
    .map((r) => `${r.type}@${r.col},${r.row},${r.rotation % 180}`)
    .sort()
    .join(';')
}

// Everything the interpretation layer may want to know about one arrangement.
// Options describe the house around the rooms:
//   corridors  — open doorways connect rooms across one empty cell
//   neglected  — zone keys the house has stopped maintaining
//   wings      — { id: [[c, r], …] } wings that have been opened
//   basin      — a water basin sits in the Brahmasthan
export function analyse(rooms, opts = {}) {
  const pairs = adjacencyPairs(rooms, opts)
  const neighbours = new Map(rooms.map((r) => [r.id, new Set()]))
  for (const { a, b } of pairs) {
    neighbours.get(a).add(b)
    neighbours.get(b).add(a)
  }
  const byId = new Map(rooms.map((r) => [r.id, r]))
  const info = rooms.map((r) => ({
    ...r,
    label: ROOM_TYPES[r.type].label,
    zone: zoneOf(r),
    centroid: centroid(r),
    neighbours: [...neighbours.get(r.id)],
    neighbourTypes: [...neighbours.get(r.id)].map((id) => byId.get(id).type),
    cells: cellsOf(r),
    onEdge: onEdge(r, opts.usable),
  }))
  const groups = components(rooms, pairs)
  const counts = {}
  for (const r of rooms) counts[r.type] = (counts[r.type] || 0) + 1

  let centreCells = 0
  let massX = 0
  let massY = 0
  let mass = 0
  const occupied = new Set()
  for (const r of info) {
    for (const [c, rr] of r.cells) {
      if (c >= CENTRE.min && c <= CENTRE.max && rr >= CENTRE.min && rr <= CENTRE.max) centreCells++
      massX += c + 0.5
      massY += rr + 0.5
      mass++
      occupied.add(key(c, rr))
    }
  }
  // How far the built mass leans away from the centre, in cells.
  const lean = mass ? { x: massX / mass - GRID / 2, y: massY / mass - GRID / 2 } : { x: 0, y: 0 }
  const emptyWings = Object.entries(opts.wings ?? {})
    .filter(([, cells]) => !cells.some(([c, r]) => occupied.has(key(c, r))))
    .map(([id]) => id)

  return {
    rooms: info,
    byId: new Map(info.map((r) => [r.id, r])),
    pairs,
    groups,
    isolated: info.filter((r) => r.neighbours.length === 0 && rooms.length > 1),
    counts,
    centreCells,
    lean,
    filled: mass / (GRID * GRID),
    signature: signature(rooms),
    neglected: opts.neglected ?? [],
    emptyWings,
    basin: !!opts.basin,
  }
}

// What changed between two arrangements.
export function diff(prevRooms, nextRooms) {
  const prev = new Map(prevRooms.map((r) => [r.id, r]))
  const next = new Map(nextRooms.map((r) => [r.id, r]))
  const added = nextRooms.filter((r) => !prev.has(r.id))
  const removed = prevRooms.filter((r) => !next.has(r.id))
  const moved = nextRooms.filter((r) => {
    const p = prev.get(r.id)
    return p && (p.col !== r.col || p.row !== r.row || p.rotation !== r.rotation)
  })
  const total = Math.max(prevRooms.length, nextRooms.length, 1)
  const magnitude = Math.min(1, (added.length + removed.length + moved.length * 0.8) / Math.max(3, total * 0.6))
  return { added, removed, moved, magnitude, any: added.length + removed.length + moved.length > 0 }
}
