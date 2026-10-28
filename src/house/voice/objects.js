// "YOU ARE …" — which object was named, and what it is like as a body.
//
// parseInstruction(text) checks the sentence ("you are" + an object), finds the object and gives
// its physical attributes (each 0..1):
//   upright     standing vertical, straight, limbs along the body        (a lamp stand, a pillar)
//   horizontal  lying across, rolled onto one side                        (a boat, a log)
//   elongated   long along the body's axis, limbs extended along it       (a snake, a rope)
//   branching   limbs spread outward and up from a straight trunk         (a tree, a candelabra)
//   compact     drawn in, folded, round and heavy                         (a stone, an egg)
//   spanning    reaching as far as possible end to end, slightly arched   (a bridge, an arch)
//   curved      the whole body bent into an arc                           (a moon, a hook)
//   spread      limbs flung wide in every direction                       (a star, a net)
// Unknown objects are read from descriptive words in the sentence ("a tall thin thing"); if
// nothing at all can be pictured, the sentence is refused with a reason, never guessed.

import { classify } from './classify.js'

const A = (upright, horizontal, elongated, branching, compact, spanning, curved, spread) => ({ upright, horizontal, elongated, branching, compact, spanning, curved, spread })

// object → attributes                       up   hor  long branch comp span curve spread
const OBJECTS = {
  'lamp stand': A(1, 0, 0.7, 0, 0, 0, 0, 0),
  lampstand: A(1, 0, 0.7, 0, 0, 0, 0, 0),
  lamp: A(0.9, 0, 0.5, 0, 0.1, 0, 0, 0),
  lamppost: A(1, 0, 0.8, 0, 0, 0, 0, 0),
  'lamp post': A(1, 0, 0.8, 0, 0, 0, 0, 0),
  'street lamp': A(1, 0, 0.8, 0, 0, 0, 0.2, 0),
  pole: A(1, 0, 0.9, 0, 0, 0, 0, 0),
  flagpole: A(1, 0, 1, 0, 0, 0, 0, 0),
  pillar: A(1, 0, 0.6, 0, 0.2, 0, 0, 0),
  column: A(1, 0, 0.7, 0, 0.1, 0, 0, 0),
  tower: A(1, 0, 0.8, 0, 0.1, 0, 0, 0),
  candle: A(1, 0, 0.6, 0, 0.1, 0, 0, 0),
  mast: A(1, 0, 0.9, 0, 0, 0, 0, 0),
  statue: A(0.9, 0, 0.4, 0, 0.2, 0, 0, 0),
  soldier: A(1, 0, 0.5, 0, 0, 0, 0, 0),
  spear: A(0.6, 0, 1, 0, 0, 0, 0, 0),
  arrow: A(0.5, 0, 1, 0, 0, 0, 0, 0),
  sword: A(0.6, 0, 0.9, 0, 0, 0, 0, 0),
  needle: A(0.7, 0, 1, 0, 0, 0, 0, 0),
  pencil: A(0.6, 0, 0.9, 0, 0, 0, 0, 0),
  stick: A(0.5, 0.2, 0.9, 0, 0, 0, 0, 0),
  ladder: A(0.8, 0, 0.9, 0, 0, 0.2, 0, 0),
  chimney: A(1, 0, 0.7, 0, 0.1, 0, 0, 0),
  rocket: A(1, 0, 0.9, 0, 0, 0, 0, 0),
  obelisk: A(1, 0, 0.8, 0, 0, 0, 0, 0),
  totem: A(1, 0, 0.7, 0, 0, 0, 0, 0),
  minaret: A(1, 0, 0.9, 0, 0, 0, 0, 0),
  tree: A(0.6, 0, 0.5, 1, 0, 0, 0, 0.2),
  'palm tree': A(0.7, 0, 0.6, 0.8, 0, 0, 0.2, 0.2),
  oak: A(0.5, 0, 0.3, 1, 0, 0, 0, 0.4),
  pine: A(0.8, 0, 0.6, 0.6, 0, 0, 0, 0),
  branch: A(0.2, 0.2, 0.6, 0.8, 0, 0, 0.2, 0),
  bush: A(0.2, 0, 0, 0.6, 0.5, 0, 0, 0.4),
  plant: A(0.5, 0, 0.3, 0.7, 0.1, 0, 0, 0.2),
  flower: A(0.6, 0, 0.4, 0.6, 0, 0, 0.2, 0.3),
  candelabra: A(0.7, 0, 0.3, 1, 0, 0, 0, 0.3),
  antler: A(0.3, 0, 0.3, 1, 0, 0, 0.3, 0),
  coral: A(0.3, 0, 0.2, 0.9, 0.2, 0, 0.2, 0.3),
  hand: A(0.3, 0, 0.2, 0.7, 0, 0, 0, 0.6),
  boat: A(0, 1, 0.6, 0, 0, 0, 0.3, 0),
  ship: A(0, 1, 0.7, 0, 0, 0, 0.2, 0),
  canoe: A(0, 1, 0.9, 0, 0, 0, 0.3, 0),
  kayak: A(0, 1, 0.9, 0, 0, 0, 0.2, 0),
  raft: A(0, 1, 0.3, 0, 0, 0, 0, 0.5),
  gondola: A(0, 1, 0.8, 0, 0, 0, 0.4, 0),
  submarine: A(0, 1, 0.8, 0, 0.2, 0, 0, 0),
  log: A(0, 1, 0.9, 0, 0.1, 0, 0, 0),
  plank: A(0, 0.9, 0.9, 0, 0, 0.3, 0, 0),
  fish: A(0, 0.9, 0.6, 0, 0, 0, 0.4, 0),
  whale: A(0, 0.9, 0.7, 0, 0.3, 0, 0.3, 0),
  crocodile: A(0, 0.9, 0.9, 0, 0, 0, 0, 0.2),
  sofa: A(0, 0.8, 0.5, 0, 0.3, 0, 0.2, 0),
  bed: A(0, 0.8, 0.6, 0, 0, 0, 0, 0.3),
  table: A(0, 0.6, 0.4, 0, 0, 0.6, 0, 0.4),
  stone: A(0, 0.1, 0, 0, 1, 0, 0.3, 0),
  rock: A(0, 0.1, 0, 0, 1, 0, 0.2, 0),
  pebble: A(0, 0.1, 0, 0, 1, 0, 0.4, 0),
  boulder: A(0, 0.1, 0, 0, 1, 0, 0.2, 0),
  egg: A(0, 0, 0, 0, 1, 0, 0.6, 0),
  seed: A(0, 0, 0, 0, 1, 0, 0.5, 0),
  ball: A(0, 0, 0, 0, 1, 0, 0.7, 0),
  shell: A(0, 0, 0, 0, 0.9, 0, 0.7, 0),
  snail: A(0, 0, 0, 0, 0.8, 0, 0.8, 0),
  turtle: A(0, 0.3, 0, 0, 0.8, 0, 0.3, 0.2),
  cat: A(0, 0, 0, 0, 0.8, 0, 0.6, 0),
  hedgehog: A(0, 0, 0, 0, 1, 0, 0.5, 0),
  fist: A(0, 0, 0, 0, 1, 0, 0.3, 0),
  knot: A(0, 0, 0, 0, 0.9, 0, 0.5, 0),
  box: A(0.2, 0, 0, 0, 0.9, 0, 0, 0),
  cube: A(0.2, 0, 0, 0, 0.9, 0, 0, 0),
  mountain: A(0.4, 0, 0, 0.2, 0.6, 0, 0, 0.4),
  pyramid: A(0.4, 0, 0, 0, 0.7, 0, 0, 0.4),
  island: A(0, 0.4, 0, 0, 0.7, 0, 0.3, 0.2),
  bridge: A(0, 0.3, 0.8, 0, 0, 1, 0.2, 0),
  arch: A(0, 0.2, 0.4, 0, 0, 0.8, 0.8, 0),
  rainbow: A(0, 0.2, 0.5, 0, 0, 0.8, 0.9, 0),
  road: A(0, 0.4, 1, 0, 0, 0.6, 0, 0),
  river: A(0, 0.4, 1, 0, 0, 0.5, 0.4, 0),
  rope: A(0, 0.3, 1, 0, 0, 0.5, 0.2, 0),
  chain: A(0, 0.3, 1, 0, 0, 0.5, 0.2, 0),
  snake: A(0, 0.4, 1, 0, 0, 0.2, 0.6, 0),
  worm: A(0, 0.4, 0.9, 0, 0.1, 0, 0.5, 0),
  tunnel: A(0, 0.3, 0.8, 0, 0, 0.6, 0.3, 0),
  corridor: A(0, 0.3, 1, 0, 0, 0.6, 0, 0),
  wall: A(0.6, 0, 0.8, 0, 0, 0.5, 0, 0),
  gate: A(0.4, 0, 0.3, 0, 0, 0.7, 0, 0.3),
  door: A(0.8, 0, 0.5, 0, 0, 0.3, 0, 0),
  moon: A(0, 0, 0.2, 0, 0.3, 0, 1, 0),
  crescent: A(0, 0, 0.2, 0, 0.3, 0, 1, 0),
  hook: A(0.3, 0, 0.4, 0, 0.2, 0, 0.9, 0),
  bow: A(0.2, 0, 0.5, 0, 0, 0.3, 0.9, 0),
  banana: A(0, 0.2, 0.5, 0, 0.1, 0, 0.9, 0),
  wave: A(0, 0.5, 0.5, 0, 0, 0.2, 0.7, 0),
  question: A(0.3, 0, 0.3, 0, 0.3, 0, 0.8, 0),
  star: A(0, 0, 0.3, 0.3, 0, 0, 0, 1),
  starfish: A(0, 0, 0.3, 0.3, 0, 0, 0, 1),
  sun: A(0, 0, 0.2, 0.3, 0.1, 0, 0, 1),
  net: A(0, 0, 0.2, 0.2, 0, 0.3, 0, 1),
  web: A(0, 0, 0.2, 0.3, 0, 0.2, 0, 1),
  spider: A(0, 0, 0, 0.4, 0.2, 0, 0.2, 0.9),
  octopus: A(0, 0, 0.2, 0.5, 0.2, 0, 0.4, 0.8),
  windmill: A(0.5, 0, 0.3, 0.4, 0, 0, 0, 0.8),
  cross: A(0.7, 0, 0.6, 0.2, 0, 0, 0, 0.7),
  kite: A(0.3, 0, 0.4, 0.2, 0, 0, 0, 0.7),
  bird: A(0, 0, 0.3, 0.5, 0, 0, 0.2, 0.7),
  eagle: A(0, 0, 0.3, 0.5, 0, 0, 0.2, 0.8),
  butterfly: A(0, 0, 0.1, 0.4, 0, 0, 0.2, 0.9),
  wing: A(0, 0, 0.4, 0.4, 0, 0, 0.3, 0.6),
  airplane: A(0.2, 0, 0.6, 0.3, 0, 0, 0, 0.7),
  plane: A(0.2, 0, 0.6, 0.3, 0, 0, 0, 0.7),
  cloud: A(0, 0.3, 0, 0, 0.3, 0, 0.3, 0.6),
  feather: A(0.2, 0.2, 0.7, 0.3, 0, 0, 0.4, 0),
  leaf: A(0.1, 0.3, 0.5, 0.3, 0, 0, 0.4, 0.2),
  key: A(0.4, 0, 0.7, 0.2, 0.1, 0, 0, 0),
  chair: A(0.4, 0, 0, 0, 0.6, 0, 0.3, 0),
  dog: A(0, 0.5, 0.3, 0, 0.5, 0, 0.3, 0),
  bear: A(0.3, 0, 0, 0, 0.7, 0, 0.3, 0.2),
  baby: A(0, 0, 0, 0, 0.9, 0, 0.6, 0),
  fetus: A(0, 0, 0, 0, 1, 0, 0.8, 0),
  river_bed: A(0, 0.5, 0.9, 0, 0, 0.4, 0.3, 0),
}

