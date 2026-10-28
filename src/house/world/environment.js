// WIND AND SUN — the world outside, which neither he nor the house controls.
//
// As in the reference diagrams: the wind comes from one side and bends around the building; it
// filters in at openings that face it. The sun follows one trajectory; it falls through openings
// that face it and is stopped by walls. Both are fixed for a level. What changes is the house:
// when its partitions glide with his body they stand in front of windows or move away, open or
// close passages, carry their own windows; so the same wind and light are distributed anew.
//
//   windEntry = windStrength × opening × facing × exposure
//     facing    how squarely the opening faces into the wind
//     exposure  shading by the house itself upwind, and by partitions standing just inside
// Inside, the air flows from windward openings to leeward ones through a fine grid (two nodes per
// cell); walls block it, windows in walls let some through. Sunlit floor is slippery.

import { COLS, ROWS, segmentsCross, wallEnds } from './house.js'
import { distToSegment } from '../body/body.js'

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const rad = (d) => (d * Math.PI) / 180
export const LIGHT_RES = 4
export const AIR_RES = 2

export class Environment {
  constructor({ wind, sun }) {
    this.wind = { ...wind }
    this.sun = { ...sun }
    this.sunOn = true
    this.windows = []
    this.air = new Float32Array(COLS * AIR_RES * ROWS * AIR_RES * 2)
    this.light = new Float32Array(COLS * LIGHT_RES * ROWS * LIGHT_RES)
    this.version = 0
    this.maxAir = 0
  }

  get windDir() {
    return { x: Math.cos(rad(this.wind.angle)), y: Math.sin(rad(this.wind.angle)) }
  }

  get sunDir() {
    return { x: Math.cos(rad(this.sun.angle)), y: Math.sin(rad(this.sun.angle)) }
  }

  // walls: an optional override (wall → pose) for predicting a posture before he takes it.
  // plan: a target plan to predict for ({ X, Y, configId }); default: the house as it is now.
  recompute(house, plan = null) {
    this.version++
    const segs = this.solid(house, plan)
    this.windows = this.openings(house, segs, plan)
    this.solveAir(house, segs)
    this.computeLight(house, segs)
  }

  // Everything that stands in the way of air and light. Glass panes (windows) let air through in
  // part and light through entirely; walls and shut doors stop both.
  solid(house, plan) {
    const out = []
    if (plan) {
      for (const p of house.geometryFor(plan).pieces) out.push({ a: p.a, b: p.b, thick: p.thick, glass: p.kind === 'glass', wall: null, wins: [] })
    } else {
      for (const w of house.walls) {
        if (w.kind === 'rule' && house.ruleBroken) continue
        out.push({ ...wallEnds(w), thick: w.thick, glass: w.kind === 'glass', wall: w, wins: [] })
      }
    }
    for (const d of house.doors) if (!d.open) out.push({ a: d.a, b: d.b, thick: 0.3, glass: false, wall: null, wins: [] })
    return out
  }

  // Does the straight line p→q cross a wall? 0 (blocked), 0.45 (through an open window) or 1.
  passage(segs, p, q, skip = null) {
    let g = 1
    for (const s of segs) {
      if (skip && s === skip) continue
      if (!segmentsCross(p, q, s.a, s.b)) continue
      if (s.glass) {
        g = Math.min(g, 0.45)
        continue
      }
      return 0
    }
    return g
  }

  // The windows and open exits in the exterior, with how much wind each lets in or out.
  openings(house, segs, plan) {
    const W = this.windDir
    const pieces = plan ? house.geometryFor(plan).pieces : null
    const list = house.windows(pieces).map((w) => ({ ...w, seg: segs.find((s) => s.glass && Math.hypot((s.a.x + s.b.x) / 2 - w.x, (s.a.y + s.b.y) / 2 - w.y) < 0.05) }))
    const exits = plan ? house.geometryFor(plan).exits.map((e) => ({ ...e, open: house.doors.find((d) => d.id === e.id)?.open ?? true })) : house.doors
    for (const d of exits) if (d.open) list.push({ door: d, x: d.mid.x, y: d.mid.y, width: 0.8, kind: 'door', a: d.a, b: d.b, outside: d.out })
    return list.map((o) => {
      const n = o.outside
      const facing = clamp(-(n.x * W.x + n.y * W.y))
      // the house itself, standing upwind, shades it
      let exposure = 1
      for (let k = 0.6; k <= 4; k += 0.5) if (house.inside(o.x + n.x * 0.3 - W.x * k, o.y + n.y * 0.3 - W.y * k)) exposure *= 0.6
      // a partition standing just inside blocks it
      const inner = { x: o.x - n.x * 0.7, y: o.y - n.y * 0.7 }
      const p0 = { x: o.x - n.x * 0.05, y: o.y - n.y * 0.05 }
      if (this.passage(segs, p0, inner, o.seg) === 0) exposure *= 0.3
      const opening = o.width
      const entry = this.wind.strength * opening * facing * exposure
      const outflow = facing < 0.3 ? opening * (0.25 + clamp(n.x * W.x + n.y * W.y)) : 0
      return { ...o, facing, exposure, entry, inflow: entry, outflow, inner }
    })
  }

