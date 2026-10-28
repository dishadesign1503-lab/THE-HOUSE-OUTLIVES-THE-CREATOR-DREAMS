// WHAT THE DAEMON IMAGINES IN EACH ROOM — fictional scenes, editable.
//
// When the visitor enters the house, the daemon reads the whole layout once (its moods, memory,
// the room's neighbours, Vastu status, neglect) and picks one scene per room. The choice is
// weighted and seeded, so it holds still during the walk, but the same plan can become a
// different house after a different history.
//
// Three layers are kept apart, as in the brief:
//   heard     — what the daemon perceived (acoustic only: it cannot see)
//   believes  — what it infers from that
//   see       — what the visitor is shown: the daemon's imagined scene
// These are creative interpretations, never claims about real houses or real lives.

import { zoneOfCell } from '../engine/layout.js'
import { ROOM_TYPES } from '../engine/rooms.js'

export const MOODS = ['harmony', 'tension', 'loss', 'neglect', 'quiet']

const SEE = {
  living: {
    harmony: ['A family is gathered here. Someone laughs at something you missed.', 'Cushions pressed by people who just sat down. Warm light, easy talk.'],
    tension: ['Two people stand too close, voices rising. The light will not settle.', 'An argument that started before you came in, and will go on after.'],
    loss: ['An empty sofa. One chair turned away from the others.', 'The room is arranged for people who are no longer here.'],
    neglect: ['Dust sheets over the furniture. Nobody has sat here for years.'],
    quiet: ['Someone reads alone. The room is calm and a little empty.'],
  },
  bedroom: {
    harmony: ['Someone sleeps peacefully. The window is open a hand’s width.', 'A made bed, a lamp left on for someone coming home.'],
    tension: ['Two figures with their backs to each other. Nobody is sleeping.', 'A quarrel kept to whispers so the house will not hear. It hears.'],
    loss: ['A bed with one side untouched. A single pillow.', 'The bed is made too neatly, as if no one is coming back to it.'],
    neglect: ['A sheet over the bed, grey with dust.'],
    quiet: ['A plain, still room. Nobody is resting here right now.'],
  },
  kitchen: {
    harmony: ['Something simmers. Two people cook side by side.', 'The stove is warm and the counter is busy.'],
    tension: ['A pot boils over and nobody moves. Tense silence at the counter.', 'Someone cooks with their back to the door, too fast.'],
    loss: ['A cold stove. One cup on the counter.', 'The kitchen still smells faintly of a meal nobody finished.'],
    neglect: ['Rust on the stove. The tap has dripped for years.'],
    quiet: ['A tidy kitchen between meals.'],
  },
  dining: {
    harmony: ['A shared meal. Every chair is taken.', 'Plates passed hand to hand, laughter over the table.'],
    tension: ['Two people at opposite ends of the table, not eating.', 'A meal interrupted. A chair pushed back hard.'],
    loss: ['The table is set for four. One chair is pulled away, empty.', 'An empty table and a chair nobody pushed back in.'],
    neglect: ['Dust on the table, a cloth gone grey.'],
    quiet: ['An empty table, waiting for the next meal.'],
  },
  prayer: {
    harmony: ['A lamp is lit. Someone sits in stillness.', 'Soft light and quiet. The air does not move.'],
    tension: ['The lamp flickers. Nobody has come to sit here today.'],
    loss: ['An unlit lamp. Flowers left a long time ago.'],
    neglect: ['The shrine is covered in dust; the lamp is dry.'],
    quiet: ['A small, quiet room with an unlit lamp.'],
  },
  bathroom: {
    harmony: ['Steam on the mirror, water running, someone humming.'],
    tension: ['The tap left running. A door slammed somewhere.'],
    loss: ['Dry towels, a dry basin. Only the pipes talk.'],
    neglect: ['Stains down the walls; the pipes knock and drip.'],
    quiet: ['A clean, empty bathroom. One slow drip.'],
  },
  garden: {
    harmony: ['Children play in the courtyard. Birds at the edges.', 'Sunlight and wind, and someone sitting on the bench.'],
    tension: ['Someone paces the courtyard alone, phone to their ear.'],
    loss: ['An empty bench and leaves nobody has swept.'],
    neglect: ['The courtyard is overgrown and dry.'],
    quiet: ['A calm courtyard open to the sky.'],
  },
  entrance: {
    harmony: ['Someone is just arriving, shoes at the door, a greeting from inside.'],
    tension: ['The front door has just been slammed. The frame is still shaking.'],
    loss: ['A coat on the hook that nobody wears any more.', 'Footsteps going away, down the corridor.'],
    neglect: ['Post piled behind the door. Nobody has visited for years.'],
    quiet: ['A plain hallway. Shoes, a bench, a lamp.'],
  },
  study: {
    harmony: ['Someone working, pen moving, quietly content.'],
    tension: ['Papers scattered across the floor. A chair knocked back.'],
    loss: ['A chair turned away from the desk. An unfinished letter.'],
    neglect: ['Books swollen with damp; the desk lamp is dead.'],
    quiet: ['A desk, a chair, an open notebook.'],
  },
  storage: {
    harmony: ['Shelves in order: jars, tools, things that are used.'],
    tension: ['Boxes pulled out and left open, as if someone searched in anger.'],
    loss: ['Boxes labelled with a name the house no longer hears.'],
    neglect: ['Crates under dust; something has nested here.'],
    quiet: ['Crates and shelves, nothing moving.'],
  },
  staircase: {
    harmony: ['Footsteps overhead, light and quick.'],
    tension: ['Someone stamps up the stairs. A door shuts above.'],
    loss: ['Footsteps climb and do not come down again.'],
    neglect: ['The stairs lead to a closed door. The upper floor was never built.'],
    quiet: ['Stairs to an upper floor that does not exist yet.'],
  },
}

