// THE HOUSE — editable architectural data, no interface code.
//
// A nine-square plan laid over the Vastu Purusha Mandala (north up, metres). Each room sits in
// one zone of the mandala and is conceptually part of the sleeping body: the reference zones and
// body regions are reused from the earlier daemon project (src/daemon/vastu/reference.js).
//
// Rooms are quads on a shared 4 × 4 lattice of corner points. Because neighbouring rooms share
// corners, the plan can deform (when the body moves) and stay connected.

import { ZONES } from '../../daemon/vastu/reference.js'

export const SIZE = 18
// Lattice lines. Slightly irregular, so the plan reads as a building rather than a diagram.
export const XS = [0, 5.6, 12.2, 18]
export const YS = [0, 6.2, 11.8, 18]
// The ideal mandala (equal squares). The restored ending relaxes the plan toward it.
export const IDEAL = [0, 6, 12, 18]

// region: the part of the Vastu Purusha lying under the room (see entity/skeleton.js).
// mass: thermal mass (stone and earth rooms change temperature more slowly).
// floor: initial floor material — stone, timber or wool (a rug).
export const ROOMS = [
  { id: 'guest', name: 'Guest Room', zone: 'NW', region: 'handNW', col: 0, row: 0, mass: 1.0, floor: 'timber' },
  { id: 'hall', name: 'Hall', zone: 'N', region: 'armN', col: 1, row: 0, mass: 1.1, floor: 'stone' },
  { id: 'prayer', name: 'Prayer Room', zone: 'NE', region: 'head', col: 2, row: 0, mass: 1.3, floor: 'stone' },
  { id: 'dining', name: 'Dining Room', zone: 'W', region: 'legW', col: 0, row: 1, mass: 1.0, floor: 'timber' },
  { id: 'court', name: 'Courtyard', zone: 'C', region: 'navel', col: 1, row: 1, mass: 1.5, floor: 'stone' },
  { id: 'study', name: 'Study', zone: 'E', region: 'armE', col: 2, row: 1, mass: 0.9, floor: 'timber' },
  { id: 'bedroom', name: 'Bedroom', zone: 'SW', region: 'feet', col: 0, row: 2, mass: 1.2, floor: 'timber' },
  { id: 'store', name: 'Store & Stair', zone: 'S', region: 'legS', col: 1, row: 2, mass: 1.4, floor: 'stone' },
  { id: 'kitchen', name: 'Kitchen', zone: 'SE', region: 'handSE', col: 2, row: 2, mass: 1.0, floor: 'stone' },
]
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]))
export const ROOM_IDS = ROOMS.map((r) => r.id)
export const roomOfRegion = Object.fromEntries(ROOMS.map((r) => [r.region, r.id]))

export function zoneInfo(roomId) {
  return ZONES[ROOM[roomId].zone]
}

// Openings between rooms. Arches are always open; doors can be opened and closed.
// t: position along the shared wall (0..1).
export const OPENINGS = [
  { id: 'd-guest-hall', a: 'guest', b: 'hall', kind: 'door', t: 0.55, open: true },
  { id: 'd-hall-prayer', a: 'hall', b: 'prayer', kind: 'door', t: 0.4, open: false },
  { id: 'a-hall-court', a: 'hall', b: 'court', kind: 'arch', t: 0.5 },
  { id: 'd-guest-dining', a: 'guest', b: 'dining', kind: 'door', t: 0.45, open: false },
  { id: 'a-dining-court', a: 'dining', b: 'court', kind: 'arch', t: 0.5 },
  { id: 'd-study-court', a: 'court', b: 'study', kind: 'door', t: 0.55, open: true },
  { id: 'd-prayer-study', a: 'prayer', b: 'study', kind: 'door', t: 0.35, open: false },
  { id: 'd-dining-bedroom', a: 'dining', b: 'bedroom', kind: 'door', t: 0.6, open: true },
  { id: 'a-court-store', a: 'court', b: 'store', kind: 'arch', t: 0.5 },
  { id: 'd-store-kitchen', a: 'store', b: 'kitchen', kind: 'door', t: 0.45, open: true },
  { id: 'd-study-kitchen', a: 'study', b: 'kitchen', kind: 'door', t: 0.6, open: false },
]
export const OPENING = Object.fromEntries(OPENINGS.map((o) => [o.id, o]))

