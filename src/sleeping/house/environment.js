// THE HOUSE AS A PHYSICAL SYSTEM.
//
// Temperature, airflow, sound, vibration and scent per room, and how they travel through the
// plan's openings and walls. Every user action changes this state; the entity never sees the
// interface — it only perceives what this module produces (see senses.js).
//
// Units are "prototype physics": °C, seconds, and 0..1 levels. The constants are tuned so a
// change becomes noticeable within seconds and settles within half a minute.

import { clamp } from '../sim/rng.js'
import {
  ADJACENT, CENTRE, FLOORS, OBJECTS, OPENING, OPENINGS, ROOM, ROOM_IDS, WINDOWS, WINDOW,
  openingPoint, restLattice, roomCentre, roomPoint, windowPoint, windward,
} from './plan.js'

const REST = restLattice()
export const COMFORT = { lo: 18, hi: 24.5 }
export const DRAFT = 0.12 // airflow above this is felt as a draft
const SCENTS = ['incense', 'food', 'smoke', 'flowers', 'spoiled']
const INCENSE_BURN_S = 50

// ---------- creation ----------

export function createEnvironment() {
  const env = {
    t: 0,
    outside: { temp: 3, wind: 1, storm: false },
    rooms: {},
    doors: {},
    windows: {},
    objects: {},
    sounds: [], // active sound sources
    impulses: [], // vibration impulses waiting to be applied
    events: [], // sensory events produced this step (read and cleared by the world)
    eventLog: [], // recent events, for "related" links
    lastThermalAction: -999,
    lastThermalByRoom: {},
    flows: [],
    dirty: true,
    nextId: 1,
    stats: { userActions: 0, loud: 0 },
  }
  for (const id of ROOM_IDS) {
    env.rooms[id] = {
      temp: 20,
      vib: 0,
      sound: 0,
      scent: Object.fromEntries(SCENTS.map((s) => [s, 0])),
      air: { mag: 0, vx: 0, vy: 0, temp: 20 },
      floor: ROOM[id].floor,
      felt: 20,
      band: 'ok',
      lastEventFelt: 20,
      drafty: false,
      scentOn: Object.fromEntries(SCENTS.map((s) => [s, false])),
    }
  }
  for (const o of OPENINGS) if (o.kind === 'door') env.doors[o.id] = o.open
  for (const w of WINDOWS) env.windows[w.id] = w.open
  for (const o of OBJECTS) {
    env.objects[o.id] = {
      level: o.level ?? 0,
      on: o.on ?? false,
      since: 0,
      disruptive: false,
      nextThump: 0,
      sticks: [],
    }
  }
  // Settle the initial temperatures, so the house starts in its own equilibrium.
  for (let i = 0; i < 1200; i++) step(env, 0.25, { quiet: true })
  env.t = 0
  env.events = []
  env.eventLog = []
  for (const r of Object.values(env.rooms)) {
    r.felt = r.temp + FLOORS[r.floor].contact * 0.5
    r.band = r.felt < COMFORT.lo ? 'cold' : r.felt > COMFORT.hi ? 'hot' : 'ok'
    r.lastEventFelt = r.felt
    r.drafty = r.air.mag > DRAFT
  }
  syncHums(env)
  return env
}

// ---------- helpers ----------

export const restCentre = (roomId) => roomCentre(ROOM[roomId], REST)

function sourcePoint(roomId, u = 0.5, v = 0.5) {
  return roomPoint(ROOM[roomId], REST, u, v)
}

function opening(aId, bId) {
  return OPENINGS.find((o) => (o.a === aId && o.b === bId) || (o.a === bId && o.b === aId))
}

const openOf = (env, o) => (o.kind === 'arch' ? true : env.doors[o.id])

// Air conductance between two adjacent rooms.
function airG(env, a, b) {
  const o = opening(a, b)
  if (!o) return 0
  if (o.kind === 'arch') return 1
  return env.doors[o.id] ? 0.8 : 0.03
}
// Sound transmission between adjacent rooms (walls always pass a little).
function soundG(env, a, b) {
  const o = opening(a, b)
  if (!o) return 0.08
  if (o.kind === 'arch') return 0.6
  return env.doors[o.id] ? 0.5 : 0.18
}
// Heat conductance between adjacent rooms.
function heatG(env, a, b) {
  const o = opening(a, b)
  let g = 0.006
  if (o) g += o.kind === 'arch' ? 0.05 : env.doors[o.id] ? 0.045 : 0.01
  return g
}
// Structure-borne vibration between adjacent rooms, damped by soft floors.
function vibG(env, a, b) {
  const da = FLOORS[env.rooms[a].floor].damp
  const db = FLOORS[env.rooms[b].floor].damp
  return 0.5 * Math.min(da, db)
}

