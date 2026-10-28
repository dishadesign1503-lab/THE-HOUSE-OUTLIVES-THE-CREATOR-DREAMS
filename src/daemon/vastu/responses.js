// HOW THE VASTU PURUSHA FIGURE RESPONDS — editable data.
//
// Room type → mandala zone (assess.js) → body region (ZONES[zone].region in reference.js)
// → status → visual reaction + sound + message.
//
// The body mapping is an illustrative visualisation of the traditional image: the figure lies
// face-down across the plan, head in the north-east, feet in the south-west, arms toward the
// north-west and south-east. It is not an authoritative anatomical mapping of every cell.

export const BODY_REGIONS = {
  head: { label: 'Head', part: 'head', pitch: 784 },
  armN: { label: 'Shoulder & upper arm (north side)', part: 'arm', pitch: 587 },
  armE: { label: 'Shoulder & upper arm (east side)', part: 'arm', pitch: 587 },
  handNW: { label: 'Forearm & hand (Vayu side)', part: 'arm', pitch: 523 },
  handSE: { label: 'Forearm & hand (Agni side, fire)', part: 'arm', pitch: 523 },
  navel: { label: 'Navel & heart (Brahmasthan)', part: 'torso', pitch: 392 },
  legW: { label: 'Leg & knee (west side)', part: 'leg', pitch: 294 },
  legS: { label: 'Leg & knee (south side)', part: 'leg', pitch: 294 },
  feet: { label: 'Feet', part: 'leg', pitch: 220 },
}

// The three statuses. Every one has a symbol and a word, so colour and sound are never
// the only signal.
export const STATUS = {
  aligned: { label: 'Aligned', symbol: '✓', visual: 'glow', tone: 'confirm', rank: 0 },
  review: { label: 'Needs review', symbol: '~', visual: 'soft', tone: 'review', rank: 1 },
  conflict: { label: 'Conflicting', symbol: '✕', visual: 'pulse', tone: 'warning', rank: 2 },
}

// Special reactions for particular combinations. The first match wins; anything else
// uses the status default above.
export const SPECIAL_REACTIONS = [
  { room: 'kitchen', zone: 'SE', status: 'aligned', visual: 'fire' },
  { room: 'bathroom', zone: 'NE', visual: 'distort' },
  { room: 'kitchen', zone: 'NE', visual: 'pulse' },
  { room: 'bedroom', zone: 'SW', status: 'aligned', visual: 'steady' },
  { centre: true, status: 'conflict', visual: 'distort' },
]

export function reactionFor(assessment) {
  const { type, primary, status, centreObstruction } = assessment
  const special = SPECIAL_REACTIONS.find(
    (s) =>
      (s.room === undefined || s.room === type) &&
      (s.zone === undefined || s.zone === primary) &&
      (s.status === undefined || s.status === status) &&
      (s.centre === undefined || s.centre === !!centreObstruction),
  )
  return {
    region: assessment.region,
    secondary: assessment.secondaryRegions,
    status,
    visual: special?.visual ?? STATUS[status].visual,
    tone: STATUS[status].tone,
    pitch: BODY_REGIONS[assessment.region].pitch,
    part: BODY_REGIONS[assessment.region].part,
  }
}