// Openings to the outside. Wind comes from the north-west (Vayavya, the air corner), so
// north and west openings let air in and south and east openings let it out.
// The courtyard has a roof lantern: warm air leaves through it when it is open.
export const WINDOWS = [
  { id: 'front', room: 'hall', side: 'N', t: 0.5, kind: 'frontdoor', open: false },
  { id: 'w-guest-n', room: 'guest', side: 'N', t: 0.45, open: false },
  { id: 'w-guest-w', room: 'guest', side: 'W', t: 0.5, open: false },
  { id: 'w-prayer-n', room: 'prayer', side: 'N', t: 0.6, open: false },
  { id: 'w-prayer-e', room: 'prayer', side: 'E', t: 0.5, open: false },
  { id: 'w-dining-w', room: 'dining', side: 'W', t: 0.5, open: false },
  { id: 'w-study-e', room: 'study', side: 'E', t: 0.45, open: false },
  { id: 'w-bedroom-w', room: 'bedroom', side: 'W', t: 0.5, open: true }, // the unexplained draft
  { id: 'w-bedroom-s', room: 'bedroom', side: 'S', t: 0.5, open: false },
  { id: 'w-store-s', room: 'store', side: 'S', t: 0.5, open: false },
  { id: 'w-kitchen-e', room: 'kitchen', side: 'E', t: 0.5, open: false },
  { id: 'w-kitchen-s', room: 'kitchen', side: 'S', t: 0.55, open: false },
  { id: 'lantern', room: 'court', side: 'roof', u: 0.5, v: 0.5, kind: 'lantern', open: false },
]
export const WINDOW = Object.fromEntries(WINDOWS.map((w) => [w.id, w]))
export const windward = (w) => w.side === 'N' || w.side === 'W'

// Things in the house the visitor can operate. (u, v) is the position inside the room (0..1).
//   radiator  heat, 0..3
//   stove     heat + the smell of food (and smoke, if it is left too long)
//   phone     a ringing telephone
//   speaker   a radio that plays until switched off
//   knocker   a knock at the front door
//   heavy     a heavy piece of furniture that can be shifted (vibration)
//   machine   a machine with a motor (vibration, hum)
//   incense   a familiar scent
//   flowers   a mild scent
//   extractor a kitchen fan that pulls air out
export const OBJECTS = [
  { id: 'rad-guest', room: 'guest', kind: 'radiator', u: 0.18, v: 0.82, level: 1 },
  { id: 'rad-hall', room: 'hall', kind: 'radiator', u: 0.82, v: 0.2, level: 1 },
  { id: 'rad-dining', room: 'dining', kind: 'radiator', u: 0.16, v: 0.25, level: 1 },
  { id: 'rad-study', room: 'study', kind: 'radiator', u: 0.8, v: 0.78, level: 1 },
  { id: 'rad-bedroom', room: 'bedroom', kind: 'radiator', u: 0.2, v: 0.82, level: 1 },
  { id: 'rad-prayer', room: 'prayer', kind: 'radiator', u: 0.82, v: 0.82, level: 1 },
  { id: 'stove', room: 'kitchen', kind: 'stove', u: 0.75, v: 0.3, on: false },
  { id: 'extractor', room: 'kitchen', kind: 'extractor', u: 0.88, v: 0.15, on: false },
  { id: 'phone', room: 'hall', kind: 'phone', u: 0.25, v: 0.3 },
  { id: 'radio', room: 'study', kind: 'speaker', u: 0.3, v: 0.25, on: false },
  { id: 'knocker', room: 'hall', kind: 'knocker', u: 0.5, v: 0.1 },
  { id: 'wardrobe', room: 'bedroom', kind: 'heavy', u: 0.75, v: 0.3, label: 'Wardrobe' },
  { id: 'chest', room: 'store', kind: 'heavy', u: 0.3, v: 0.7, label: 'Iron chest' },
  { id: 'washer', room: 'guest', kind: 'machine', u: 0.75, v: 0.7, label: 'Washing machine', on: false },
  { id: 'pump', room: 'store', kind: 'machine', u: 0.75, v: 0.3, label: 'Water pump', on: false },
  { id: 'fridge', room: 'kitchen', kind: 'machine', u: 0.2, v: 0.75, label: 'Refrigerator', on: true },
  { id: 'incense', room: 'prayer', kind: 'incense', u: 0.35, v: 0.4 },
  { id: 'flowers', room: 'court', kind: 'flowers', u: 0.3, v: 0.3, on: false },
]
export const OBJECT = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))
export const objectsIn = (roomId) => OBJECTS.filter((o) => o.room === roomId)