// The strongest path (max product of edge factors) from one room to all others.
function transmission(env, from, edgeFn) {
  const best = Object.fromEntries(ROOM_IDS.map((id) => [id, 0]))
  best[from] = 1
  const done = new Set()
  for (let k = 0; k < ROOM_IDS.length; k++) {
    let cur = null
    for (const id of ROOM_IDS) if (!done.has(id) && (cur === null || best[id] > best[cur])) cur = id
    if (cur === null || best[cur] === 0) break
    done.add(cur)
    for (const [a, b] of ADJACENT) {
      const other = a === cur ? b : b === cur ? a : null
      if (!other || done.has(other)) continue
      const v = best[cur] * edgeFn(env, cur, other)
      if (v > best[other]) best[other] = v
    }
  }
  return best
}

function rebuild(env) {
  env.soundT = Object.fromEntries(ROOM_IDS.map((id) => [id, transmission(env, id, soundG)]))
  env.vibT = Object.fromEntries(ROOM_IDS.map((id) => [id, transmission(env, id, vibG)]))
  solveAir(env)
  env.dirty = false
}

// ---------- airflow: a small pressure network ----------
// Nodes are rooms, plus the windward outside (pressure 1) and the leeward outside (0).
function solveAir(env) {
  const g = {}
  const gin = {}
  const gout = {}
  for (const id of ROOM_IDS) {
    g[id] = {}
    gin[id] = 0
    gout[id] = 0
  }
  for (const [a, b] of ADJACENT) {
    const c = airG(env, a, b)
    if (c > 0) {
      g[a][b] = c
      g[b][a] = c
    }
  }
  // Leaks: every outer room breathes a little, so the network always has a solution.
  for (const w of WINDOWS) {
    if (w.kind === 'lantern') continue
    if (windward(w)) gin[w.room] += 0.01
    else gout[w.room] += 0.01
  }
  for (const w of WINDOWS) {
    if (!env.windows[w.id]) continue
    if (w.kind === 'lantern') gout[w.room] += 0.5
    else if (w.kind === 'frontdoor') gin[w.room] += 0.9
    else if (windward(w)) gin[w.room] += 0.6
    else gout[w.room] += 0.6
  }
  if (env.objects.extractor.on) gout.kitchen += 0.7
  const p = Object.fromEntries(ROOM_IDS.map((id) => [id, 0.5]))
  for (let it = 0; it < 80; it++) {
    for (const id of ROOM_IDS) {
      let num = gin[id]
      let den = gin[id] + gout[id]
      for (const [o, c] of Object.entries(g[id])) {
        num += c * p[o]
        den += c
      }
      if (den > 0) p[id] = num / den
    }
  }
  const W = env.outside.wind
  const flows = [] // { from, to, f, at } — 'IN'/'OUT' for outside
  for (const [a, b] of ADJACENT) {
    const c = g[a][b]
    if (!c) continue
    const f = W * c * (p[a] - p[b])
    const o = opening(a, b)
    const at = o ? openingPoint(o, REST) : null
    if (f > 0) flows.push({ from: a, to: b, f, at })
    else if (f < 0) flows.push({ from: b, to: a, f: -f, at })
  }
  for (const w of WINDOWS) {
    const at = windowPoint(w, REST)
    const open = env.windows[w.id]
    const isIn = w.kind !== 'lantern' && windward(w)
    let c = open ? (w.kind === 'lantern' ? 0.5 : w.kind === 'frontdoor' ? 0.9 : 0.6) : 0.01
    if (w.kind === 'lantern' && !open) continue
    if (isIn) flows.push({ from: 'IN', to: w.room, f: W * c * (1 - p[w.room]), at, window: w.id })
    else flows.push({ from: w.room, to: 'OUT', f: W * c * p[w.room], at, window: w.id })
  }
  if (env.objects.extractor.on) {
    const at = sourcePoint('kitchen', 0.88, 0.15)
    flows.push({ from: 'kitchen', to: 'OUT', f: W * 0.7 * p.kitchen + 0.12, at, fan: true })
  }
  env.flows = flows
  env.pressure = p

  for (const id of ROOM_IDS) {
    const c = restCentre(id)
    let sum = 0
    let vx = 0
    let vy = 0
    for (const fl of flows) {
      if (fl.from !== id && fl.to !== id) continue
      sum += fl.f
      const at = fl.at ?? c
      let dx = at.x - c.x
      let dy = at.y - c.y
      if (fl.to === id) {
        dx = -dx
        dy = -dy
      }
      const d = Math.hypot(dx, dy) || 1
      vx += (fl.f * dx) / d
      vy += (fl.f * dy) / d
    }
    // Single-sided ventilation: an open window moves a little air even without through-flow.
    const openHere = WINDOWS.filter((w) => w.room === id && env.windows[w.id]).length
    const mag = 0.5 * sum + openHere * 0.03 * W
    const d = Math.hypot(vx, vy) || 1
    env.rooms[id].air.mag = mag
    env.rooms[id].air.vx = (vx / d) * mag
    env.rooms[id].air.vy = (vy / d) * mag
  }
}

