// HOW THE BODY MOVES — a layered animation system for the articulated figure.
//
// Final joint angle = posture (blended, staggered transitions)
//                   + tonic tension per body region (held while a stimulus lasts: cold, heat)
//                   + reactions (damped springs: twitches, flinches, tremors, head turns)
//                   + breathing + a slow, never-repeating drift.
// The mind (mind.js) only sends commands; this module decides how they look.

import { BONES, POSTURES, REGION_ANCHOR, REGION_BONES, angleDelta, solve, toPlan, fromPlanDir } from './skeleton.js'
import { clamp } from '../sim/rng.js'

const ANGLE_IDS = ['root', ...BONES.map((b) => b.id)]
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
// Proximal parts move first, then the limbs, then the hands and feet.
const ORDER = { root: 0, spine: 0, chest: 0.08, hipL: 0.05, hipR: 0.05, neck: 0.14, head: 0.2, clavL: 0.12, clavR: 0.12, armL: 0.2, armR: 0.2, thighL: 0.14, thighR: 0.14, foreL: 0.3, foreR: 0.3, shinL: 0.24, shinR: 0.24, handL: 0.38, handR: 0.38, footL: 0.32, footR: 0.32 }
const MIRROR = { L: 1, R: -1 }

// How "drawing in" (positive tension) bends each region's bones, in degrees per unit.
// Left-side values; right-side bones mirror them.
const TENSION = {
  head: { neck: 10, head: 18, lens: { head: -0.18 } },
  armN: { clavL: 12, armL: -26 },
  handNW: { foreL: -38, handL: -20, curlL: 0.7 },
  armE: { clavR: -12, armR: 26 },
  handSE: { foreR: 38, handR: 20, curlR: 0.7 },
  navel: { spine: 7, chest: 9, lens: { spine: -0.1, chest: -0.08 } },
  legW: { thighL: 30, shinL: -34 },
  legS: { thighR: -30, shinR: 34 },
  feet: { footL: 34, footR: -34, shinL: -10, shinR: 10 },
}

function spring() {
  return { x: 0, v: 0, target: 0, until: 0 }
}

export class Animator {
  constructor(seed = 7) {
    this.t = 0
    this.from = { ...POSTURES.mandala.angles }
    this.to = { ...POSTURES.mandala.angles }
    this.base = { ...POSTURES.mandala.angles }
    this.posture = 'mandala'
    this.transStart = -99
    this.transDur = 1
    this.lensFrom = {}
    this.lensTo = {}
    this.offFrom = { x: 0, y: 0 }
    this.offTo = { x: 0, y: 0 }
    this.springs = Object.fromEntries([...ANGLE_IDS, 'curlL', 'curlR'].map((id) => [id, spring()]))
    this.tension = Object.fromEntries(Object.keys(REGION_BONES).map((r) => [r, { v: 0, target: 0 }]))
    this.tremors = [] // { region, amp, freq, until, start }
    this.head = { target: 0, value: 0, strength: 0 }
    this.breath = { phase: 0, rate: 0.2, depth: 1, irregular: 0, sigh: 0 }
    this.restless = 0
    this.highlight = {} // region → time of last reaction
    // Each joint drifts on its own incommensurate frequencies, so the figure never loops.
    let s = seed
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    this.noise = Object.fromEntries(ANGLE_IDS.map((id) => [id, [r() * 6.28, r() * 6.28, 0.07 + r() * 0.11, 0.17 + r() * 0.2]]))
    this.rest = solve(POSTURES.mandala.angles)
    this.frame = this.compute()
  }

  // ---------- commands ----------

  setPosture(name, duration = 3) {
    if (!POSTURES[name] || name === this.posture) return
    // Start from wherever the body is now, so an interrupted movement continues smoothly.
    this.from = { ...this.base }
    this.lensFrom = { ...this.currentLens() }
    this.offFrom = { ...this.currentOffset() }
    const p = POSTURES[name]
    this.to = { ...p.angles }
    this.lensTo = { ...p.lens }
    this.offTo = { x: p.rootX, y: p.rootY }
    this.posture = name
    this.transStart = this.t
    this.transDur = duration
  }

  get transitioning() {
    return this.t - this.transStart < this.transDur * 1.45
  }

