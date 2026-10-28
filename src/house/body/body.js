// THE SLEEPING VASTU PURUSHA beneath the plan — his body, his postures, his grid.
//
// The articulated skeleton of The Sleeping House, laid diagonally under the house (head to the
// north-east, feet to the south-west) and scaled to span it. He breathes, twitches and, when
// disturbed enough, moves to another sleeping posture over several seconds: proximal joints first,
// then limbs, then hands and feet. The house's interior walls are bound to his bones (house.js),
// so they glide with him.
//
// The body grid: every cell of the plan belongs (more or less) to one body region. A collision
// lights the region under it; the disturbance spreads to neighbouring cells and fades slowly.

import { BONES, POSTURES, angleDelta, solve } from '../../sleeping/entity/skeleton.js'

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180

// ---------- body regions ----------

export const REGIONS = ['head', 'neck', 'chest', 'stomach', 'leftArm', 'rightArm', 'leftHand', 'rightHand', 'pelvis', 'leftLeg', 'rightLeg', 'feet']
export const REGION_LABEL = {
  head: 'head', neck: 'neck', chest: 'chest', stomach: 'stomach', leftArm: 'left arm', rightArm: 'right arm',
  leftHand: 'left hand', rightHand: 'right hand', pelvis: 'pelvis', leftLeg: 'left leg', rightLeg: 'right leg', feet: 'feet',
}
export const BONE_REGION = {
  head: 'head', neck: 'neck', chest: 'chest', spine: 'stomach',
  clavL: 'leftArm', armL: 'leftArm', foreL: 'leftHand', handL: 'leftHand',
  clavR: 'rightArm', armR: 'rightArm', foreR: 'rightHand', handR: 'rightHand',
  hipL: 'pelvis', hipR: 'pelvis', thighL: 'leftLeg', shinL: 'leftLeg', thighR: 'rightLeg', shinR: 'rightLeg',
  footL: 'feet', footR: 'feet',
}
// How sensitive each region is: the head most, the feet are ticklish.
export const SENSITIVITY = { head: 1.6, neck: 1.3, chest: 1.1, stomach: 1, leftArm: 0.9, rightArm: 0.9, leftHand: 1.25, rightHand: 1.25, pelvis: 0.9, leftLeg: 0.8, rightLeg: 0.8, feet: 1.1 }
// Half-widths of the soft body around each bone, in body units.
const WIDTH = { spine: 30, chest: 34, neck: 11, head: 26, clavL: 12, armL: 13, foreL: 11, handL: 9, clavR: 12, armR: 13, foreR: 11, handR: 9, hipL: 16, thighL: 18, shinL: 13, footL: 9, hipR: 16, thighR: 18, shinR: 13, footR: 9 }

// ---------- postures ----------

export function worldFromLocal(local) {
  const w = { root: local.root }
  for (const b of BONES) w[b.id] = (b.parent ? w[b.parent] : local.root) + local[b.id]
  return w
}

export function localFromWorld(w, base) {
  const local = { ...base, root: w.root }
  for (const b of BONES) local[b.id] = norm(w[b.id] - (b.parent ? w[b.parent] : w.root))
  return local
}

function variant(from, world, lens = {}) {
  const p = POSTURES[from]
  return { angles: localFromWorld({ ...worldFromLocal(p.angles), ...world }, p.angles), lens: { ...p.lens, ...lens } }
}
const borrow = (id) => ({ angles: { ...POSTURES[id].angles }, lens: { ...POSTURES[id].lens } })

// Mirror a posture across his own spine: he lies on his other side.
function mirrorPose(p) {
  const w = worldFromLocal(p.angles)
  const m = {}
  for (const [k, v] of Object.entries(w)) m[k] = norm(180 - v)
  // left and right swap
  const swap = {}
  for (const b of BONES) {
    const other = b.id.endsWith('L') ? b.id.slice(0, -1) + 'R' : b.id.endsWith('R') ? b.id.slice(0, -1) + 'L' : b.id
    swap[b.id] = m[other] ?? m[b.id]
  }
  swap.root = m.root
  const lens = {}
  for (const [k, v] of Object.entries(p.lens)) {
    const other = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k
    lens[other] = v
  }
  return { angles: { ...localFromWorld(swap, p.angles), curlL: p.angles.curlR, curlR: p.angles.curlL }, lens }
}