// ---------- sound sources ----------
// pattern: 'once' (a single sound of `dur`), 'ring' (telephone), 'pulse' (repeated hits),
// 'chime' (hidden clock bursts), 'steady' (radio, hum).

export function addSound(env, src) {
  const s = {
    id: `s${env.nextId++}`,
    start: env.t,
    until: src.dur ? env.t + src.dur : Infinity,
    u: 0.5,
    v: 0.5,
    lastPulse: -1,
    cause: 'user',
    ...src,
  }
  env.sounds.push(s)
  return s
}

function soundLevel(s, t) {
  const k = t - s.start
  if (t > s.until) return 0
  switch (s.pattern) {
    case 'ring': {
      const ph = k % 4
      return ph < 1.6 ? s.level * (0.75 + 0.25 * Math.abs(Math.sin(k * 60))) : 0
    }
    case 'chime': {
      const ph = k % s.period
      return ph < 1.3 ? s.level * (Math.sin((ph / 1.3) * Math.PI * 3) > 0 ? 1 : 0.3) : 0
    }
    case 'once':
      return s.level * (1 - k / (s.dur || 1)) ** 0.5
    default:
      return s.level
  }
}
// The moment each repeated sound "begins again" (a ring, a chime): one sensory event each.
function pulseIndex(s, t) {
  const k = t - s.start
  if (s.pattern === 'ring') return Math.floor(k / 4)
  if (s.pattern === 'chime') return Math.floor(k / s.period)
  return 0
}

function outsideFactor(env, roomId) {
  let f = 0.12
  for (const w of WINDOWS) {
    if (w.room !== roomId) continue
    f = Math.max(f, env.windows[w.id] ? 0.9 : 0.3)
  }
  return f
}

// ---------- events ----------

function regionsFrom(levels) {
  return Object.entries(levels)
    .filter(([, v]) => v > 0.02)
    .map(([room, level]) => ({ room, region: ROOM[room].region, level }))
    .sort((a, b) => b.level - a.level)
}

export function emit(env, e) {
  const pos = e.pos ?? restCentre(e.room)
  const dx = pos.x - CENTRE.x
  const dy = pos.y - CENTRE.y
  const d = Math.hypot(dx, dy)
  const related = env.eventLog.filter((x) => x.type === e.type && env.t - x.t < 20).map((x) => x.id)
  const ev = {
    id: `e${env.nextId++}`,
    t: env.t,
    duration: 0.5,
    cause: 'user',
    regions: [],
    ...e,
    pos,
    direction: d > 0.01 ? { x: dx / d, y: dy / d, dist: d } : null,
    related,
  }
  env.events.push(ev)
  env.eventLog.push(ev)
  if (env.eventLog.length > 60) env.eventLog.shift()
  return ev
}

