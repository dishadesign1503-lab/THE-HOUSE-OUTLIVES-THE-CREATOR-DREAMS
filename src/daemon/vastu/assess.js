// Vastu assessment of rooms on the board. Pure functions: no interface code.
// `opts.usable(c, r)` says which cells are built (unlocked); it decides what counts as the
// outer boundary and where alternatives may be suggested.

import { ZONES, ROOM_RULES, CENTRE_RULE } from './reference.js'
import { BODY_REGIONS, STATUS } from './responses.js'
import { canPlace, cellsOf, onEdge, zoneOf, zoneOfCell, GRID, CENTRE } from '../engine/layout.js'
import { ROOM_TYPES, footprint } from '../engine/rooms.js'

export { zoneOfCell }

const LETTERS = 'ABCDEFGHI'
const worse = (a, b) => (STATUS[a].rank >= STATUS[b].rank ? a : b)
const ZONE_SIZE = GRID / 3

// The block of cells that a zone covers (2 × 2 on the 6 × 6 grid).
export function zoneBounds(zone) {
  const col = zone.includes('W') ? 0 : zone.includes('E') ? 2 * ZONE_SIZE : ZONE_SIZE
  const row = zone.includes('N') ? 0 : zone.includes('S') ? 2 * ZONE_SIZE : ZONE_SIZE
  return { col, row, w: ZONE_SIZE, h: ZONE_SIZE }
}

// Primary zone = the zone holding most of the room's cells; ties go to the zone of its centre.
export function zonesOf(room) {
  const counts = {}
  for (const [c, r] of cellsOf(room)) {
    const z = zoneOfCell(c, r)
    counts[z] = (counts[z] || 0) + 1
  }
  const centroidZone = zoneOf(room)
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (b === centroidZone) - (a === centroidZone))
  return { primary: sorted[0], secondary: sorted.slice(1), counts }
}

export function gridRef(room) {
  const { w, h } = footprint(room.type, room.rotation)
  const a = `${LETTERS[room.col]}${room.row + 1}`
  if (w === 1 && h === 1) return a
  return `${a}–${LETTERS[room.col + w - 1]}${room.row + h}`
}

function centreCellsOf(room) {
  return cellsOf(room).filter(([c, r]) => c >= CENTRE.min && c <= CENTRE.max && r >= CENTRE.min && r <= CENTRE.max).length
}

// Status only (used for the full assessment and for searching alternatives).
function evaluate(room, opts = {}) {
  const rule = ROOM_RULES[room.type]
  const { primary, secondary } = zonesOf(room)
  const zoneStatus = rule.aligned.includes(primary) ? 'aligned' : rule.conflict.includes(primary) ? 'conflict' : 'review'
  let status = zoneStatus
  let centreStatus = null
  const centreCells = centreCellsOf(room)
  if (centreCells >= CENTRE_RULE.minCells || primary === 'C') {
    centreStatus = CENTRE_RULE.open.includes(room.type) ? 'aligned' : CENTRE_RULE.light.includes(room.type) ? 'review' : 'conflict'
    status = CENTRE_RULE.open.includes(room.type) ? status : worse(status, centreStatus)
  }
  let perimeterIssue = false
  if (rule.perimeter && !onEdge(room, opts.usable)) {
    perimeterIssue = true
    status = worse(status, 'review')
  }
  return { rule, primary, secondary, zoneStatus, centreStatus, centreCells, perimeterIssue, status }
}

// Which body region answers for a room. If the open centre is the main problem, the navel does.
function regionFor(e) {
  const centreIsMain = !!e.centreStatus && e.centreStatus !== 'aligned' && STATUS[e.centreStatus].rank > STATUS[e.zoneStatus].rank
  return { centreIsMain, region: centreIsMain ? 'navel' : ZONES[e.primary].region }
}

// The full assessment of one room in a layout.
export function assess(room, rooms, opts = {}) {
  const e = evaluate(room, opts)
  const zone = ZONES[e.primary]
  const label = ROOM_TYPES[room.type].label
  const { centreIsMain, region } = regionFor(e)
  const secondaryRegions = [...new Set([...e.secondary.map((z) => ZONES[z].region), ...(centreIsMain ? [zone.region] : [])])].filter(
    (r) => r !== region,
  )

  const parts = []
  if (e.rule.notes?.[e.primary]) parts.push(e.rule.notes[e.primary])
  if (e.zoneStatus !== 'aligned') parts.push(e.rule.why)
  if (e.centreStatus) {
    parts.push(CENTRE_RULE.message[e.centreStatus === 'aligned' ? 'open' : e.centreStatus === 'review' ? 'light' : 'heavy'])
  }
  if (e.perimeterIssue) parts.push('An entrance is normally placed on the outer boundary of the house.')
  if (e.zoneStatus === 'aligned' && !e.rule.notes?.[e.primary]) parts.push(e.rule.why)
  if (e.zoneStatus === 'review' && !e.rule.notes?.[e.primary] && !e.centreStatus) {
    parts.push(`The reference does not fix ${label.toLowerCase()}s to ${zone.dir.toLowerCase()} either way; it depends on the plan.`)
  }

  return {
    id: room.id,
    type: room.type,
    label,
    ref: gridRef(room),
    primary: e.primary,
    secondary: e.secondary,
    zone,
    region,
    regionLabel: BODY_REGIONS[region].label,
    secondaryRegions,
    status: e.status,
    centreObstruction: !!e.centreStatus && e.centreStatus !== 'aligned',
    recommended: e.rule.aligned,
    explanation: parts.join(' '),
    suggestion: e.status === 'aligned' ? null : suggest(room, rooms, opts),
  }
}

// The nearest free, built position where this room would be aligned.
export function suggest(room, rooms, opts = {}) {
  let best = null
  for (let col = 0; col < GRID; col++) {
    for (let row = 0; row < GRID; row++) {
      const cand = { ...room, col, row }
      if (!canPlace(rooms, cand, opts.usable)) continue
      if (evaluate(cand, opts).status !== 'aligned') continue
      const d = Math.hypot(col - room.col, row - room.row)
      if (!best || d < best.d) best = { col, row, rotation: room.rotation, d, zone: zonesOf(cand).primary, ref: gridRef(cand) }
    }
  }
  return best
}

export function statusOf(room, opts) {
  return evaluate(room, opts).status
}

// How each body region is doing across the whole house (worst status wins).
export function regionStates(rooms, opts) {
  const states = {}
  for (const room of rooms) {
    const e = evaluate(room, opts)
    const { region } = regionFor(e)
    states[region] = states[region] ? worse(states[region], e.status) : e.status
  }
  return states
}

export function summary(rooms, opts) {
  const counts = { aligned: 0, review: 0, conflict: 0 }
  for (const r of rooms) counts[evaluate(r, opts).status]++
  return counts
}
