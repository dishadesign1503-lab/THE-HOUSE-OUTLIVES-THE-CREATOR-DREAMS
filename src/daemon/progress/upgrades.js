// HOUSE UPGRADES — what coins can buy. Each upgrade changes the real house state:
// usable cells, inventory, room flags, or features the daemon, sound and walkthrough read.
//
//   target: 'room'    — acts on the selected room
//           'dormant' — acts on the selected dormant room (or the first one)
//           'zone'    — acts on a neglected zone (the selected room's, or the first one)
//   apply(house, target) returns { house, roomPatch?, log }

import { ZONE_NAMES, zoneOfCell } from '../engine/layout.js'
import { ROOM_TYPES } from '../engine/rooms.js'
import { WINGS } from './house.js'

const unlockType = (type) => (h) => ({ house: { ...h, types: [...h.types, type] }, log: `A ${ROOM_TYPES[type].label.toLowerCase()} block has been added to the inventory.` })
const feature = (key, log) => (h) => ({ house: { ...h, features: { ...h.features, [key]: true } }, log })
const wing = (id) => (h) => ({ house: { ...h, wings: [...h.wings, id] }, log: { key: 'WING', text: `A sealed wall opens to the ${WINGS[id].zone === 'N' ? 'north' : WINGS[id].zone === 'E' ? 'east' : WINGS[id].zone === 'S' ? 'south' : 'west'}. I hear air in rooms that were not there.` } })

export const CATEGORIES = [
  { id: 'expand', label: 'Expand the house' },
  { id: 'rooms', label: 'Improve the rooms' },
  { id: 'systems', label: "Restore the building's systems" },
]

export const UPGRADES = [
  // ---- expand ----
  { id: 'wing-north', category: 'expand', name: 'Open the north wing', cost: 25, preview: 'wing-n', effect: 'Builds the northern edge (Uttara): four new cells.', apply: wing('north') },
  { id: 'wing-east', category: 'expand', name: 'Open the east wing', cost: 25, preview: 'wing-e', effect: 'Builds the eastern edge (Purva): four new cells.', apply: wing('east') },
  { id: 'wing-south', category: 'expand', name: 'Open the south wing', cost: 25, preview: 'wing-s', effect: 'Builds the southern edge (Dakshina): four new cells.', apply: wing('south') },
  { id: 'wing-west', category: 'expand', name: 'Open the west wing', cost: 25, preview: 'wing-w', effect: 'Builds the western edge (Paschima): four new cells. Corners open when both neighbouring wings are open.', apply: wing('west') },
  { id: 'slots-1', category: 'expand', name: 'Two more room slots', cost: 15, preview: 'slots', effect: 'Room limit +2.', apply: (h) => ({ house: { ...h, maxRooms: h.maxRooms + 2 }, log: 'The house can hold more rooms now.' }) },
  { id: 'slots-2', category: 'expand', name: 'Three more room slots', cost: 25, preview: 'slots', requires: ['slots-1'], effect: 'Room limit +3.', apply: (h) => ({ house: { ...h, maxRooms: h.maxRooms + 3 }, log: 'The house can hold more rooms now.' }) },
  { id: 'type-garden', category: 'expand', name: 'Courtyard', cost: 15, preview: 'type:garden', effect: 'Adds two courtyard blocks: open to the sky, with birds and wind.', apply: unlockType('garden') },
  { id: 'type-prayer', category: 'expand', name: 'Prayer / meditation room', cost: 10, preview: 'type:prayer', effect: 'Adds a prayer / meditation block.', apply: unlockType('prayer') },
  { id: 'type-study', category: 'expand', name: 'Study', cost: 10, preview: 'type:study', effect: 'Adds a study block.', apply: unlockType('study') },
  { id: 'type-staircase', category: 'expand', name: 'Staircase', cost: 15, preview: 'type:staircase', effect: 'Adds a staircase to an upper floor that is not built yet.', apply: unlockType('staircase') },

  // ---- rooms ----
  {
    id: 'gild',
    category: 'rooms',
    name: 'Gold-leaf a room',
    cost: 10,
    repeatable: true,
    target: 'room',
    preview: 'gild',
    effect: 'The selected room gets gold trim on the board and in the house. The daemon grows attached to it and resists moving it.',
    apply: (h, room) => ({ house: h, roomPatch: { id: room.id, gilded: true }, log: { key: 'GILD', text: `The ${ROOM_TYPES[room.type].label.toLowerCase()} rings brighter now.` } }),
  },
  {
    id: 'restore',
    category: 'rooms',
    name: 'Restore a dormant room',
    cost: 8,
    repeatable: true,
    target: 'dormant',
    preview: 'restore',
    effect: 'Wakes a room that went dormant during a long silence. The daemon can hear it again.',
    apply: (h, room) => ({ house: h, roomPatch: { id: room.id, dormant: false }, log: { key: 'RESTORED', ctx: { room: ROOM_TYPES[room.type].label.toLowerCase() } } }),
  },
  { id: 'doorways', category: 'rooms', name: 'Open doorways', cost: 20, preview: 'doorways', effect: 'Rooms facing each other across one empty cell are joined by a corridor. Fewer rooms are isolated.', apply: feature('doorways', 'New corridors. Footsteps can reach further now.') },
  { id: 'jali', category: 'rooms', name: 'Jali screens', cost: 15, preview: 'jali', effect: 'Carved screens soften sound between rooms: the daemon hears arguments more faintly.', apply: feature('jali', 'The screens break the voices into lace. I hear them more softly.') },
  { id: 'lamps', category: 'rooms', name: 'Brass lamps and lime plaster', cost: 15, preview: 'lamps', effect: 'Warmer light and plastered walls inside the house; room blocks gain a polished finish.', apply: feature('lamps', 'Lamps are lit. The walls give back a warmer echo.') },
  { id: 'basin', category: 'rooms', name: 'Courtyard water basin', cost: 20, preview: 'basin', effect: 'A basin in the Brahmasthan. While the centre stays open, water and birdsong join the house.', apply: feature('basin', 'Water in the centre of the house. Something small is drinking from it.') },

  // ---- systems ----
  { id: 'ventilation', category: 'systems', name: 'Restore the ventilation', cost: 15, preview: 'ventilation', effect: 'The rattling shafts breathe smoothly. The house fades more slowly in silence, and the daemon can calm itself.', apply: feature('ventilation', 'The ventilation breathes again.') },
  { id: 'pipes', category: 'systems', name: 'Repair the old pipes', cost: 15, preview: 'pipes', effect: 'No more dripping and knocking. The daemon is confused less easily.', apply: feature('pipes', 'The pipes stop knocking. I can follow the house again.') },
  {
    id: 'stabilise',
    category: 'systems',
    name: 'Stabilise a neglected zone',
    cost: 10,
    repeatable: true,
    target: 'zone',
    preview: 'stabilise',
    effect: 'Braces a zone that fell into neglect during a silence. It cannot be neglected again.',
    apply: (h, zone) => ({
      house: { ...h, neglected: h.neglected.filter((z) => z !== zone), stabilised: [...h.stabilised, zone] },
      log: { key: 'STABILISED', ctx: { zone: ZONE_NAMES[zone] } },
    }),
  },
  { id: 'city', category: 'systems', name: 'Open the windows to Weimar', cost: 15, preview: 'city', effect: 'Distant bells and street life come in. The daemon can open the windows to calm tension.', apply: feature('city', 'The windows open. Bells, far away, and the town breathing.') },
]