function soundEvent(env, s, intensity) {
  const levels = {}
  if (s.outside) for (const id of ROOM_IDS) levels[id] = intensity * outsideFactor(env, id)
  else for (const id of ROOM_IDS) levels[id] = intensity * env.soundT[s.room][id]
  emit(env, {
    type: 'sound',
    subtype: s.kind,
    room: s.room,
    pos: s.outside ? { x: -4, y: -4 } : sourcePoint(s.room, s.u, s.v),
    intensity,
    duration: s.dur ?? 2,
    cause: s.cause,
    source: s.id,
    hidden: !!s.hidden,
    outside: !!s.outside,
    regions: regionsFrom(levels),
  })
}

export function vibrate(env, roomId, amount, { subtype = 'impulse', cause = 'user', u = 0.5, v = 0.5, outside = false } = {}) {
  env.impulses.push({ room: roomId, amount, outside })
  if (env.dirty) rebuild(env)
  const levels = {}
  for (const id of ROOM_IDS) levels[id] = outside ? amount * 0.7 : amount * env.vibT[roomId][id]
  emit(env, {
    type: 'vibration',
    subtype,
    room: roomId,
    pos: sourcePoint(roomId, u, v),
    intensity: amount,
    duration: 0.6,
    cause,
    regions: regionsFrom(levels),
  })
}

// ---------- the step ----------