// The sleeping postures. Each changes his footprint, and so the house above him.
const BASE = {
  // A · compact: bent arms and legs, short rooms
  curled: { ...borrow('curled'), label: 'curled', major: true },
  // B · long: limbs extended, rooms pulled long
  stretched: { ...borrow('stretched'), label: 'stretched', major: true },
  // C · on his side
  side: { ...borrow('turned'), label: 'rolled to the side', major: true },
  // D · one arm swept over his head
  armOverHead: { ...variant('mandala', { clavR: -30, armR: -120, foreR: -175, handR: -185 }), label: 'arm over head' },
  // E · knees drawn up toward the chest
  kneesUp: { ...variant('mandala', { thighL: -150, shinL: 120, footL: 140, thighR: -30, shinR: 60, footR: 40 }), label: 'knees drawn up' },
  // F · restless, flung open
  restless: { ...borrow('sprawled'), label: 'restless', major: true },
  // the shape the house was first built on
  mandala: { ...borrow('mandala'), label: 'mandala' },
  // a single limb moves: a hand pulled in, a leg pushed out
  handIn: { ...variant('mandala', { foreL: 60, handL: 20, foreR: 120, handR: 160 }), label: 'hands drawn in' },
  legOut: { ...variant('mandala', { thighR: 70, shinR: 75, footR: 70 }), label: 'one leg stretched' },
  armsWide: { ...variant('mandala', { armL: 185, foreL: 175, handL: 172, armR: -5, foreR: 5, handR: 8 }), label: 'arms flung wide' },
}

export const POSES = {}
for (const [id, p] of Object.entries(BASE)) {
  POSES[id] = { id, mirror: false, ...p }
  const m = mirrorPose(p)
  POSES[`${id}~`] = { id: `${id}~`, base: id, mirror: true, label: `${p.label}, other side`, major: p.major, ...m }
}

// Which postures relieve a disturbed region (he pulls away, or protects it).
export const RELIEF = {
  head: ['side', 'side~', 'armOverHead', 'armOverHead~'],
  neck: ['side', 'side~', 'curled'],
  chest: ['curled', 'curled~', 'kneesUp'],
  stomach: ['curled', 'curled~', 'kneesUp', 'kneesUp~'],
  leftArm: ['armOverHead~', 'handIn', 'curled'],
  rightArm: ['armOverHead', 'handIn', 'curled~'],
  leftHand: ['handIn', 'handIn~', 'curled'],
  rightHand: ['handIn', 'handIn~', 'curled~'],
  pelvis: ['side', 'side~', 'restless'],
  leftLeg: ['kneesUp', 'legOut~', 'curled'],
  rightLeg: ['kneesUp~', 'legOut', 'curled~'],
  feet: ['kneesUp', 'kneesUp~', 'curled'],
}

// ---------- placement ----------

// Body frame → plan: centre, rotation, scale (cells per body unit). The pivot is his navel.
const PIVOT = { x: 0, y: -40 }
export function placePoint(p, place) {
  const dx = (p.x - PIVOT.x) * place.scale
  const dy = (p.y - PIVOT.y) * place.scale
  const r = (place.rot * Math.PI) / 180
  return { x: place.x + dx * Math.cos(r) - dy * Math.sin(r), y: place.y + dx * Math.sin(r) + dy * Math.cos(r) }
}

// The bones as plan-space frames: origin, end, angle (radians), half-width.
export function boneFrames(frame, place) {
  const out = {}
  const rot = (place.rot * Math.PI) / 180
  for (const b of BONES) {
    const f = frame[b.id]
    const a = placePoint({ x: f.x0, y: f.y0 }, place)
    const e = placePoint({ x: f.x1, y: f.y1 }, place)
    out[b.id] = { a, b: e, ang: (f.a * Math.PI) / 180 + rot, hw: WIDTH[b.id] * place.scale, region: BONE_REGION[b.id] }
  }
  return out
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L) : 0
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

// ---------- the living body ----------

