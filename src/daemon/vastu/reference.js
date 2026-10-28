// THE VASTU REFERENCE — editable data, no interface code.
//
// These are common, conventional Vastu Shastra associations for houses, as used in many
// present-day residential guides. Prescriptions differ between texts, regions and practitioners,
// and depend on the individual plot and plan. Treat everything here as a configurable
// recommendation, not a universal rule. Change the lists below to follow another reference.

export const REFERENCE_NAME = 'Common residential Vastu associations'

// The nine zones of the mandala (each zone is a third of the grid on each axis: 2 × 2 cells on the 6 × 6 grid).
// `region` is the part of the Vastu Purusha figure drawn over that zone (see responses.js).
export const ZONES = {
  NE: {
    dir: 'North-East',
    name: 'Ishanya',
    guardian: 'Ishana',
    element: 'Water',
    region: 'head',
    suits: 'Prayer, meditation, open space',
    why: 'Associated with Ishana and with water, and the first to receive morning light. Traditionally kept light, clean and open, for prayer and meditation.',
  },
  E: {
    dir: 'East',
    name: 'Purva',
    guardian: 'Indra / Surya',
    element: '—',
    region: 'armE',
    suits: 'Living spaces, windows, study',
    why: 'The direction of sunrise, associated with Indra and Surya. Morning sunlight makes it suited to living spaces and windows.',
  },
  SE: {
    dir: 'South-East',
    name: 'Agneya',
    guardian: 'Agni',
    element: 'Fire',
    region: 'handSE',
    suits: 'Kitchen, fire-related activities',
    why: 'Associated with Agni, the fire deity. Traditionally the place of the hearth and kitchen.',
  },
  S: {
    dir: 'South',
    name: 'Dakshina',
    guardian: 'Yama',
    element: '—',
    region: 'legS',
    suits: 'Staircases, storage, bedrooms',
    why: 'Associated with Yama. Traditionally built heavier and more closed, suited to staircases, storage and bedrooms.',
  },
  SW: {
    dir: 'South-West',
    name: 'Nairitya',
    guardian: 'Nirriti',
    element: 'Earth',
    region: 'feet',
    suits: 'Master bedroom, heavy and private spaces',
    why: 'Associated with Nirriti and the earth element. Traditionally the heaviest, most stable and most private corner.',
  },
  W: {
    dir: 'West',
    name: 'Paschima',
    guardian: 'Varuna',
    element: '—',
    region: 'legW',
    suits: 'Dining, storage, functional spaces',
    why: 'Associated with Varuna. Suited to dining, storage and other functional spaces, depending on the plan.',
  },
  NW: {
    dir: 'North-West',
    name: 'Vayavya',
    guardian: 'Vayu',
    element: 'Air',
    region: 'handNW',
    suits: 'Guest bedroom, movement, transitions',
    why: 'Associated with Vayu and the air element, a zone of movement. Suited to guest rooms and transitional spaces.',
  },
  N: {
    dir: 'North',
    name: 'Uttara',
    guardian: 'Kubera',
    element: '—',
    region: 'armN',
    suits: 'Living areas, entrances, prosperity',
    why: 'Associated with Kubera and prosperity. Suited to living areas and, where the plan allows, entrances.',
  },
  C: {
    dir: 'Centre',
    name: 'Brahmasthan',
    guardian: 'Brahma',
    element: 'Space',
    region: 'navel',
    suits: 'Kept open: courtyard, light, circulation',
    why: 'The Brahmasthan, associated with Brahma and space. Traditionally kept open and unobstructed where practical, often as a courtyard.',
  },
}

export const ZONE_ORDER = ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE']