export function step(env, dt, { quiet = false } = {}) {
  env.t += dt
  if (env.dirty) rebuild(env)
  const W = env.outside.wind
  const Tout = env.outside.temp
  const R = env.rooms

  // --- temperature ---
  // Every room keeps a little residual warmth (the mass of the old house, the hearth below).
  const dT = Object.fromEntries(ROOM_IDS.map((id) => [id, 0.56]))
  for (const o of OBJECTS) {
    const st = env.objects[o.id]
    if (o.kind === 'radiator') dT[o.room] += 0.28 * st.level
    if (o.kind === 'stove' && st.on) dT[o.room] += 0.55
  }
  for (const id of ROOM_IDS) {
    const room = ROOM[id]
    const corner = room.col !== 1 && room.row !== 1
    const U = id === 'court' ? 0.03 : corner ? 0.042 : 0.035
    dT[id] -= U * (R[id].temp - Tout)
    for (const w of WINDOWS) {
      if (w.room === id && env.windows[w.id]) dT[id] -= (w.kind === 'frontdoor' ? 0.14 : w.kind === 'lantern' ? 0.06 : 0.1) * (R[id].temp - Tout)
    }
  }
  for (const [a, b] of ADJACENT) {
    const q = heatG(env, a, b) * (R[a].temp - R[b].temp)
    dT[a] -= q
    dT[b] += q
  }
  for (const fl of env.flows) {
    const k = 0.15 * fl.f
    if (fl.from === 'IN') dT[fl.to] += k * (Tout - R[fl.to].temp)
    else if (fl.to !== 'OUT') dT[fl.to] += k * (R[fl.from].temp - R[fl.to].temp)
  }
  for (const id of ROOM_IDS) {
    R[id].temp += (dT[id] / ROOM[id].mass) * dt
    // The air moving through a room is colder than the room when it comes from outside.
    const inflow = env.flows.filter((f) => f.to === id && f.from === 'IN').reduce((s, f) => s + f.f, 0)
    R[id].air.temp = R[id].temp - clamp(inflow * 2, 0, 1) * (R[id].temp - Tout) * 0.6
  }

  // --- scent ---
  const add = (room, type, v) => (R[room].scent[type] += v * dt)
  const inc = env.objects.incense
  inc.sticks = inc.sticks.filter((s) => env.t - s < INCENSE_BURN_S)
  if (inc.sticks.length) add('prayer', 'incense', 0.022 * inc.sticks.length)
  const stove = env.objects.stove
  if (stove.on) {
    add('kitchen', 'food', 0.035)
    if (env.t - stove.since > 75) add('kitchen', 'smoke', 0.05) // left too long: it burns
  }
  if (env.objects.flowers.on) add('court', 'flowers', 0.014)
  const fridge = env.objects.fridge
  if (!fridge.on && env.t - fridge.since > 40) add('kitchen', 'spoiled', 0.02)
  for (const type of SCENTS) {
    const c = Object.fromEntries(ROOM_IDS.map((id) => [id, R[id].scent[type]]))
    const d = Object.fromEntries(ROOM_IDS.map((id) => [id, 0]))
    for (const fl of env.flows) {
      if (fl.from === 'IN') continue
      const m = 0.5 * fl.f * c[fl.from]
      d[fl.from] -= m
      if (fl.to !== 'OUT') d[fl.to] += m
    }
    for (const [a, b] of ADJACENT) {
      const k = 0.03 * airG(env, a, b) * (c[a] - c[b])
      d[a] -= k
      d[b] += k
    }
    for (const id of ROOM_IDS) {
      let loss = 0.008
      for (const w of WINDOWS) if (w.room === id && env.windows[w.id]) loss += 0.05
      R[id].scent[type] = Math.max(0, c[id] + (d[id] - loss * c[id]) * dt)
    }
  }

  // --- machines ---
  for (const id of ['washer', 'pump', 'fridge']) {
    const st = env.objects[id]
    const o = OBJECTS.find((x) => x.id === id)
    if (!st.on) continue
    env.impulses.push({ room: o.room, amount: (st.disruptive ? 0.08 : 0.035) * dt })
    if (st.disruptive && env.t >= st.nextThump) {
      const amount = 0.45 + ((env.t * 7.31) % 1) * 0.35
      st.nextThump = env.t + 1.3 + ((env.t * 3.17) % 1) * 1.1
      if (!quiet) vibrate(env, o.room, amount, { subtype: 'machine', cause: 'house', u: o.u, v: o.v })
    }
  }

  // --- storm: open windows bang in the wind ---
  if (env.outside.storm && !quiet) {
    for (const w of WINDOWS) {
      if (!env.windows[w.id] || w.kind === 'lantern' || w.kind === 'frontdoor') continue
      const rate = w.id === 'w-study-e' ? 0.22 : 0.1
      if (((env.t * 97.13 + w.id.length * 13.7) % 1) < rate * dt) bang(env, w.id, 'house')
    }
  }

  // --- vibration ---
  for (const imp of env.impulses) {
    if (imp.outside) for (const id of ROOM_IDS) R[id].vib += imp.amount * 0.7
    else R[imp.room].vib += imp.amount
  }
  env.impulses = []
  const dv = Object.fromEntries(ROOM_IDS.map((id) => [id, 0]))
  for (const [a, b] of ADJACENT) {
    const k = 2.2 * vibG(env, a, b) * (R[a].vib - R[b].vib)
    dv[a] -= k
    dv[b] += k
  }
  for (const id of ROOM_IDS) {
    const damp = FLOORS[R[id].floor].damp
    R[id].vib = Math.max(0, R[id].vib + (dv[id] - (1.8 + (1 - damp) * 3) * R[id].vib) * dt)
  }

  // --- sound ---
  const level = Object.fromEntries(ROOM_IDS.map((id) => [id, 0]))
  for (const s of env.sounds) {
    const L = soundLevel(s, env.t)
    if (!quiet) {
      const idx = pulseIndex(s, env.t)
      if ((s.pattern === 'ring' || s.pattern === 'chime') && L > 0 && idx !== s.lastPulse) {
        s.lastPulse = idx
        soundEvent(env, s, s.level)
      }
      if (s.lastPulse === -1 && s.pattern !== 'ring' && s.pattern !== 'chime') {
        s.lastPulse = 0
        soundEvent(env, s, s.level)
      }
    }
    for (const id of ROOM_IDS) {
      const f = s.outside ? outsideFactor(env, id) : env.soundT[s.room][id]
      level[id] += (L * f) ** 2
    }
  }
  env.sounds = env.sounds.filter((s) => env.t <= s.until)
  for (const id of ROOM_IDS) R[id].sound = clamp(Math.sqrt(level[id]))

  if (!quiet) senseThresholds(env)
}