// what the speech recogniser tends to hear instead of an article + object
const ALIASES = { about: 'boat', abridge: 'bridge', atree: 'tree', astone: 'stone', alarm: 'lamp', alone: 'stone', apostle: 'pole' }

// adjectives and verbs that describe a body, for objects not in the list
const DESCRIPTIVE = {
  UPRIGHT: { upright: 1, elongated: 0.3 },
  ELONGATED: { elongated: 1 },
  LATERAL_MOVEMENT: { horizontal: 0.8 },
  ROLLING: { horizontal: 1 },
  EXPANSION: { spread: 0.8, branching: 0.3 },
  CONTRACTION: { compact: 1 },
  STILLNESS: { compact: 0.4, upright: 0.2 },
  FLEXION: { compact: 0.6, curved: 0.6 },
  EXTENSION: { elongated: 0.5, spread: 0.6 },
}

export const ATTRIBUTES = ['upright', 'horizontal', 'elongated', 'branching', 'compact', 'spanning', 'curved', 'spread']

// attributes → the concepts the planner already understands (for measuring compatibility)
export function conceptsOf(attr) {
  const c = {
    UPRIGHT: attr.upright,
    ELONGATED: Math.max(attr.elongated, attr.spanning * 0.8),
    ROLLING: attr.horizontal,
    LATERAL_MOVEMENT: attr.horizontal * 0.6,
    EXPANSION: Math.max(attr.spread, attr.branching * 0.6),
    CONTRACTION: attr.compact,
    FLEXION: Math.max(attr.compact * 0.7, attr.curved),
    EXTENSION: Math.max(attr.branching * 0.7, attr.spanning, attr.spread * 0.8),
  }
  const out = {}
  for (const [k, v] of Object.entries(c)) if (v >= 0.15) out[k] = +v.toFixed(2)
  return out
}