// Recommendations per room type.
//   aligned  — the zones the reference recommends
//   conflict — the zones the reference advises against
//   any zone not listed counts as "needs review" (context-dependent)
//   why      — the traditional reasoning for the recommendation
//   notes    — optional extra explanation for a particular zone
export const ROOM_RULES = {
  entrance: {
    aligned: ['N', 'E', 'NE'],
    conflict: ['SW'],
    why: 'Entrances facing north or east are traditionally preferred: they let in morning light and are associated with prosperity. The south-west is traditionally kept closed.',
    notes: {
      SW: 'An entrance in Nairitya, the closed and heavy corner, is traditionally avoided.',
    },
    perimeter: true,
  },
  living: {
    aligned: ['N', 'E'],
    conflict: ['SW'],
    why: 'North (Kubera, prosperity) and east (sunrise) bring daylight and suit shared daily life.',
    notes: {
      NE: 'Living space in the north-east is often accepted if it is kept light and open.',
      SW: 'The south-west is traditionally reserved for heavy, private rooms rather than shared living.',
    },
  },
  kitchen: {
    aligned: ['SE'],
    conflict: ['NE', 'SW', 'N', 'C'],
    why: 'The south-east belongs to Agni, the fire deity, so the hearth traditionally sits here. The north-west is the alternative most often mentioned.',
    notes: {
      SE: 'The fire of the kitchen meets the fire of Agneya.',
      NW: 'The north-west is the most commonly cited alternative to the south-east.',
      NE: 'The north-east (Ishanya) is associated with water and the head of Vastu Purusha. Fire here is the classic conflict in the tradition.',
      SW: 'Fire in the heavy, earth-associated south-west is traditionally avoided.',
      N: 'The north is associated with Kubera and with water, not with fire.',
    },
  },
  dining: {
    aligned: ['W'],
    conflict: [],
    why: 'The west (Varuna) is commonly suggested for dining, close to the kitchen but separate from it. Rules for dining are flexible.',
  },
  bedroom: {
    aligned: ['SW', 'NW'],
    conflict: ['NE', 'SE', 'C'],
    why: 'The heavy, stable south-west suits the master bedroom. The north-west (Vayu, movement) suits guest bedrooms.',
    notes: {
      SW: 'Read as the master bedroom: the most stable and private corner.',
      NW: 'Read as a guest bedroom: Vayavya suits temporary stays.',
      NE: 'The north-east is traditionally kept light and for prayer, not sleep.',
      SE: 'Sleeping in the fire corner is traditionally discouraged.',
    },
  },
  bathroom: {
    aligned: ['NW', 'W'],
    conflict: ['NE', 'SW', 'C'],
    why: 'Toilets and bathrooms are traditionally placed in the north-west or west, away from the sacred north-east and the stable south-west.',
    notes: {
      NE: 'A toilet in Ishanya, at the head of Vastu Purusha, is the conflict the tradition mentions most often.',
      SW: 'Water and waste in the heavy south-west are traditionally avoided.',
    },
  },
  prayer: {
    aligned: ['NE'],
    conflict: ['SE', 'S', 'SW'],
    why: 'Ishanya, the north-east, is associated with Ishana and the first light, and is kept for prayer and meditation.',
    notes: {
      C: 'Some traditions place a shrine at the Brahmasthan; others keep the centre entirely open.',
    },
  },
  study: {
    aligned: ['E', 'N', 'NE'],
    conflict: [],
    why: 'East and north give steady daylight. The tradition links them with clarity and learning.',
  },
  staircase: {
    aligned: ['S', 'SW', 'W'],
    conflict: ['NE', 'C'],
    why: 'Staircases are heavy elements, traditionally placed in the south, west or south-west and kept out of the north-east and the centre.',
  },
  storage: {
    aligned: ['SW', 'S', 'W'],
    conflict: ['NE', 'C'],
    why: 'Heavy storage belongs in the heavier south and west. The north-east stays light.',
  },
  garden: {
    aligned: ['NE', 'N', 'E', 'C'],
    conflict: ['SW'],
    why: 'Open space is traditionally kept to the north and east, and the centre may open as a courtyard. The south-west stays closed and heavy.',
    notes: {
      C: 'A courtyard keeps the Brahmasthan open.',
    },
  },
}

// The open centre. A room covering at least `minCells` of the central 2 × 2 cells
// counts as obstructing the Brahmasthan, unless it is an open type.
export const CENTRE_RULE = {
  minCells: 1,
  open: ['garden'],
  light: ['living', 'dining', 'prayer', 'study'], // needs review rather than conflict
  message: {
    open: 'It keeps the Brahmasthan open, as the tradition prefers.',
    light: 'It partly covers the Brahmasthan. The tradition prefers the centre to stay open; a light, open room here depends on the plan.',
    heavy: 'It obstructs the Brahmasthan, which the tradition keeps open and unobstructed where practical.',
  },
}