// Continuous conditions become discrete events when they cross a threshold.
function senseThresholds(env) {
  const userCaused = env.t - env.lastThermalAction < 60
  for (const id of ROOM_IDS) {
    const r = env.rooms[id]
    r.felt = r.temp + FLOORS[r.floor].contact * 0.5
    const band = r.felt < COMFORT.lo - (r.band === 'cold' ? -0.4 : 0.4) ? 'cold' : r.felt > COMFORT.hi + (r.band === 'hot' ? -0.4 : 0.4) ? 'hot' : 'ok'
    const jump = Math.abs(r.felt - r.lastEventFelt)
    if (band !== r.band || jump > 2.5) {
      emit(env, {
        type: 'thermal',
        subtype: band === 'ok' ? (r.felt > r.lastEventFelt ? 'warming' : 'cooling') : band,
        room: id,
        intensity: clamp(Math.abs(r.felt - 21) / 8),
        duration: 4,
        cause: env.lastThermalByRoom[id] && env.t - env.lastThermalByRoom[id] < 60 ? 'user' : userCaused ? 'user' : 'house',
        felt: r.felt,
        regions: [{ room: id, region: ROOM[id].region, level: clamp(Math.abs(r.felt - 21) / 8) }],
      })
      r.band = band
      r.lastEventFelt = r.felt
    }
    const drafty = r.air.mag > (r.drafty ? DRAFT - 0.03 : DRAFT)
    if (drafty && !r.drafty) {
      emit(env, {
        type: 'airflow',
        subtype: r.air.temp < 16 ? 'cold draft' : 'draft',
        room: id,
        intensity: clamp(r.air.mag * 2),
        duration: 3,
        cause: userCaused ? 'user' : 'house',
        flow: { x: r.air.vx, y: r.air.vy },
        regions: [{ room: id, region: ROOM[id].region, level: clamp(r.air.mag * 2) }],
      })
    }
    r.drafty = drafty
    for (const type of SCENTS) {
      const c = r.scent[type]
      const on = c > (r.scentOn[type] ? 0.12 : 0.18)
      if (on && !r.scentOn[type]) {
        emit(env, {
          type: 'scent',
          subtype: type,
          room: id,
          intensity: clamp(c),
          duration: 6,
          cause: 'user',
          regions: [{ room: id, region: ROOM[id].region, level: clamp(c) }],
        })
      }
      r.scentOn[type] = on
    }
  }
}

// ---------- actions (what the visitor can do) ----------

function noteThermal(env, roomIds) {
  env.lastThermalAction = env.t
  for (const id of roomIds) env.lastThermalByRoom[id] = env.t
}

function creak(env, room, pos, level = 0.3) {
  addSound(env, { kind: 'creak', room, level, dur: 1.2, pattern: 'once', ...(pos && { u: pos.u, v: pos.v }) })
}

export function bang(env, windowId, cause = 'user') {
  const w = WINDOW[windowId]
  addSound(env, { kind: 'bang', room: w.room, level: 0.8, dur: 0.5, pattern: 'once', cause })
  vibrate(env, w.room, 0.5, { subtype: 'bang', cause })
}

