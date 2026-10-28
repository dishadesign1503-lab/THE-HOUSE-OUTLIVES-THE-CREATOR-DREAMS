// The room blocks. On the 6 × 6 house grid every room is one cell; rotation sets the side
// the room faces (for the entrance, the side of the front door).
// `colour` is the room's identity on the board and in the walkthrough; `ink` is the colour
// of its engraved icon. `max` is how many of that block the inventory holds.
// Icons are 24 × 24 stroke paths.

export const ROOM_TYPES = {
  entrance: {
    label: 'Entrance',
    colour: '#C4A15A',
    ink: '#242622',
    max: 1,
    icon: 'M7 20V4h10v16 M4 20h16 M14.2 12.2h.01 M11 8l-3 0',
  },
  living: {
    label: 'Living Room',
    colour: '#D98945',
    ink: '#FAF7EF',
    max: 2,
    icon: 'M5 12V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3 M3 12h18v5H3z M5 17v2 M19 17v2',
  },
  kitchen: {
    label: 'Kitchen',
    colour: '#C45A42',
    ink: '#FAF7EF',
    max: 1,
    icon: 'M5 11h14v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z M3 11h18 M9.5 8c0-1.2 1.2-1.2 1.2-2.6 M13.5 8c0-1.2 1.2-1.2 1.2-2.6',
  },
  dining: {
    label: 'Dining Room',
    colour: '#B8703F',
    ink: '#FAF7EF',
    max: 1,
    icon: 'M12 7a5 5 0 1 0 0.01 0z M12 9.8a2.2 2.2 0 1 0 0.01 0z M3.5 6v12 M20.5 6v12 M2.5 6v3.5h2V6',
  },
  bedroom: {
    label: 'Bedroom',
    colour: '#155D63',
    ink: '#FAF7EF',
    max: 3,
    icon: 'M3 18V8 M3 14h18v4 M21 18v-4a2 2 0 0 0-2-2h-8v2 M6.5 10.5h2.5',
  },
  bathroom: {
    label: 'Bathroom',
    colour: '#A9C8E8',
    ink: '#155D63',
    max: 2,
    icon: 'M12 4c3 4 5 6.5 5 9.2a5 5 0 0 1-10 0C7 10.5 9 8 12 4z M10 14a2 2 0 0 0 2 2',
  },
  prayer: {
    label: 'Prayer / Meditation',
    colour: '#E2C989',
    ink: '#6b4f1c',
    max: 1,
    icon: 'M12 4.5c1.6 2 2.1 3.1 2.1 4.3a2.1 2.1 0 0 1-4.2 0c0-1.2.5-2.3 2.1-4.3z M5.5 13h13a6.5 5 0 0 1-13 0z M9 20h6',
  },
  study: {
    label: 'Study',
    colour: '#4F6E5C',
    ink: '#FAF7EF',
    max: 1,
    icon: 'M4 6h6a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H4z M20 6h-6a2 2 0 0 0-2 2 M20 6v11h-6a2 2 0 0 0-2 2',
  },
  staircase: {
    label: 'Staircase',
    colour: '#8C8473',
    ink: '#FAF7EF',
    max: 1,
    icon: 'M4 20h4v-4h4v-4h4V8h4V4',
  },
  storage: {
    label: 'Storage',
    colour: '#C9C0AE',
    ink: '#242622',
    max: 2,
    icon: 'M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8',
  },
  garden: {
    label: 'Courtyard',
    colour: '#365743',
    ink: '#FAF7EF',
    max: 2,
    icon: 'M12 21v-8 M12 13c-4 0-6-3-6-7 4 0 6 3 6 7z M12 16c3 0 5-2 5-5-3 0-5 2-5 5z M5 21h14',
  },
}

export const ROOM_ORDER = ['entrance', 'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'storage', 'prayer', 'study', 'staircase', 'garden']

// Every room is a single cell; kept as a function so multi-cell rooms could return later.
export function footprint() {
  return { w: 1, h: 1 }
}

let counter = 0
export function newRoomId(type) {
  counter += 1
  return `${type}-${Date.now().toString(36)}-${counter}`
}

// A modest first house inside the 4 × 4 core: connected, centre open, with things to improve.
export const INITIAL_LAYOUT = [
  ['bathroom', 1, 1, 0],
  ['living', 2, 1, 0],
  ['dining', 3, 1, 0],
  ['entrance', 4, 1, 90],
  ['bedroom', 1, 2, 0],
  ['kitchen', 4, 2, 0],
].map(([type, col, row, rotation], i) => ({ id: `init-${type}-${i}`, type, col, row, rotation }))
