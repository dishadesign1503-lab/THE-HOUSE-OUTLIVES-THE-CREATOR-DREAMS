// WHAT AN INSTRUCTION SUGGESTS (a small local classifier; no network, no language model).
//
// A spoken hypnotic instruction ("You are a boat drifting sideways") becomes a handful of weighted
// concepts. Words and short phrases each suggest one or more concepts; a phrase may suggest several
// ("a boat slowly turning sideways" → LATERAL_MOVEMENT and ROLLING). Negation ("don't move") turns
// movement into stillness. The result only suggests: the agent decides what, if anything, it means.
//
//   classify(text) → { concepts: { UPRIGHT: 0..1, … }, top: [names], unknown, forceful, words }

export const CONCEPTS = ['UPRIGHT', 'ELONGATED', 'LATERAL_MOVEMENT', 'ROLLING', 'EXPANSION', 'CONTRACTION', 'STILLNESS', 'FLEXION', 'EXTENSION', 'UNKNOWN']

// word stem → { concept: weight }
const U = 'UPRIGHT'
const L = 'ELONGATED'
const S = 'LATERAL_MOVEMENT'
const R = 'ROLLING'
const X = 'EXPANSION'
const C = 'CONTRACTION'
const T = 'STILLNESS'
const F = 'FLEXION'
const E = 'EXTENSION'

const WORDS = {
  lamp: { [U]: 0.8, [L]: 0.4 },
  stand: { [U]: 0.9 },
  upright: { [U]: 1 },
  tower: { [U]: 0.9, [L]: 0.5 },
  pillar: { [U]: 1, [T]: 0.3 },
  column: { [U]: 1 },
  pole: { [U]: 0.8, [L]: 0.6 },
  mast: { [U]: 0.8, [L]: 0.5 },
  candle: { [U]: 0.8, [T]: 0.3 },
  tall: { [U]: 0.6, [L]: 0.6 },
  vertical: { [U]: 1 },
  straight: { [U]: 0.6, [E]: 0.4 },
  rise: { [U]: 0.6, [L]: 0.3 },
  tree: { [U]: 0.5, [L]: 0.5, [E]: 0.3 },
  sky: { [L]: 0.3, [X]: 0.4 },
  long: { [L]: 1 },
  length: { [L]: 0.9 },
  river: { [L]: 0.8, [S]: 0.3 },
  snake: { [L]: 0.8, [S]: 0.4 },
  rope: { [L]: 0.8 },
  road: { [L]: 0.8 },
  thin: { [L]: 0.6, [C]: 0.3 },
  stretch: { [E]: 0.9, [L]: 0.6 },
  reach: { [E]: 0.8, [L]: 0.4 },
  extend: { [E]: 0.8, [L]: 0.5 },
  arm: { [E]: 0.4 },
  leg: { [E]: 0.3 },
  unfold: { [E]: 0.9, [X]: 0.4 },
  open: { [X]: 0.6, [E]: 0.4 },
  star: { [E]: 0.8, [X]: 0.5 },
  wing: { [E]: 0.8, [X]: 0.4 },
  branch: { [E]: 0.6 },
  fly: { [E]: 0.6, [X]: 0.4 },
  side: { [S]: 0.6, [R]: 0.4 },
  sideway: { [S]: 1 },
  sideways: { [S]: 1 },
  drift: { [S]: 0.9 },
  boat: { [S]: 0.6, [R]: 0.3 },
  slide: { [S]: 0.9 },
  crab: { [S]: 0.9 },
  lean: { [S]: 0.7 },
  shift: { [S]: 0.7 },
  float: { [S]: 0.5, [T]: 0.2 },
  tide: { [S]: 0.6 },
  wave: { [S]: 0.4, [R]: 0.3 },
  left: { [S]: 0.5 },
  right: { [S]: 0.5 },
  move: { [S]: 0.4, [R]: 0.2 },
  roll: { [R]: 1 },
  turn: { [R]: 0.9 },
  over: { [R]: 0.3 },
  wheel: { [R]: 0.9 },
  spin: { [R]: 0.9 },
  tumble: { [R]: 0.9 },
  rotate: { [R]: 1 },
  barrel: { [R]: 0.7 },
  log: { [R]: 0.5, [L]: 0.4 },
  big: { [X]: 0.9 },
  large: { [X]: 0.9 },
  grow: { [X]: 0.9 },
  expand: { [X]: 1 },
  wide: { [X]: 0.9, [E]: 0.3 },
  widen: { [X]: 1 },
  spread: { [X]: 0.8, [E]: 0.5 },
  swell: { [X]: 0.9 },
  vast: { [X]: 0.8 },
  ocean: { [X]: 0.4, [S]: 0.2 },
  cloud: { [X]: 0.6, [S]: 0.2 },
  breathe: { [X]: 0.4, [T]: 0.2 },
  sun: { [X]: 0.4 },
  small: { [C]: 1 },
  little: { [C]: 0.8 },
  tiny: { [C]: 1 },
  shrink: { [C]: 1 },
  compact: { [C]: 0.9 },
  seed: { [C]: 0.8, [F]: 0.3 },
  stone: { [C]: 0.5, [T]: 0.6 },
  rock: { [C]: 0.4, [T]: 0.6 },
  pebble: { [C]: 0.8, [T]: 0.3 },
  close: { [C]: 0.4 },
  tight: { [C]: 0.7, [F]: 0.3 },
  narrow: { [C]: 0.8, [L]: 0.2 },
  ball: { [C]: 0.6, [F]: 0.4 },
  shell: { [C]: 0.6, [F]: 0.4 },
  knot: { [C]: 0.6, [F]: 0.5 },
  still: { [T]: 1 },
  rest: { [T]: 0.8 },
  calm: { [T]: 0.8 },
  quiet: { [T]: 0.7 },
  frozen: { [T]: 0.9 },
  freeze: { [T]: 0.9 },
  statue: { [T]: 0.9, [U]: 0.3 },
  heavy: { [T]: 0.7, [C]: 0.2 },
  bottom: { [T]: 0.5 },
  sleep: { [T]: 0.7 },
  deep: { [T]: 0.5 },
  silent: { [T]: 0.7 },
  motionless: { [T]: 1 },
  sink: { [T]: 0.7, [C]: 0.2 },
  settle: { [T]: 0.8 },
  stillness: { [T]: 1 },
  curl: { [F]: 1, [C]: 0.5 },
  bend: { [F]: 0.9 },
  fold: { [F]: 0.8, [C]: 0.5 },
  knee: { [F]: 0.7 },
  crouch: { [F]: 0.9, [C]: 0.4 },
  hug: { [F]: 0.8, [C]: 0.3 },
  coil: { [F]: 0.9, [C]: 0.4 },
  hook: { [F]: 0.6 },
  embrace: { [F]: 0.7 },
  fetal: { [F]: 1, [C]: 0.6 },
  bow: { [F]: 0.6 },
}