export function act(env, a) {
  env.stats.userActions += 1
  switch (a.type) {
    case 'toggleDoor': {
      const o = OPENING[a.id]
      env.doors[a.id] = !env.doors[a.id]
      env.dirty = true
      noteThermal(env, [o.a, o.b])
      creak(env, o.a, null, 0.28)
      vibrate(env, o.a, env.doors[a.id] ? 0.1 : 0.22, { subtype: env.doors[a.id] ? 'door' : 'door closing' })
      return env.doors[a.id] ? 'opened' : 'closed'
    }
    case 'toggleWindow': {
      const w = WINDOW[a.id]
      env.windows[a.id] = !env.windows[a.id]
      env.dirty = true
      noteThermal(env, [w.room])
      if (w.kind === 'frontdoor') {
        creak(env, w.room, { u: w.t, v: 0.05 }, 0.4)
        vibrate(env, w.room, 0.3, { subtype: 'door' })
      } else {
        addSound(env, { kind: 'latch', room: w.room, level: 0.18, dur: 0.4, pattern: 'once' })
      }
      return env.windows[a.id] ? 'opened' : 'closed'
    }
    case 'setRadiator': {
      const o = OBJECTS.find((x) => x.id === a.id)
      env.objects[a.id].level = clamp(a.level, 0, 3)
      noteThermal(env, [o.room])
      addSound(env, { kind: 'pipes', room: o.room, level: 0.12, dur: 1.5, pattern: 'once', u: o.u, v: o.v })
      return env.objects[a.id].level
    }
    case 'toggle': {
      const o = OBJECTS.find((x) => x.id === a.id)
      const st = env.objects[a.id]
      st.on = !st.on
      st.since = env.t
      if (o.kind === 'stove' || o.kind === 'extractor') noteThermal(env, [o.room])
      if (o.kind === 'extractor') env.dirty = true
      if (o.kind === 'speaker') {
        if (st.on) st.sound = addSound(env, { kind: 'radio', room: o.room, level: 0.45, pattern: 'steady', u: o.u, v: o.v })
        else env.sounds = env.sounds.filter((s) => s !== st.sound)
      }
      if (o.kind === 'machine') {
        addSound(env, { kind: 'clunk', room: o.room, level: 0.35, dur: 0.6, pattern: 'once', u: o.u, v: o.v })
        vibrate(env, o.room, 0.35, { subtype: 'clunk', u: o.u, v: o.v })
        syncHums(env)
      }
      if (o.kind === 'extractor') syncHums(env)
      if (o.kind === 'stove') addSound(env, { kind: 'ignite', room: o.room, level: 0.15, dur: 0.6, pattern: 'once', u: o.u, v: o.v })
      return st.on
    }
    case 'phone': {
      const st = env.objects.phone
      if (st.sound && env.t < st.sound.until) {
        st.sound.until = env.t // answered
        addSound(env, { kind: 'receiver', room: 'hall', level: 0.12, dur: 0.4, pattern: 'once', u: 0.25, v: 0.3 })
        st.sound = null
        return 'answered'
      }
      st.sound = addSound(env, { kind: 'phone', room: 'hall', level: 0.75, dur: 15.9, pattern: 'ring', u: 0.25, v: 0.3 })
      return 'ringing'
    }
    case 'knock': {
      addSound(env, { kind: 'knock', room: 'hall', level: 0.85, dur: 1.1, pattern: 'once', u: 0.5, v: 0.02 })
      vibrate(env, 'hall', 0.35, { subtype: 'knock', u: 0.5, v: 0.02 })
      return 'knocked'
    }
    case 'shift': {
      const o = OBJECTS.find((x) => x.id === a.id)
      addSound(env, { kind: 'scrape', room: o.room, level: 0.55, dur: 1.4, pattern: 'once', u: o.u, v: o.v })
      vibrate(env, o.room, 0.75, { subtype: 'heavy', u: o.u, v: o.v })
      return 'shifted'
    }
    case 'incense': {
      const st = env.objects.incense
      st.sticks.push(env.t)
      addSound(env, { kind: 'match', room: 'prayer', level: 0.08, dur: 0.5, pattern: 'once', u: 0.35, v: 0.4 })
      return st.sticks.length
    }
    case 'flowers': {
      const st = env.objects.flowers
      st.on = !st.on
      return st.on
    }
    case 'floor': {
      const r = env.rooms[a.room]
      r.floor = a.floor
      env.dirty = true
      addSound(env, { kind: 'rustle', room: a.room, level: 0.15, dur: 0.8, pattern: 'once' })
      vibrate(env, a.room, 0.12, { subtype: 'floor' })
      emit(env, {
        type: 'texture',
        subtype: a.floor,
        room: a.room,
        intensity: 0.5,
        duration: 3,
        regions: [{ room: a.room, region: ROOM[a.room].region, level: 0.6 }],
      })
      return a.floor
    }
    case 'search': {
      addSound(env, { kind: 'rummage', room: a.room, level: 0.42, dur: 1.6, pattern: 'once' })
      vibrate(env, a.room, 0.3, { subtype: 'search' })
      return 'searched'
    }
    default:
      env.stats.userActions -= 1
      return null
  }
}

// Steady hums for running machines and the extractor fan.
export function syncHums(env) {
  env.sounds = env.sounds.filter((s) => s.kind !== 'hum')
  for (const id of ['washer', 'pump', 'fridge', 'extractor']) {
    const st = env.objects[id]
    if (!st.on) continue
    const o = OBJECTS.find((x) => x.id === id)
    addSound(env, { kind: 'hum', machine: id, room: o.room, level: id === 'extractor' ? 0.16 : st.disruptive ? 0.2 : 0.06, pattern: 'steady', u: o.u, v: o.v, cause: 'house', lastPulse: 0 })
  }
}

export function thunder(env) {
  addSound(env, { kind: 'thunder', room: 'court', outside: true, level: 0.55, dur: 3, pattern: 'once', cause: 'house' })
  vibrate(env, 'court', 0.22, { subtype: 'thunder', cause: 'house', outside: true })
}

export { SCENTS }