export const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]))

function resolveTarget(up, house, ctx) {
  const { selected, rooms } = ctx
  if (up.target === 'room') {
    if (!selected) return { error: 'Select a room on the board first.' }
    if (selected.gilded) return { error: 'The selected room is already gilded.' }
    if (selected.dormant) return { error: 'Restore the selected room before gilding it.' }
    return { target: selected }
  }
  if (up.target === 'dormant') {
    const room = selected?.dormant ? selected : rooms.find((r) => r.dormant)
    return room ? { target: room } : { error: 'No dormant rooms. Rooms go dormant when the house is left in silence.' }
  }
  if (up.target === 'zone') {
    const own = selected && zoneOfCell(selected.col, selected.row)
    const zone = own && house.neglected.includes(own) ? own : house.neglected[0]
    return zone ? { target: zone } : { error: 'No zone is neglected at the moment.' }
  }
  return { target: null }
}

// state: 'purchased' | 'locked' | 'needs-target' | 'poor' | 'available'
export function availability(up, house, ctx) {
  const bought = house.purchases[up.id] ?? 0
  if (!up.repeatable && bought) return { state: 'purchased', message: 'Purchased' }
  const missing = (up.requires ?? []).filter((id) => !house.purchases[id])
  if (missing.length) return { state: 'locked', message: `Requires “${byId[missing[0]].name}”.` }
  const { target, error } = resolveTarget(up, house, ctx)
  if (error) return { state: 'needs-target', message: error }
  if (house.coins < up.cost) return { state: 'poor', message: `You need ${up.cost - house.coins} more coins.`, target }
  return { state: 'available', message: up.repeatable && bought ? `Bought ${bought}×` : 'Available', target }
}

// Buy: returns the new house and what else changed, or { error }.
export function purchase(id, house, ctx) {
  const up = byId[id]
  const a = availability(up, house, ctx)
  if (a.state !== 'available') return { error: a.message }
  const result = up.apply({ ...house, coins: house.coins - up.cost, purchases: { ...house.purchases, [id]: (house.purchases[id] ?? 0) + 1 } }, a.target)
  return { ...result, upgrade: up, target: a.target }
}
