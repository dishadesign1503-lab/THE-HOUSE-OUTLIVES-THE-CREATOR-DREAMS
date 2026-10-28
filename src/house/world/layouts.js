// THE HOUSE'S ORGANISATIONS (configurations of plan.js) and the three levels.
//
// Drawn after "House plan reference": a heavy exterior shell with a recess at the south-east; a
// north–south gallery as the spine of the circulation; a north hall before the door; a study, a
// large west room, a south-west room; an open-to-sky courtyard at the heart, entered from the
// gallery; an east room, a dining room and a kitchen; an L-shaped south-east room; the entrance
// hall along the south, where you begin.
//
// Map: 8 rows (north to south) of 6 bays (west to east); a letter is a room, '.' is outside.
// The other organisations are what the house becomes when he turns over in his sleep: the
// courtyard migrates south and the study grows; or the gallery moves east; or, more radically,
// the same twelve rooms rearranged around a different structure: branching corridors, a ring
// around an inner court, east–west bands, north–south strips, one corridor spanning the house.
// Each carries the spatial character it expresses (`character`, the same attributes as an
// object's), which his planner weighs when he embodies something.

const ROOMS = {
  H: { name: 'north hall', type: 'hall' },
  S: { name: 'study', type: 'room' },
  G: { name: 'gallery', type: 'corridor' },
  A: { name: 'antechamber', type: 'room' },
  W: { name: 'west room', type: 'room' },
  C: { name: 'courtyard', type: 'court' },
  E: { name: 'east room', type: 'room' },
  D: { name: 'dining room', type: 'room' },
  K: { name: 'kitchen', type: 'room' },
  L: { name: 'south-west room', type: 'room' },
  T: { name: 'south-east room', type: 'room' },
  N: { name: 'entrance hall', type: 'hall' },
}

const WINDOWS = [
  ['S', 'N'],
  ['S', 'W'],
  ['W', 'W', 0],
  ['L', 'W'],
  ['N', 'S', 0],
  ['T', 'S'],
  ['E', 'E', 0],
  ['K', 'E'],
  ['A', 'E'],
]