  // Tension in a body region: +1 drawn in, -1 extended. Held until changed.
  setTension(region, amount) {
    this.tension[region].target = clamp(amount, -1, 1)
  }

  // A brief bend of a region's bones (a twitch, a contraction) that springs back.
  pulse(region, amount, hold = 0.4) {
    const def = TENSION[region]
    for (const [id, deg] of Object.entries(def)) {
      if (id === 'lens') continue
      const sp = this.springs[id]
      sp.target = deg * amount
      sp.until = this.t + hold
      sp.v += deg * amount * 6
    }
    this.highlight[region] = this.t
  }

  tremor(region, amp = 1, dur = 0.8, freq = 9) {
    this.tremors.push({ region, amp, freq, start: this.t, until: this.t + dur })
    this.highlight[region] = this.t
  }

  // A whole-body startle: spine and shoulders contract, fingers close.
  flinch(amount = 1) {
    for (const r of ['navel', 'armN', 'armE', 'handNW', 'handSE']) this.pulse(r, amount * 0.6, 0.25)
    this.springs.curlL.v += 6 * amount
    this.springs.curlR.v += 6 * amount
  }

  // Turn the head toward a direction in the plan (x east, y south), or release it (null).
  attend(planDir, strength = 1) {
    if (!planDir) {
      this.head.strength = 0
      return
    }
    const d = fromPlanDir(planDir)
    const want = (Math.atan2(d.y, d.x) * 180) / Math.PI
    const f = this.frame
    const chestA = f.chest.a
    let delta = angleDelta(chestA, want)
    // He cannot turn his head behind himself: a sound from the feet makes him lift and tilt.
    if (Math.abs(delta) > 110) delta = Math.sign(delta) * 62
    this.head.target = clamp(delta, -68, 68) * strength
    this.head.strength = strength
  }

  setBreath({ rate, depth, irregular }) {
    if (rate !== undefined) this.breath.rate = rate
    if (depth !== undefined) this.breath.depth = depth
    if (irregular !== undefined) this.breath.irregular = irregular
  }

  sigh() {
    this.breath.sigh = 1
  }

  // ---------- update ----------

  update(dt) {
    this.t += dt
    const t = this.t
    // posture blend, staggered per joint
    const k0 = (t - this.transStart) / this.transDur
    for (const id of ANGLE_IDS) {
      const delay = ORDER[id] ?? 0
      const k = easeInOut(clamp((k0 - delay) / 1))
      this.base[id] = this.from[id] + angleDelta(this.from[id], this.to[id]) * k
    }
    for (const side of ['L', 'R']) {
      const id = `curl${side}`
      const k = easeInOut(clamp(k0 - 0.4))
      this.base[id] = (this.from[id] ?? 0.3) + ((this.to[id] ?? 0.3) - (this.from[id] ?? 0.3)) * k
    }
    this.blendK = easeInOut(clamp(k0))

    // tension follows its target smoothly (slower to release than to tighten)
    for (const tn of Object.values(this.tension)) {
      const rate = Math.abs(tn.target) > Math.abs(tn.v) ? 2.2 : 0.7
      tn.v += (tn.target - tn.v) * clamp(rate * dt)
    }
    // springs
    for (const sp of Object.values(this.springs)) {
      const target = t < sp.until ? sp.target : 0
      const k = 70
      const c = 2 * Math.sqrt(k) * 0.55
      sp.v += (k * (target - sp.x) - c * sp.v) * dt
      sp.x += sp.v * dt
    }
    // head
    const h = this.head
    const htarget = h.strength > 0 ? h.target : 0
    h.value += (htarget - h.value) * clamp(dt * (h.strength > 0 ? 3.2 : 0.9))
    // breathing
    const b = this.breath
    const jitter = b.irregular * Math.sin(t * 0.9 + Math.sin(t * 0.37) * 3) * 0.5
    b.phase += dt * Math.PI * 2 * b.rate * (1 + jitter)
    b.sigh = Math.max(0, b.sigh - dt * 0.18)
    this.tremors = this.tremors.filter((tr) => t < tr.until)
    this.frame = this.compute()
  }

