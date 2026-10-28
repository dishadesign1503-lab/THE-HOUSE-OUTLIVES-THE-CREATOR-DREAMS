// WHAT HE CAN PERCEIVE.
//
// The Vastu Purusha is blind. This is the only doorway between the house and his mind: it turns
// the physical state of each room into what the body region lying under that room feels —
// warmth or cold, moving air, sound, trembling, smell, the floor against the skin.
// Nothing about the interface (the cursor, selection, zoom, colours, effects) passes through here.

import { clamp } from '../sim/rng.js'
import { CENTRE, FLOORS, ROOMS } from '../house/plan.js'
import { COMFORT, restCentre } from '../house/environment.js'

// How sensitive each body region is (the head and feet feel temperature most keenly).
export const REGION_WEIGHT = { head: 1.3, feet: 1.4, navel: 1.2, armN: 1, armE: 1, handNW: 0.9, handSE: 0.9, legW: 1, legS: 1 }

// Unit vectors from the centre of the body to each room (the navel's own room has none).
const DIR = Object.fromEntries(
  ROOMS.map((r) => {
    const c = restCentre(r.id)
    const dx = c.x - CENTRE.x
    const dy = c.y - CENTRE.y
    const d = Math.hypot(dx, dy)
    return [r.id, d > 0.1 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }]
  }),
)

// Where does a sound seem to come from, given how loud it is under each part of the body?
// Louder regions weigh more; sounds from opposite sides cancel into uncertainty.
export function localise(levels) {
  let wx = 0
  let wy = 0
  let w = 0
  for (const [room, L] of Object.entries(levels)) {
    const k = L * L
    wx += DIR[room].x * k
    wy += DIR[room].y * k
    w += k
  }
  if (w < 1e-6) return null
  const x = wx / w
  const y = wy / w
  const m = Math.hypot(x, y)
  return { x: m > 0 ? x / m : 0, y: m > 0 ? y / m : 0, certainty: clamp(m * 1.25) }
}

export function perceive(env) {
  const regions = {}
  let wsum = 0
  const acc = { cold: 0, hot: 0, draft: 0 }
  let soundTotal = 0
  let vibMax = 0
  const soundLevels = {}
  for (const r of ROOMS) {
    const room = env.rooms[r.id]
    const felt = room.temp + FLOORS[room.floor].contact * 0.5
    const coldAir = room.air.temp < 16 ? 1 : 0.5
    const reg = {
      room: r.id,
      felt,
      cold: clamp((COMFORT.lo - felt) / 6),
      hot: clamp((felt - COMFORT.hi) / 5),
      draft: clamp((room.air.mag - 0.06) / 0.25) * coldAir,
      airDir: room.air.mag > 0.05 ? { x: room.air.vx / room.air.mag, y: room.air.vy / room.air.mag } : null,
      sound: room.sound,
      vib: clamp(room.vib),
      scent: { ...room.scent },
      floor: room.floor,
    }
    regions[r.region] = reg
    const w = REGION_WEIGHT[r.region]
    wsum += w
    acc.cold += reg.cold * w
    acc.hot += reg.hot * w
    acc.draft += reg.draft * w
    soundTotal += reg.sound
    vibMax = Math.max(vibMax, reg.vib)
    soundLevels[r.id] = room.sound
  }
  return {
    regions,
    cold: acc.cold / wsum,
    hot: acc.hot / wsum,
    draft: acc.draft / wsum,
    sound: { total: soundTotal / ROOMS.length, max: Math.max(...Object.values(soundLevels)), where: localise(soundLevels), levels: soundLevels },
    vib: vibMax,
    // The storm can be heard and felt through the walls, not seen.
    storm: env.outside.storm ? env.outside.wind : 0,
  }
}

export { DIR }