const ORDER = { root: 0, spine: 0, chest: 0.06, hipL: 0.05, hipR: 0.05, neck: 0.1, head: 0.14, clavL: 0.1, clavR: 0.1, armL: 0.16, armR: 0.16, thighL: 0.12, thighR: 0.12, foreL: 0.24, foreR: 0.24, shinL: 0.2, shinR: 0.2, handL: 0.3, handR: 0.3, footL: 0.28, footR: 0.28 }
const ANGLE_IDS = ['root', ...BONES.map((b) => b.id)]

export class Body {
  constructor({ pose = 'curled', place, cols, rows }) {
    this.cols = cols
    this.rows = rows
    this.place = { ...place }
    this.t = 0
    this.pose = pose
    const p = POSES[pose]
    this.angles = { ...p.angles }
    this.lens = { ...p.lens }
    this.tween = null
    this.breath = { phase: 0, rate: 0.12, depth: 1 }
    this.springs = {}
    this.twitchTimer = 3
    this.restless = 0
    // the body grid: per cell, the region under it, how much body is there, its disturbance
    const n = cols * rows
    this.region = new Array(n).fill(null)
    this.weight = new Float32Array(n)
    this.disturb = new Float32Array(n)
    this.glow = {} // region → 0..1 (fades slowly)
    for (const r of REGIONS) this.glow[r] = 0
    this.compute()
  }

  get moving() {
    return !!this.tween
  }

  // Frames of a posture at rest (no breathing), for binding walls and predicting a change.
  static framesOf(poseName, place) {
    const p = POSES[poseName]
    return boneFrames(solve(p.angles, p.lens), place)
  }

  // His present posture with some bones bent further (a twitch), as frames, at rest.
  twitchFrames(region, deg) {
    const a = { ...this.angles }
    for (const [id, reg] of Object.entries(BONE_REGION)) if (reg === region) a[id] += deg
    return boneFrames(solve(a, this.lens), this.place)
  }

  restFrames() {
    return boneFrames(solve(this.angles, this.lens), this.place)
  }

  // Move to another posture over `dur` seconds.
  to(poseName, dur = 4.5) {
    const p = POSES[poseName]
    this.tween = { fromA: { ...this.angles }, toA: { ...p.angles }, fromL: { ...this.lens }, toL: { ...p.lens }, start: this.t, dur }
    this.pose = poseName
  }

  // A visible flinch of one region (the walls over it are moved by the transformation system).
  flinch(region, deg) {
    for (const [id, reg] of Object.entries(BONE_REGION)) if (reg === region) this.twitch(id, deg * 0.9)
  }

  twitch(boneId, deg) {
    const s = (this.springs[boneId] ??= { x: 0, v: 0 })
    s.v += deg * 8
  }