  node(i, j) {
    return j * COLS * AIR_RES + i
  }

  solveAir(house, segs) {
    const NW = COLS * AIR_RES
    const NH = ROWS * AIR_RES
    const N = NW * NH
    const inside = new Uint8Array(N)
    const pt = (i, j) => ({ x: (i + 0.5) / AIR_RES, y: (j + 0.5) / AIR_RES })
    for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) inside[this.node(i, j)] = house.inside(pt(i, j).x, pt(i, j).y) ? 1 : 0
    // conductances to the right and down neighbours
    const gR = new Float32Array(N)
    const gD = new Float32Array(N)
    for (let j = 0; j < NH; j++) {
      for (let i = 0; i < NW; i++) {
        const k = this.node(i, j)
        if (!inside[k]) continue
        if (i + 1 < NW && inside[k + 1]) gR[k] = this.passage(segs, pt(i, j), pt(i + 1, j))
        if (j + 1 < NH && inside[k + NW]) gD[k] = this.passage(segs, pt(i, j), pt(i, j + 1))
      }
    }
    const src = new Float32Array(N)
    const sink = new Float32Array(N)
    const nodeAt = (x, y) => {
      const i = Math.floor(x * AIR_RES)
      const j = Math.floor(y * AIR_RES)
      return i >= 0 && j >= 0 && i < NW && j < NH ? this.node(i, j) : -1
    }
    for (const w of this.windows) {
      if (w.between) continue
      const k = nodeAt(w.inner.x * 0.4 + w.x * 0.6, w.inner.y * 0.4 + w.y * 0.6)
      if (k < 0 || !inside[k]) continue
      src[k] += w.inflow
      sink[k] += w.outflow * 0.8
    }
    const total = src.reduce((a, b) => a + b, 0)
    const phi = new Float32Array(N)
    if (total > 1e-4) {
      for (let it = 0; it < (this.iterations ?? 220); it++) {
        for (let j = 0; j < NH; j++) {
          for (let i = 0; i < NW; i++) {
            const k = this.node(i, j)
            if (!inside[k]) continue
            let num = src[k]
            let den = sink[k] + 1e-3
            if (i + 1 < NW) { num += gR[k] * phi[k + 1]; den += gR[k] }
            if (i > 0) { num += gR[k - 1] * phi[k - 1]; den += gR[k - 1] }
            if (j + 1 < NH) { num += gD[k] * phi[k + NW]; den += gD[k] }
            if (j > 0) { num += gD[k - NW] * phi[k - NW]; den += gD[k - NW] }
            phi[k] = num / den
          }
        }
      }
    }
    // node velocities from the fluxes across its four sides (scaled so a cell's worth of flux ≈ entry)
    const air = this.air
    air.fill(0)
    let max = 0
    for (let j = 0; j < NH; j++) {
      for (let i = 0; i < NW; i++) {
        const k = this.node(i, j)
        if (!inside[k]) continue
        const fR = i + 1 < NW ? gR[k] * (phi[k] - phi[k + 1]) : 0
        const fL = i > 0 ? gR[k - 1] * (phi[k - 1] - phi[k]) : 0
        const fD = j + 1 < NH ? gD[k] * (phi[k] - phi[k + NW]) : 0
        const fU = j > 0 ? gD[k - NW] * (phi[k - NW] - phi[k]) : 0
        // in cells per second: two nodes per cell carry the flux of one cell
        const vx = ((fR + fL) / 2) * AIR_RES
        const vy = ((fD + fU) / 2) * AIR_RES
        air[k * 2] = vx
        air[k * 2 + 1] = vy
        max = Math.max(max, Math.hypot(vx, vy))
      }
    }
    // the jet straight through each windward opening
    for (const w of this.windows) {
      if (!w.inflow || w.inflow < 0.02) continue
      // a jet that carries well into the room, weakening with distance
      for (const s of [0.25, 0.75, 1.25, 1.75, 2.25]) {
        const k = nodeAt(w.x - w.outside.x * s, w.y - w.outside.y * s)
        if (k < 0 || !inside[k]) continue
        const fall = 1 - s / 2.8
        air[k * 2] += -w.outside.x * w.inflow * 0.7 * fall
        air[k * 2 + 1] += -w.outside.y * w.inflow * 0.7 * fall
      }
    }
    this.maxAir = max
  }

  // Air velocity at a point (bilinear between nodes).
  airAt(x, y) {
    const NW = COLS * AIR_RES
    const NH = ROWS * AIR_RES
    const fx = x * AIR_RES - 0.5
    const fy = y * AIR_RES - 0.5
    const i0 = Math.floor(fx)
    const j0 = Math.floor(fy)
    const tx = fx - i0
    const ty = fy - j0
    let vx = 0
    let vy = 0
    for (const [di, dj, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
      const i = i0 + di
      const j = j0 + dj
      if (i < 0 || j < 0 || i >= NW || j >= NH) continue
      const k = this.node(i, j)
      vx += this.air[k * 2] * w
      vy += this.air[k * 2 + 1] * w
    }
    return { x: vx, y: vy }
  }

  // ---------- sunlight ----------

  computeLight(house, segs) {
    const L = this.light
    L.fill(0)
    this.beams = []
    if (!this.sunOn) return
    const S = this.sunDir
    const I = this.sun.intensity
    const W = COLS * LIGHT_RES
    const H = ROWS * LIGHT_RES
    const mark = (x, y, v) => {
      const i = Math.floor(x * LIGHT_RES)
      const j = Math.floor(y * LIGHT_RES)
      if (i < 0 || j < 0 || i >= W || j >= H) return
      const k = j * W + i
      if (L[k] < v) L[k] = v
    }
    // open ground and the courtyard: the open sky
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / LIGHT_RES
        const y = (j + 0.5) / LIGHT_RES
        if (!house.inside(x, y)) mark(x, y, 0.5 * I)
        else if (house.courtyardAt(x, y)) mark(x, y, 0.75 * I)
      }
    }
    // beams through openings that face the sun, stopped by walls
    const reach = Math.min(6, 1.8 / Math.tan(rad(this.sun.elevation)))
    for (const w of this.windows) {
      if (!w.outside) continue
      const toward = -(w.outside.x * S.x + w.outside.y * S.y)
      if (toward < 0.12) continue
      let shade = 1
      for (let k = 0.6; k <= 3; k += 0.6) if (house.inside(w.x + w.outside.x * 0.3 - S.x * k, w.y + w.outside.y * 0.3 - S.y * k)) shade *= 0.5
      const strength = I * toward * (0.35 + 0.65 * shade)
      const along = { x: w.b.x - w.a.x, y: w.b.y - w.a.y }
      const al = Math.hypot(along.x, along.y) || 1
      const rays = 6
      for (let r = 0; r < rays; r++) {
        const off = ((r + 0.5) / rays - 0.5) * w.width
        let p = { x: w.x + (along.x / al) * off - w.outside.x * 0.1, y: w.y + (along.y / al) * off - w.outside.y * 0.1 }
        for (let t = 0; t < reach; t += 0.12) {
          const q = { x: p.x + S.x * 0.12, y: p.y + S.y * 0.12 }
          let blocked = false
          for (const s of segs) {
            if (s.glass) continue
            if (segmentsCross(p, q, s.a, s.b) || distToSegment(q, s.a, s.b) < s.thick / 2) {
              blocked = true
              break
            }
          }
          if (blocked || !house.inside(q.x, q.y)) break
          mark(q.x, q.y, strength * (1 - (t / reach) * 0.55))
          p = q
        }
      }
      this.beams.push({ window: w, strength })
    }
  }

  lightAt(x, y) {
    const i = Math.floor(x * LIGHT_RES)
    const j = Math.floor(y * LIGHT_RES)
    if (i < 0 || j < 0 || i >= COLS * LIGHT_RES || j >= ROWS * LIGHT_RES) return 0
    return this.light[j * COLS * LIGHT_RES + i]
  }

  litCells(house) {
    let n = 0
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (house.inside(c + 0.5, r + 0.5) && !house.courtyardAt(c + 0.5, r + 0.5) && this.lightAt(c + 0.5, r + 0.5) > 0.2) n++
    return n
  }

  summary(house) {
    return {
      windIn: this.windows.filter((w) => w.inflow > 0.02).length,
      windTotal: this.windows.reduce((a, w) => a + (w.inflow ?? 0), 0),
      maxAir: this.maxAir,
      litCells: house ? this.litCells(house) : 0,
    }
  }
}