export const CONFIGS = {
  // the house as it was built
  origin: {
    label: 'as built',
    map: ['SSHHHH', 'SSGAAA', 'WWGCCE', 'WWGCCE', 'WWGDDE', 'LLGDDK', 'LLGTT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['N', 'G'], ['N', 'T'], ['N', 'L'], ['G', 'W'], ['W', 'S'], ['G', 'C'], ['C', 'D'], ['C', 'E'], ['D', 'K'], ['G', 'D'], ['A', 'E'], ['G', 'H'], ['A', 'H'], ['S', 'H']],
    windows: WINDOWS,
  },
  // branches: a trunk corridor rising from the entrance hall, branching west, north-west and east
  branches: {
    label: 'branching corridors',
    character: { branching: 1, spread: 0.6, upright: 0.3 },
    map: ['SSHHHH', 'SGGGAA', 'WWCGGG', 'WWCGEE', 'GGGGEE', 'LLDGKK', 'LLDGT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['N', 'G'], ['N', 'L'], ['N', 'T'], ['G', 'H'], ['G', 'S'], ['G', 'A'], ['G', 'W'], ['G', 'C'], ['G', 'E'], ['G', 'L'], ['G', 'D'], ['G', 'K'], ['G', 'T'], ['A', 'H'], ['E', 'K']],
    windows: WINDOWS,
  },
  // ring: everything drawn in around an inner court, a ring corridor tight around it
  ring: {
    label: 'a ring around an inner court',
    character: { compact: 1, curved: 0.4 },
    map: ['SSHHHH', 'SSAAAA', 'WGGGGE', 'WGCCGE', 'WGDDGE', 'LGGGGK', 'LLTTT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['N', 'L'], ['N', 'T'], ['L', 'G'], ['T', 'G'], ['G', 'W'], ['G', 'E'], ['G', 'K'], ['G', 'A'], ['A', 'H'], ['S', 'H'], ['S', 'W'], ['G', 'C'], ['C', 'D']],
    windows: WINDOWS,
  },
  // bands: long east–west rooms and an east–west corridor across the whole house
  bands: {
    label: 'east–west bands',
    character: { horizontal: 1, elongated: 0.4 },
    map: ['SSSHHH', 'AAAAAA', 'GGGGGG', 'WWCCCE', 'WWDDDE', 'LLLKKK', 'LLTTT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['G', 'A'], ['A', 'S'], ['A', 'H'], ['G', 'W'], ['G', 'C'], ['G', 'E'], ['C', 'D'], ['W', 'L'], ['D', 'K'], ['L', 'N'], ['L', 'T'], ['N', 'T'], ['K', 'T']],
    windows: WINDOWS,
  },
  // strips: long north–south rooms side by side, the gallery a tall spine
  strips: {
    label: 'north–south strips',
    character: { upright: 1, elongated: 1 },
    map: ['SSHHHH', 'WGCDAA', 'WGCDAE', 'WGCDKE', 'WGCDKE', 'LGCDKE', 'LGTTT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['N', 'L'], ['N', 'G'], ['N', 'T'], ['G', 'W'], ['G', 'S'], ['S', 'H'], ['G', 'C'], ['C', 'D'], ['D', 'A'], ['A', 'H'], ['A', 'E'], ['D', 'K'], ['K', 'E'], ['C', 'T'], ['G', 'L']],
    windows: WINDOWS,
  },
  // span: one corridor spanning the whole width, joining a northern and a southern half
  span: {
    label: 'a corridor spanning the house',
    character: { spanning: 1, elongated: 0.5, horizontal: 0.3 },
    map: ['SSHHHH', 'SSAAAA', 'WWCCEE', 'GGGGGG', 'LLDDKK', 'LLDDKK', 'LLTTT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['G', 'W'], ['G', 'C'], ['G', 'E'], ['G', 'L'], ['G', 'D'], ['G', 'K'], ['W', 'S'], ['C', 'A'], ['A', 'H'], ['S', 'H'], ['L', 'N'], ['N', 'T'], ['D', 'T'], ['A', 'E']],
    windows: WINDOWS,
  },
  // he rolls over: the courtyard migrates south, the study takes in part of the west room
  courtSouth: {
    label: 'the courtyard has moved',
    character: { curved: 0.3 },
    map: ['SSHHHH', 'SSGAAA', 'SSGDDE', 'WWGDDE', 'WWGCCE', 'LLGCCK', 'LLGTT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['N', 'G'], ['N', 'T'], ['N', 'L'], ['G', 'W'], ['W', 'S'], ['G', 'D'], ['D', 'C'], ['C', 'E'], ['C', 'T'], ['D', 'E'], ['K', 'E'], ['A', 'E'], ['G', 'H'], ['A', 'H'], ['S', 'H']],
    windows: WINDOWS,
  },
  // he turns the other way: the spine of the house moves east, the west rooms widen
  spineEast: {
    label: 'the gallery has moved',
    character: { horizontal: 0.3 },
    map: ['SSHHHH', 'SSSGAA', 'WWWGCE', 'WWWGCE', 'WWWGDE', 'LLLGDK', 'LLLGT.', 'NNNNT.'],
    rooms: ROOMS,
    doors: [['N', 'G'], ['N', 'T'], ['N', 'L'], ['G', 'W'], ['W', 'S'], ['G', 'C'], ['C', 'E'], ['C', 'D'], ['D', 'K'], ['G', 'D'], ['A', 'E'], ['G', 'H'], ['A', 'H'], ['G', 'A'], ['S', 'H']],
    windows: WINDOWS,
  },
}

const BODY = { x: 4.5, y: 6.6, rot: 35, scale: 0.0275, pose: 'mandala' }

export const LAYOUTS = {
  // I · OBEY: from the entrance hall to the north door
  origin: {
    configs: ['origin', 'courtSouth', 'spineEast', 'branches', 'ring', 'bands', 'strips', 'span'],
    exits: [{ id: 'north', room: 'H', side: 'N', pick: 2 }],
    start: [4.0, 11.5],
    body: BODY,
    wind: { angle: 0, strength: 1 },
    sun: { angle: 125, elevation: 32, intensity: 1 },
  },
  // II · ADAPT: three doors; he must turn twice before any opens
  adapt: {
    configs: ['origin', 'courtSouth', 'spineEast', 'branches', 'ring', 'bands', 'strips', 'span'],
    exits: [
      { id: 'north', room: 'H', side: 'N', pick: 2 },
      { id: 'west', room: 'W', side: 'W', pick: 1 },
      { id: 'east', room: 'E', side: 'E', pick: 1 },
    ],
    start: [4.0, 11.5],
    body: BODY,
    wind: { angle: 270, strength: 1.15 },
    sun: { angle: 230, elevation: 30, intensity: 1 },
  },
  // III · QUESTION: the north door sealed by the oldest wall; the old door in the west room opens
  // only when the house returns to the shape it was built in; four niches, the circuit
  question: {
    configs: ['origin', 'courtSouth', 'spineEast', 'branches', 'ring', 'bands', 'strips', 'span'],
    exits: [
      { id: 'sealed', room: 'H', side: 'N', pick: 2 },
      { id: 'old', room: 'W', side: 'W', pick: 1 },
    ],
    rule: { door: 'sealed', depth: 1.0, half: 0.62 },
    niches: [[7.9, 1.5, 1], [6.3, 11.8, 2], [1.2, 11.7, 3], [1.4, 1.5, 4]],
    start: [4.0, 11.5],
    body: BODY,
    wind: { angle: 200, strength: 1.1 },
    sun: { angle: 60, elevation: 28, intensity: 1 },
  },
}