const norm = (text) => ` ${String(text).toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
const singular = (w) => (OBJECTS[w] ? w : w.endsWith('es') && OBJECTS[w.slice(0, -2)] ? w.slice(0, -2) : w.endsWith('s') && OBJECTS[w.slice(0, -1)] ? w.slice(0, -1) : w)

// → { ok, sentence, object, attributes, concepts, source: 'lexicon' | 'description', error }
export function parseInstruction(text) {
  const s = norm(text)
  const sentence = s.trim()
  if (!sentence) return { ok: false, sentence, error: 'No words were recognised.' }
  const m = s.match(/ (?:you are|youre|you re|your|you were|you art|you r) (.*)$/)
  if (!m) return { ok: false, sentence, error: 'The instruction must begin with “You are…”.' }
  let rest = ` ${m[1]} `
  // drop articles and soft words: "you are now a tall lamp stand" → "tall lamp stand"
  rest = rest.replace(/ (now|slowly|becoming|turning into|turning|a|an|the|my|like|just|still a|very) /g, ' ').replace(/ (now|slowly|becoming|a|an|the) /g, ' ')
  let words = rest.trim().split(' ').filter(Boolean)
  // a recogniser's fusion of article and noun ("about" for "a boat")
  words = words.map((w) => (ALIASES[w] && !OBJECTS[w] ? ALIASES[w] : w))
  const joined = words.join(' ')
  // the longest known name in the phrase: "street lamp", "lamp stand", "palm tree"
  let object = null
  for (const name of Object.keys(OBJECTS).sort((a, b) => b.length - a.length)) {
    if (` ${joined} `.includes(` ${name} `)) {
      object = name
      break
    }
  }
  if (!object) for (const w of words) if (OBJECTS[singular(w)]) object = singular(w)
  const described = classify(rest)
  if (object) {
    const attributes = { ...OBJECTS[object] }
    // descriptive words colour the object a little ("a tall tree", "a small boat")
    for (const [c, w] of Object.entries(described.concepts)) for (const [a, v] of Object.entries(DESCRIPTIVE[c] ?? {})) attributes[a] = Math.min(1, attributes[a] + 0.3 * w * v)
    return { ok: true, sentence, object: object.replace('_', ' '), attributes, concepts: conceptsOf(attributes), source: 'lexicon' }
  }
  // not a known object: can it be pictured from the words around it?
  if (!described.unknown) {
    const attributes = Object.fromEntries(ATTRIBUTES.map((a) => [a, 0]))
    for (const [c, w] of Object.entries(described.concepts)) for (const [a, v] of Object.entries(DESCRIPTIVE[c] ?? {})) attributes[a] = Math.min(1, attributes[a] + w * v)
    const noun = words.filter((w) => !['tall', 'small', 'long', 'thin', 'big', 'round'].includes(w)).at(-1) ?? words.at(-1)
    return { ok: true, sentence, object: noun ?? 'something', attributes, concepts: conceptsOf(attributes), source: 'description' }
  }
  const named = words.at(-1)
  return { ok: false, sentence, object: named ?? null, error: named ? `He cannot picture “${named}”. Name an object that is upright, long, round, branching, spanning or curved.` : 'Name an object after “You are…”.' }
}

// the words of the phrases the recogniser should expect (helps the small model hear them)
export function expectedPhrases() {
  const names = Object.keys(OBJECTS).filter((n) => !n.includes('_'))
  const out = []
  for (const n of names) {
    const art = /^[aeiou]/.test(n) ? 'an' : 'a'
    out.push(`you are ${art} ${n}`)
  }
  return out
}

export const article = (object) => (/^[aeiou]/.test(object) ? 'AN' : 'A')