const HEARD = {
  harmony: ['several voices at an easy pace, cutlery, a laugh', 'unhurried footsteps and talk that keeps returning'],
  tension: ['two voices rising over each other, then a door', 'fast footsteps, a sharp sigh, a raised pitch'],
  loss: ['one set of footsteps moving away, then a long echo', 'a clock, and almost nothing else'],
  neglect: ['a drip, the hum, a creak in the beams', 'nothing it could recognise for a long time'],
  quiet: ['room tone and the hum', 'a little movement, then stillness'],
}

const BELIEVES = {
  harmony: 'I believe this {room} is lived in happily.',
  tension: 'I believe the {room} is where they argue.',
  loss: 'I believe someone has gone from the {room}.',
  neglect: 'I believe nobody comes to the {room} any more.',
  quiet: 'I believe the {room} is simply waiting.',
}

export const LIGHT = {
  harmony: { colour: '#ffd29a', intensity: 1.7 },
  tension: { colour: '#9fb3c8', intensity: 1.05 },
  loss: { colour: '#a9c8e8', intensity: 0.85 },
  neglect: { colour: '#8c8473', intensity: 0.35 },
  quiet: { colour: '#f1dfbf', intensity: 1.05 },
}

// Sound layers heard inside a room with this scene (mixed with the house underneath).
export function sceneSound(type, mood) {
  const base = {
    harmony: { voices: 0.5, laughter: 0.45, footsteps: 0.2, house: 0.5 },
    tension: { argument: 0.85, sigh: 0.5, tension: 0.6, footsteps: 0.5 },
    loss: { crying: 0.55, fadingVoice: 0.4, clock: 0.55, mourning: 0.5, wind: 0.2 },
    neglect: { drip: 0.6, creak: 0.6, resonance: 0.5, doorsMoving: 0.4, wind: 0.45, hum: 0.12, ventRattle: 0.7, vent: 0.2 },
    quiet: { house: 0.5, clock: 0.25, wind: 0.2, hum: 0.3 },
  }[mood]
  const extra = {}
  if (mood === 'harmony') {
    if (type === 'kitchen') Object.assign(extra, { clinks: 0.7, cooking: 0.6 })
    if (type === 'dining') Object.assign(extra, { clinks: 0.8, laughter: 0.7 })
    if (type === 'garden') Object.assign(extra, { birds: 0.95, children: 0.55, wind: 0.45, voices: 0.15 })
    if (type === 'bathroom') Object.assign(extra, { water: 0.7, voices: 0.1, laughter: 0 })
    if (type === 'prayer') Object.assign(extra, { voices: 0, laughter: 0, house: 0.2, mourning: 0.15 })
    if (type === 'bedroom') Object.assign(extra, { voices: 0.15, laughter: 0.05, clock: 0.15 })
  }
  if (type === 'bathroom' && mood !== 'harmony') Object.assign(extra, { drip: 0.6, pipes: 0.4 })
  if (type === 'garden') extra.wind = Math.max(extra.wind ?? 0, 0.4)
  return { ...base, ...extra }
}