export const FLOORS = {
  stone: { label: 'Stone', contact: -2.5, damp: 1.0, warmth: 0 },
  timber: { label: 'Timber', contact: 0, damp: 0.8, warmth: 0.02 },
  wool: { label: 'Wool rug', contact: 1.5, damp: 0.45, warmth: 0.05 },
}
export const FLOOR_ORDER = ['stone', 'timber', 'wool']

// ---------- geometry ----------

export function restLattice() {
  const pts = []
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pts.push({ x: XS[i], y: YS[j] })
  return pts
}
export const LP = (i, j) => j * 4 + i

// Corner indices of a room, clockwise from the north-west.
export function roomCorners(room) {
  const { col: c, row: r } = room
  return [LP(c, r), LP(c + 1, r), LP(c + 1, r + 1), LP(c, r + 1)]
}

export function roomCentre(room, lattice) {
  const pts = roomCorners(room).map((k) => lattice[k])
  return { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 }
}

// A point inside a room, by bilinear position (u east, v south).
export function roomPoint(room, lattice, u, v) {
  const [a, b, c, d] = roomCorners(room).map((k) => lattice[k])
  const top = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
  const bot = { x: d.x + (c.x - d.x) * u, y: d.y + (c.y - d.y) * u }
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v }
}

// The wall segment of a room on one side.
export function sideSegment(room, lattice, side) {
  const [a, b, c, d] = roomCorners(room).map((k) => lattice[k])
  return { N: [a, b], E: [b, c], S: [d, c], W: [a, d] }[side]
}

// The shared wall between two adjacent rooms (as a segment), and the side of `a` it lies on.
export function sharedWall(aId, bId, lattice) {
  const a = ROOM[aId]
  const b = ROOM[bId]
  let side = null
  if (b.col === a.col + 1 && b.row === a.row) side = 'E'
  else if (b.col === a.col - 1 && b.row === a.row) side = 'W'
  else if (b.row === a.row + 1 && b.col === a.col) side = 'S'
  else if (b.row === a.row - 1 && b.col === a.col) side = 'N'
  if (!side) return null
  return { side, seg: sideSegment(a, lattice, side) }
}

export const along = ([p, q], t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })

export function openingPoint(o, lattice) {
  return along(sharedWall(o.a, o.b, lattice).seg, o.t)
}

export function windowPoint(w, lattice) {
  const room = ROOM[w.room]
  if (w.side === 'roof') return roomPoint(room, lattice, w.u, w.v)
  return along(sideSegment(room, lattice, w.side), w.t)
}

// Rooms that share a wall (whether or not there is an opening in it).
export const ADJACENT = []
for (const a of ROOMS) {
  for (const b of ROOMS) {
    if (a.id < b.id && Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1) ADJACENT.push([a.id, b.id])
  }
}
export const CENTRE = { x: SIZE / 2, y: SIZE / 2 }
