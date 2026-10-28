// THE COIN ECONOMY — editable numbers and challenges.
// Coins stand for the building's recovered energy. They are a fictional game economy:
// earning them does not mean a layout is traditionally auspicious.

export const INITIAL_COINS = 10

export const REWARDS = {
  small: 5, // a room placed where it is aligned; a coin found in a harmonious room
  medium: 15, // a challenge; waking the house from dormancy; inhabiting a new wing
  major: 30, // a major restoration milestone
}

export const HARMONY_COOLDOWN_S = 25 // between "the daemon approves" rewards
export const STABLE_SECONDS = 20 // a harmonious house kept unchanged this long earns a reward
export const WALK_COINS_PER_VISIT = 3 // coins hidden in harmonious rooms per walkthrough

// Challenges are checked whenever the house settles. Each pays once per session.
// `a` is the daemon's analysis of the layout; `v(id)` gives a room's Vastu reading.
export const CHALLENGES = [
  {
    id: 'one-household',
    name: 'One household',
    hint: 'Six or more rooms, every one reachable from the others.',
    reward: 'medium',
    detect: (a) => a.rooms.length >= 6 && a.groups.length === 1,
  },
  {
    id: 'hearth',
    name: 'Hearth of Agni',
    hint: 'Kitchen in the south-east, sharing a wall with the dining room.',
    reward: 'medium',
    detect: (a, v) => a.rooms.some((r) => r.type === 'kitchen' && v(r.id).primary === 'SE' && r.neighbourTypes.includes('dining')),
  },
  {
    id: 'ishanya',
    name: 'Quiet Ishanya',
    hint: 'A prayer room in the north-east, with nothing heavy, wet or hot beside it in that corner.',
    reward: 'medium',
    detect: (a, v) =>
      a.rooms.some((r) => r.type === 'prayer' && v(r.id).primary === 'NE') &&
      !a.rooms.some((r) => ['kitchen', 'bathroom', 'staircase', 'storage'].includes(r.type) && v(r.id).primary === 'NE'),
  },
  {
    id: 'nairitya',
    name: 'Rooted Nairitya',
    hint: 'A bedroom in the south-west next to storage or a staircase.',
    reward: 'medium',
    detect: (a, v) =>
      a.rooms.some((r) => r.type === 'bedroom' && v(r.id).primary === 'SW' && r.neighbourTypes.some((t) => t === 'storage' || t === 'staircase')),
  },
  {
    id: 'courtyard',
    name: 'Open courtyard house',
    hint: 'Nine or more connected rooms around an open centre, with a courtyard or the basin.',
    reward: 'major',
    detect: (a) => a.rooms.length >= 9 && a.groups.length === 1 && a.centreCells === 0 && (a.counts.garden > 0 || a.basin),
  },
  {
    id: 'all-aligned',
    name: 'The whole plan aligned',
    hint: 'Eight or more rooms, every one aligned with the Vastu reference.',
    reward: 'major',
    detect: (a, v) => a.rooms.length >= 8 && a.rooms.every((r) => v(r.id).status === 'aligned'),
  },
  {
    id: 'grand-house',
    name: 'A grand house',
    hint: 'Fourteen or more rooms in one connected house.',
    reward: 'major',
    detect: (a) => a.rooms.length >= 14 && a.groups.length === 1,
  },
]