  // A disturbance at a point in the plan: the region under it lights up, and it spreads.
  strike(x, y, amount) {
    const c = Math.floor(x)
    const r = Math.floor(y)
    let region = null
    if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) {
      const i = r * this.cols + c
      this.disturb[i] = Math.min(1.5, this.disturb[i] + amount)
      region = this.region[i]
      // a smaller share reaches the neighbouring cells of his body at once
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue
        const j = rr * this.cols + cc
        if (this.weight[j] > 0.1) this.disturb[j] = Math.min(1.5, this.disturb[j] + amount * 0.35)
      }
    }
    // outside his body: the nearest bone still feels it, more faintly
    let near = this.nearestBone({ x, y })
    if (!region) {
      region = near.region
      amount *= clamp(1.4 - near.d / 2)
    }
    this.glow[region] = Math.min(1.2, (this.glow[region] ?? 0) + amount * 1.8)
    // the bones of that region flinch
    for (const [id, reg] of Object.entries(BONE_REGION)) if (reg === region) this.twitch(id, (Math.random() - 0.5) * 18 * Math.min(1, amount * 4))
    return { region, near }
  }

  nearestBone(p) {
    let best = null
    for (const [id, f] of Object.entries(this.frames)) {
      const d = distToSegment(p, f.a, f.b) - f.hw
      if (!best || d < best.d) best = { id, d, region: f.region }
    }
    return best
  }

  update(dt) {
    this.t += dt
    const tw = this.tween
    if (tw) {
      const k0 = (this.t - tw.start) / tw.dur
      for (const id of ANGLE_IDS) {
        const k = ease(clamp((k0 - (ORDER[id] ?? 0)) / 0.7))
        this.angles[id] = tw.fromA[id] + angleDelta(tw.fromA[id], tw.toA[id]) * k
      }
      for (const id of ['curlL', 'curlR']) this.angles[id] = (tw.fromA[id] ?? 0.3) + ((tw.toA[id] ?? 0.3) - (tw.fromA[id] ?? 0.3)) * ease(clamp(k0))
      const k = ease(clamp(k0))
      const ids = new Set([...Object.keys(tw.fromL), ...Object.keys(tw.toL)])
      this.lens = {}
      for (const id of ids) this.lens[id] = (tw.fromL[id] ?? 1) + ((tw.toL[id] ?? 1) - (tw.fromL[id] ?? 1)) * k
      if (k0 >= 1) this.tween = null
    }
    for (const s of Object.values(this.springs)) {
      s.v += (-60 * s.x - 2 * Math.sqrt(60) * 0.6 * s.v) * dt
      s.x += s.v * dt
    }
    // occasional small twitches, more when restless
    this.twitchTimer -= dt * (1 + this.restless * 3)
    if (this.twitchTimer <= 0) {
      this.twitchTimer = 2.5 + Math.random() * 5
      const ids = ['handL', 'handR', 'footL', 'footR', 'foreL', 'shinR', 'head']
      this.twitch(ids[Math.floor(Math.random() * ids.length)], (Math.random() - 0.5) * (6 + this.restless * 14))
    }
    this.breath.phase += dt * Math.PI * 2 * this.breath.rate
    // the disturbance spreads through his body and fades
    this.spread(dt)
    for (const r of REGIONS) this.glow[r] = Math.max(0, this.glow[r] - dt * 0.35)
    this.compute()
  }

  spread(dt) {
    const { cols, rows } = this
    const d = this.disturb
    const next = new Float32Array(d.length)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        let sum = 0
        let n = 0
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc
          const rr = r + dr
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
          const j = rr * cols + cc
          // it travels through his body, hardly through bare ground
          const g = this.weight[j] > 0.1 ? 1 : 0.15
          sum += d[j] * g
          n += g
        }
        const avg = n ? sum / n : 0
        // it diffuses through his body and fades in proportion (so even a little travels)
        next[i] = Math.max(0, (d[i] + (avg - d[i]) * Math.min(1, dt * 2.5) * 0.5) * (1 - dt * 0.3) - dt * 0.004)
      }
    }
    this.disturb = next
  }

  breathValue() {
    return Math.sin(this.breath.phase) * this.breath.depth
  }

  compute() {
    const a = { ...this.angles }
    const lens = { ...this.lens }
    const br = this.breathValue()
    a.chest += br * 1.4
    a.clavL += br * 2
    a.clavR -= br * 2
    lens.chest = (lens.chest ?? 1) * (1 + br * 0.04)
    lens.spine = (lens.spine ?? 1) * (1 + br * 0.015)
    for (const [id, s] of Object.entries(this.springs)) a[id] += s.x
    this.frame = solve(a, lens)
    this.frames = boneFrames(this.frame, this.place)
    // the body grid
    const { cols, rows } = this
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = { x: c + 0.5, y: r + 0.5 }
        let best = null
        for (const f of Object.values(this.frames)) {
          const d = distToSegment(p, f.a, f.b) - f.hw
          if (!best || d < best.d) best = { d, region: f.region }
        }
        const i = r * cols + c
        const w = clamp(1 - best.d / 0.9)
        this.weight[i] = w
        this.region[i] = w > 0.05 ? best.region : null
      }
    }
  }

  // Per region: the strongest disturbance among its cells, plus its glow.
  regionDisturbance() {
    const out = {}
    for (const r of REGIONS) out[r] = this.glow[r]
    for (let i = 0; i < this.region.length; i++) {
      const r = this.region[i]
      if (r) out[r] = Math.max(out[r], this.disturb[i])
    }
    return out
  }
}