  currentLens() {
    const k = this.blendK ?? 1
    const lens = {}
    const ids = new Set([...Object.keys(this.lensFrom), ...Object.keys(this.lensTo)])
    for (const id of ids) lens[id] = (this.lensFrom[id] ?? 1) + ((this.lensTo[id] ?? 1) - (this.lensFrom[id] ?? 1)) * k
    return lens
  }

  currentOffset() {
    const k = this.blendK ?? 1
    return { x: this.offFrom.x + (this.offTo.x - this.offFrom.x) * k, y: this.offFrom.y + (this.offTo.y - this.offFrom.y) * k }
  }

  breathValue() {
    const b = this.breath
    return Math.sin(b.phase) * b.depth * (1 + b.sigh * 1.6)
  }

  compute() {
    const t = this.t
    const a = { ...this.base }
    const lens = this.currentLens()
    for (const [region, tn] of Object.entries(this.tension)) {
      if (Math.abs(tn.v) < 0.001) continue
      for (const [id, deg] of Object.entries(TENSION[region])) {
        if (id === 'lens') {
          for (const [lid, m] of Object.entries(deg)) lens[lid] = (lens[lid] ?? 1) * (1 + m * tn.v)
        } else if (id.startsWith('curl')) a[id] = clamp(a[id] + deg * tn.v, 0, 1)
        else a[id] += deg * tn.v
      }
    }
    for (const [id, sp] of Object.entries(this.springs)) {
      if (id.startsWith('curl')) a[id] = clamp(a[id] + sp.x / 40, 0, 1)
      else a[id] += sp.x
    }
    for (const tr of this.tremors) {
      const env = Math.sin(((t - tr.start) / (tr.until - tr.start)) * Math.PI)
      for (const id of REGION_BONES[tr.region]) {
        a[id] += Math.sin(t * tr.freq * 6.28 + id.length) * 2.4 * tr.amp * env
      }
    }
    // the head turn: shared between neck and head
    a.neck += this.head.value * 0.35
    a.head += this.head.value * 0.65
    // breathing: the chest opens, the shoulders rise, the spine lengthens a little
    const br = this.breathValue()
    a.chest += br * 0.8
    a.clavL += br * 1.6 * MIRROR.L
    a.clavR += br * 1.6 * MIRROR.R
    lens.spine = (lens.spine ?? 1) * (1 + br * 0.012)
    // slow drift, larger when restless
    const amp = 0.5 + this.restless * 2.6
    for (const id of ANGLE_IDS) {
      if (id === 'root') continue
      const [p1, p2, f1, f2] = this.noise[id]
      a[id] += (Math.sin(t * f1 * 6.28 + p1) + Math.sin(t * f2 * 6.28 + p2) * 0.6) * amp * 0.6
    }
    const frame = solve(a, lens, this.currentOffset())
    frame.breath = br
    frame.angles = a
    return frame
  }

  // ---------- for the architecture ----------
  // Per region: displacement (plan units, x east / y south) and contraction, relative to the
  // mandala rest pose.
  regionState() {
    const f = this.frame
    const rest = this.rest
    const out = {}
    const centre = (fr) => ({ x: (fr.spine.x0 + fr.chest.x1) / 2, y: (fr.spine.y0 + fr.chest.y1) / 2 })
    const c0 = centre(rest)
    const c1 = centre(f)
    for (const region of Object.keys(REGION_BONES)) {
      const id = REGION_ANCHOR[region]
      const p0 = { x: rest[id].x1, y: rest[id].y1 }
      const p1 = { x: f[id].x1, y: f[id].y1 }
      const d = toPlan({ x: p1.x - p0.x, y: p1.y - p0.y })
      const r0 = Math.hypot(p0.x - c0.x, p0.y - c0.y) || 1
      const r1 = Math.hypot(p1.x - c1.x, p1.y - c1.y)
      out[region] = {
        dx: d.x,
        dy: d.y,
        contraction: clamp((r0 - r1) / r0, -0.6, 0.8) + this.tension[region].v * 0.25,
        tension: this.tension[region].v,
        lit: Math.max(0, 1 - (this.t - (this.highlight[region] ?? -99)) / 2.5),
      }
    }
    out.navel.rotation = angleDelta(-90, f.spine.a)
    out.navel.breath = f.breath
    return out
  }
}