// phrases, matched on the normalised text before the words
const PHRASES = [
  ['into yourself', { [F]: 1, [C]: 0.6 }],
  ['onto your side', { [R]: 1, [S]: 0.5 }],
  ['on your side', { [R]: 0.7, [S]: 0.5 }],
  ['lamp stand', { [U]: 1, [L]: 0.5 }],
  ['bottom of the sea', { [T]: 0.8, [C]: 0.3 }],
  ['turn over', { [R]: 1 }],
  ['roll over', { [R]: 1 }],
  ['perfectly still', { [T]: 1 }],
  ['become smaller', { [C]: 1 }],
  ['becoming smaller', { [C]: 1 }],
  ['hold yourself', { [F]: 0.8, [C]: 0.4 }],
]

const MOVING = new Set([S, R, X, E, U, L, F])
const NEGATIONS = new Set(['not', 'no', 'dont', 'never', 'stop', 'cannot', 'cant'])
const FORCEFUL = new Set(['now', 'wake', 'immediately', 'quick', 'quickly', 'hurry', 'move', 'must', 'obey', 'get'])

// a gentle stemmer: enough for "drifting" → drift, "smaller" → small, "knees" → knee
function stem(w) {
  if (WORDS[w]) return w
  for (const suf of ['ingly', 'ing', 'edly', 'ed', 'ers', 'er', 'est', 'ly', 'es', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      let b = w.slice(0, -suf.length)
      if (WORDS[b]) return b
      // doubled consonant: "stopping" → stop, "bigger" → big
      if (b.length > 2 && b[b.length - 1] === b[b.length - 2] && WORDS[b.slice(0, -1)]) return b.slice(0, -1)
      if (WORDS[`${b}e`]) return `${b}e` // "curling" no, "rising" → rise
      b = b.replace(/i$/, 'y')
      if (WORDS[b]) return b
    }
  }
  return w
}

export function classify(text = '') {
  const norm = ` ${String(text).toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
  const acc = Object.fromEntries(CONCEPTS.map((c) => [c, 0]))
  const add = (m, k = 1) => {
    for (const [c, w] of Object.entries(m)) acc[c] += w * k
  }
  let rest = norm
  for (const [p, m] of PHRASES) {
    if (rest.includes(` ${p} `)) {
      add(m)
      rest = rest.replace(` ${p} `, ' ')
    }
  }
  const words = rest.trim().split(' ').filter(Boolean)
  let negated = 0
  let forceful = 0
  let known = 0
  for (const w of words) {
    if (NEGATIONS.has(w)) {
      negated = 2
      continue
    }
    if (FORCEFUL.has(w) && negated === 0) forceful += 0.35
    const m = WORDS[stem(w)]
    if (m) {
      known++
      if (negated > 0) {
        // "don't move", "not turning": what is negated becomes stillness
        const moving = Object.keys(m).some((c) => MOVING.has(c))
        if (moving) acc[T] += 0.6
        else add(m)
      } else add(m)
    }
    negated = Math.max(0, negated - 1)
  }
  if (/!/.test(text)) forceful += 0.3
  // scale so the strongest concept is at most 1; weak traces are dropped
  const max = Math.max(...CONCEPTS.map((c) => acc[c]))
  const concepts = {}
  for (const c of CONCEPTS) {
    const v = max > 1 ? acc[c] / max : acc[c]
    if (v >= 0.15) concepts[c] = +v.toFixed(2)
  }
  const unknown = Object.keys(concepts).length === 0
  if (unknown) concepts.UNKNOWN = 1
  const top = Object.entries(concepts)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
  return { text: norm.trim(), concepts, top, unknown, forceful: Math.min(1, forceful), words: words.length, known }
}

// How alike two suggestions are (0..1), for noticing repetition.
export function similarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let dot = 0
  let na = 0
  let nb = 0
  for (const k of keys) {
    const x = a[k] ?? 0
    const y = b[k] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