export const ENTER_SOUND = { harmony: 'laugh', tension: 'door', loss: 'stepsAway', neglect: null, quiet: null }

// Small deterministic random numbers, so a walkthrough holds still.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

const pickFrom = (arr, r) => arr[Math.floor(r() * arr.length)]

// Score each mood for one room, from the whole house and the room's own situation.
function scores(room, ctx) {
  const { analysis, view, house, vastuOf } = ctx
  const g = view.mood
  const info = analysis.byId.get(room.id)
  const roomMood = view.interpretation?.roomMoods?.[room.id]
  const mark = view.roomMarks?.[room.id]?.mark
  const neighbours = info ? info.neighbours : []
  const tenseNeighbours = neighbours.filter((id) => view.interpretation?.roomMoods?.[id] === 'tense').length
  const isolated = !!analysis.isolated.find((r) => r.id === room.id)
  const neglected = house.neglected.includes(zoneOfCell(room.col, room.row))
  const status = vastuOf(room.id)?.status
  const confusion = Math.max(view.confusion, g.unstable)
  return {
    harmony: 0.2 + g.coherent * 1.1 + (roomMood === 'coherent' ? 0.6 : 0) + (status === 'aligned' ? 0.35 : 0) + (neighbours.length >= 2 ? 0.2 : 0) + (room.gilded ? 0.3 : 0) + (house.features.lamps ? 0.1 : 0),
    tension: g.tense * 1.1 + (roomMood === 'tense' ? 0.8 : 0) + (status === 'conflict' ? 0.45 : 0) + tenseNeighbours * 0.25 + view.recentTensions * 0.08 + (mark === 'disturbed' ? 0.4 : 0) + confusion * 0.3,
    loss: g.loss * 1.0 + (isolated ? 0.9 : 0) + (roomMood === 'loss' ? 0.6 : 0) + (mark === 'fading' ? 0.4 : 0) + (neighbours.length === 0 ? 0.3 : 0) + confusion * 0.3,
    neglect: g.forgotten * 1.2 + (room.dormant ? 3 : 0) + (neglected ? 0.9 : 0) + view.abandonments * 0.08 + (view.dormant ? 1.5 : 0),
    quiet: 0.35,
  }
}

export function chooseScenes(rooms, ctx) {
  const r = rng(ctx.seed)
  const byId = {}
  const confusion = Math.max(ctx.view.confusion, ctx.view.mood.unstable)
  let coins = 0
  for (const room of rooms) {
    const s = scores(room, ctx)
    // weighted choice; sharper when the daemon is sure, looser when it is confused
    const temp = 0.22 + confusion * 0.3
    const max = Math.max(...MOODS.map((m) => s[m]))
    const weights = MOODS.map((m) => Math.exp((s[m] - max) / temp))
    let x = r() * weights.reduce((a, b) => a + b, 0)
    let mood = MOODS[MOODS.length - 1]
    for (let i = 0; i < MOODS.length; i++) {
      x -= weights[i]
      if (x <= 0) {
        mood = MOODS[i]
        break
      }
    }
    if (room.dormant) mood = 'neglect'
    const label = ROOM_TYPES[room.type].label.toLowerCase()
    const coin = mood === 'harmony' && coins < ctx.maxCoins && !ctx.coinTaken(room.id)
    if (coin) coins++
    byId[room.id] = {
      mood,
      flicker: confusion > 0.5 && mood !== 'harmony',
      see: pickFrom((SEE[room.type] ?? SEE.living)[mood] ?? SEE.living[mood], r),
      heard: pickFrom(HEARD[mood], r),
      believes: BELIEVES[mood].replace('{room}', label),
      light: LIGHT[mood],
      sound: sceneSound(room.type, mood),
      coin,
      seed: Math.floor(r() * 1e9),
    }
  }
  return byId
}
