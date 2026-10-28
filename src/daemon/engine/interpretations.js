// THE DAEMON'S BELIEFS — fictional, and meant to be edited.
//
// Each reading looks at the analysed layout and may "fire" with a strength between 0 and 1.
// It pulls the daemon toward one of four moods:
//   coherent  — the house feels whole (warm light, hum, wind, footsteps)
//   tense     — the house feels in conflict (voices, overlapping talk, doors)
//   loss      — something is missing or cut off (receding steps, crying, fading rooms)
//   unstable  — the house doesn't make sense (glitches, flicker, irregular machines)
//
// These are invented narrative rules for an installation. They borrow the *idea* that
// orientation and placement carry meaning, loosely inspired by Vāstu geometry, but they are
// not Vāstu Śāstra teachings and not claims about real houses or real people.
//
// To change the story: edit, remove or add readings here. The decision engine (daemon.js)
// only sees moods, strengths, room ids and lines; it doesn't know what any rule "means".
//
// Line placeholders: {room} room label, {zone} e.g. "north-east", {adj} e.g. "eastern".

import { zoneOfCell } from './layout.js'

const inZone = (room, ...zones) => zones.includes(room.zone)
const ofType = (a, type) => a.rooms.filter((r) => r.type === type)

export const READINGS = [
  {
    id: 'hearth-south-east',
    mood: 'coherent',
    weight: 0.7,
    detect: (a) => ofType(a, 'kitchen').filter((r) => inZone(r, 'SE')).map((r) => ({ rooms: [r.id], strength: 1, zone: r.zone })),
    lines: ['The warm sounds come from the {zone}, where I expect them.', 'Something simmers in the {zone}. That is correct.'],
  },
  {
    id: 'hearth-misplaced',
    mood: 'tense',
    weight: 0.6,
    detect: (a) =>
      ofType(a, 'kitchen')
        .filter((r) => inZone(r, 'NE', 'N', 'C'))
        .map((r) => ({ rooms: [r.id], strength: r.zone === 'C' ? 1 : 0.8, zone: r.zone })),
    lines: ['The fire is burning in the {zone}. The house argues with it.', 'Heat where there should be stillness. In the {zone}.'],
  },
  {
    id: 'quiet-north-east',
    mood: 'coherent',
    weight: 0.6,
    detect: (a) =>
      a.rooms
        .filter((r) => ['prayer', 'garden'].includes(r.type) && inZone(r, 'NE', 'N', 'E'))
        .map((r) => ({ rooms: [r.id], strength: r.zone === 'NE' ? 1 : 0.6, zone: r.zone })),
    lines: ['The {zone} is quiet in the right way.', 'I hear air moving in the {zone}. Good.'],
  },
  {
    id: 'rest-south-west',
    mood: 'coherent',
    weight: 0.5,
    detect: (a) =>
      ofType(a, 'bedroom')
        .filter((r) => inZone(r, 'SW', 'S', 'W'))
        .map((r) => ({ rooms: [r.id], strength: r.zone === 'SW' ? 1 : 0.6, zone: r.zone })),
    lines: ['Someone could sleep in the {zone}.', 'Slow breathing, {zone}. I think.'],
  },
  {
    id: 'restless-sleeper',
    mood: 'unstable',
    weight: 0.5,
    detect: (a) => ofType(a, 'bedroom').filter((r) => inZone(r, 'NE', 'C')).map((r) => ({ rooms: [r.id], strength: 0.8, zone: r.zone })),
    lines: ['Nobody can sleep in the {zone}. I hear turning, all night.'],
  },
  {
    id: 'open-centre',
    mood: 'coherent',
    weight: 0.5,
    detect: (a) => (a.rooms.length >= 4 && a.centreCells === 0 ? [{ rooms: [], strength: 1, zone: 'C' }] : []),
    lines: ['The centre is open. The house can breathe through it.', 'The middle is empty, and it echoes the way it should.'],
  },
  {
    id: 'built-centre',
    mood: 'unstable',
    weight: 0.8,
    detect: (a) => {
      if (a.centreCells === 0) return []
      const rooms = a.rooms.filter((r) => r.cells.some(([c, rr]) => zoneOfCell(c, rr) === 'C'))
      const stair = rooms.some((r) => r.type === 'staircase') ? 0.3 : 0
      return [{ rooms: rooms.map((r) => r.id), strength: Math.min(1, a.centreCells / 2 + stair), zone: 'C' }]
    },
    lines: ['Something is standing on the centre. The old system cannot breathe.', 'The middle of the house has gone solid. My hum has nowhere to go.'],
  },
  {
    id: 'no-entrance',
    mood: 'loss',
    weight: 0.7,
    detect: (a) => (a.rooms.length >= 3 && !a.counts.entrance ? [{ rooms: [], strength: 1 }] : []),
    lines: ['There is no door. No one can arrive.', 'I keep listening for the door. There is no door.'],
  },
  {
    id: 'inward-entrance',
    mood: 'tense',
    weight: 0.4,
    detect: (a) =>
      ofType(a, 'entrance')
        .filter((r) => !r.onEdge)
        .map((r) => ({ rooms: [r.id], strength: 0.7, zone: r.zone })),
    lines: ['The door opens into the house, not out of it. Who is it for?'],
  },
  {
    id: 'welcomed',
    mood: 'coherent',
    weight: 0.4,
    detect: (a) =>
      ofType(a, 'entrance')
        .filter((r) => r.neighbourTypes.some((t) => ['living', 'dining', 'garden'].includes(t)))
        .map((r) => ({ rooms: [r.id], strength: 0.8, zone: r.zone })),
    lines: ['Footsteps come in from the {zone} and find somewhere to sit.'],
  },
  {
    id: 'isolated-room',
    mood: 'loss',
    weight: 0.9,
    detect: (a) =>
      a.isolated.map((r) => ({ rooms: [r.id], strength: r.type === 'bedroom' || r.type === 'living' ? 1 : 0.7, zone: r.zone })),
    lines: ['The {adj} room has become isolated.', 'The {room} no longer answers. It is cut off in the {zone}.', 'Someone walked into the {room} and did not come back.'],
  },
  {
    id: 'fragmented',
    mood: 'loss',
    weight: 0.5,
    detect: (a) => {
      const big = a.groups.filter((g) => g.length > 1)
      return big.length > 1 ? [{ rooms: [], strength: Math.min(1, (big.length - 1) / 2) }] : []
    },
    lines: ['The house is in pieces. The rooms talk in separate voices.', 'I hear two houses now. They do not hear each other.'],
  },
  {
    id: 'water-beside-fire',
    mood: 'tense',
    weight: 0.8,
    detect: (a) =>
      ofType(a, 'bathroom')
        .filter((r) => r.neighbourTypes.includes('kitchen') || r.neighbourTypes.includes('prayer'))
        .map((r) => ({ rooms: [r.id, ...r.neighbours.filter((id) => ['kitchen', 'prayer'].includes(a.byId.get(id).type))], strength: 1, zone: r.zone })),
    lines: ['Water is running against the {zone} wall, where it shouldn’t. Voices rise.', 'The pipes are too close to the fire. Someone is shouting about it.'],
  },
  {
    id: 'noise-beside-sleep',
    mood: 'tense',
    weight: 0.5,
    detect: (a) =>
      ofType(a, 'bedroom')
        .filter((r) => r.neighbourTypes.some((t) => ['kitchen', 'staircase', 'entrance'].includes(t)))
        .map((r) => ({ rooms: [r.id], strength: 0.7, zone: r.zone })),
    lines: ['Someone is trying to sleep next to the noise. They are losing patience.'],
  },
  {
    id: 'shared-table',
    mood: 'coherent',
    weight: 0.4,
    detect: (a) =>
      ofType(a, 'dining')
        .filter((r) => r.neighbourTypes.includes('kitchen'))
        .map((r) => ({ rooms: [r.id], strength: 0.8, zone: r.zone })),
    lines: ['Plates travel a short way. I hear a table being laid.'],
  },
  {
    id: 'crowded',
    mood: 'tense',
    weight: 0.6,
    detect: (a) =>
      Object.entries(a.counts)
        .filter(([, n]) => n >= 3)
        .map(([type]) => ({ rooms: a.rooms.filter((r) => r.type === type).map((r) => r.id), strength: 0.8 })),
    lines: ['Too many of the same room. They compete for the same sounds.'],
  },
  {
    id: 'too-small',
    mood: 'loss',
    weight: 0.6,
    detect: (a) => (a.rooms.length > 0 && a.rooms.length < 4 ? [{ rooms: [], strength: 1 - a.rooms.length / 4 }] : []),
    lines: ['The house is too small to remember itself.', 'So few rooms. Where did the rest go?'],
  },
  {
    id: 'leaning',
    mood: 'unstable',
    weight: 0.5,
    detect: (a) => {
      const d = Math.hypot(a.lean.x, a.lean.y)
      if (a.rooms.length < 3 || d < 1.1) return []
      const zone = `${a.lean.y < -0.5 ? 'N' : a.lean.y > 0.5 ? 'S' : ''}${a.lean.x < -0.5 ? 'W' : a.lean.x > 0.5 ? 'E' : ''}` || 'C'
      return [{ rooms: [], strength: Math.min(1, (d - 1.1) / 1), zone }]
    },
    lines: ['All the weight has slid to the {zone}. The floor creaks that way.'],
  },
  // ---- readings that only appear as the house is upgraded and expanded ----
  {
    id: 'cherished',
    mood: 'coherent',
    weight: 0.35,
    detect: (a) => a.rooms.filter((r) => r.gilded).map((r) => ({ rooms: [r.id], strength: 1, zone: r.zone })),
    lines: ['The gilded {room} rings a little brighter than the rest.', 'Someone cared for the {room}. I can hear it in the walls.'],
  },
  {
    id: 'courtyard-water',
    mood: 'coherent',
    weight: 0.6,
    detect: (a) => (a.basin && a.centreCells === 0 ? [{ rooms: [], strength: 1, zone: 'C' }] : []),
    lines: ['Water in the centre. Birds have found it.', 'The basin echoes the sky. The middle of the house is alive.'],
  },
  {
    id: 'neglect',
    mood: 'loss',
    weight: 0.5,
    detect: (a) =>
      a.neglected.flatMap((z) => {
        const rooms = a.rooms.filter((r) => r.cells.some(([c, rr]) => zoneOfCell(c, rr) === z))
        return rooms.length ? [{ rooms: rooms.map((r) => r.id), strength: 0.9, zone: z }] : []
      }),
    lines: ['The {zone} sounds neglected. Even the {room} is quieter there.', 'Dust in the {zone}. I stopped maintaining it.'],
  },
  {
    id: 'empty-wing',
    mood: 'loss',
    weight: 0.45,
    detect: (a) => a.emptyWings.map((w) => ({ rooms: [], strength: 0.8, zone: WING_ZONE[w] })),
    lines: ['A whole wing stands open and empty. I only hear wind in the {zone}.', 'New rooms were opened in the {zone}, and nobody lives in them.'],
  },
  {
    id: 'sprawl',
    mood: 'unstable',
    weight: 0.55,
    detect: (a) => (a.rooms.length >= 11 && a.groups.length > 1 ? [{ rooms: [], strength: Math.min(1, (a.groups.length - 1) / 2) }] : []),
    lines: ['The house has grown faster than it has joined up. I lose track of it.', 'Too many rooms that do not hear each other.'],
  },
]

const WING_ZONE = { north: 'N', east: 'E', south: 'S', west: 'W' }

// Run every reading and return the ones that fired, with their pull on each mood.
export function interpret(analysis) {
  const fired = []
  const pull = { coherent: 0, tense: 0, loss: 0, unstable: 0 }
  for (const reading of READINGS) {
    for (const hit of reading.detect(analysis)) {
      const strength = hit.strength * reading.weight
      if (strength <= 0) continue
      fired.push({ id: reading.id, mood: reading.mood, strength, rooms: hit.rooms || [], zone: hit.zone, lines: reading.lines })
      pull[reading.mood] += strength
    }
  }
  fired.sort((x, y) => y.strength - x.strength)
  return { fired, pull }
}
