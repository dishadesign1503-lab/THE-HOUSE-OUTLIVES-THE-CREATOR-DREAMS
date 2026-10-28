// THE HOUSE — built from the plan (plan.js): the same walls are drawn, collided with, used for
// reachability and for the air. Walls are derived, never placed one by one.
//
// How the house changes (only when his mind commands it, through begin()):
//   · its grid lines move (each inner line is bound to the parts of his body beneath it): every wall
//     on a line moves with it, the rooms on either side grow and shrink, doors and windows travel
//     with their walls, junctions stay joined
//   · for a large change it passes to another organisation of rooms: walls that are no longer
//     needed retract into their junctions, then the new ones grow out of theirs
// Both are interpolated with eased acceleration and deceleration; lines nearer the disturbance
// move first. A wall sweeping across the ball rises over it (drawn raised, not solid).

import { CONFIGS } from './layouts.js'
import { X_REST, Y_REST, NX, NY, SHELL_T, INTERIOR_T, GLASS_T, DOOR_W, WINDOW_W, buildConfig, wallUnits, unitGeom, constrainLines, validateConfig, exteriorUnits } from './plan.js'
import { distToSegment } from '../body/body.js'
import { planFromBody } from './bodyplan.js'

export const COLS = 9
export const ROWS = 13
export const RES = 4
export { SHELL_T, INTERIOR_T }
const PLAYER_R = 0.2
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k))
const MOBILITY = 0.8 // how much of his movement the grid lines follow

export function segmentsCross(p1, p2, q1, q2) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(q1, q2, p1)
  const d2 = d(q1, q2, p2)
  const d3 = d(p1, p2, q1)
  const d4 = d(p1, p2, q2)
  return d1 * d2 < 0 && d3 * d4 < 0
}

export function wallEnds(w, pose = w) {
  const dx = (Math.cos(pose.a) * w.len) / 2
  const dy = (Math.sin(pose.a) * w.len) / 2
  return { a: { x: pose.x - dx, y: pose.y - dy }, b: { x: pose.x + dx, y: pose.y + dy } }
}

const bayOf = (v, L) => {
  for (let i = 0; i < L.length - 1; i++) if (v >= L[i] && v < L[i + 1]) return i
  return -1
}

// ---------- deriving walls from the plan (pure) ----------

// X, Y: lines. A → B: configurations (equal when nothing changes). kOut: how far walls only in A
// have retracted; kIn: how far walls only in B have grown. Returns pieces { key, kind, a, b, thick,
// rooms, unit } and exits { id, a, b, mid, out, width }.
export function buildGeometry(X, Y, A, B, kOut = 1, kIn = 1) {
  const uA = wallUnits(A)
  const uB = A === B ? uA : wallUnits(B)
  const keys = new Set([...uA.keys(), ...uB.keys()])
  const units = []
  for (const k of keys) {
    const inA = uA.has(k)
    const inB = uB.has(k)
    const presence = inA && inB ? 1 : inA ? 1 - kOut : kIn
    if (presence <= 0.01) continue
    const info = inB ? uB.get(k) : uA.get(k)
    const oA = A.openings.get(k)
    const oB = B.openings.get(k)
    let opening = null
    if (oA && oB && oA.type === oB.type) opening = { ...oB, scale: 1 }
    else if (oB) opening = { ...oB, scale: kIn }
    else if (oA) opening = { ...oA, scale: 1 - kOut }
    const g = unitGeom(k, X, Y)
    units.push({ key: k, presence, rooms: info.rooms, exterior: info.exterior, opening, g })
  }
  // group full units on the same line, between the same rooms, into runs (one wall each)
  units.sort((p, q) => (p.g.v === q.g.v ? (p.g.line === q.g.line ? p.g.along - q.g.along : p.g.line - q.g.line) : p.g.v ? -1 : 1))
  const runs = []
  for (const u of units) {
    const last = runs[runs.length - 1]
    const pair = [...u.rooms].map((r) => r ?? '_').sort().join('')
    const join = last && u.presence === 1 && last.full && last.v === u.g.v && last.line === u.g.line && last.end === u.g.along && last.pair === pair
    if (join) {
      last.units.push(u)
      last.end = u.g.along + 1
    } else runs.push({ v: u.g.v, line: u.g.line, start: u.g.along, end: u.g.along + 1, pair, full: u.presence === 1, units: [u] })
  }
  const pieces = []
  const exits = []
  const doorways = []
  for (const run of runs) {
    const first = run.units[0]
    const lastU = run.units[run.units.length - 1]
    let a = first.g.a
    let b = lastU.g.b
    if (!run.full) {
      // a wall growing out of (or retracting into) its junction, from the end nearer the junction
      const p = first.presence
      b = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p }
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 0.02) continue
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    const kind = first.exterior ? 'shell' : 'interior'
    const thick = first.exterior ? SHELL_T : INTERIOR_T
    const key = `${run.v ? 'v' : 'h'}${run.line}:${run.start}-${run.end}:${run.pair}`
    // cut the openings out of the run
    const gaps = []
    for (const u of run.units) {
      if (!u.opening || u.opening.scale <= 0.02) continue
      const c = { x: (u.g.a.x + u.g.b.x) / 2, y: (u.g.a.y + u.g.b.y) / 2 }
      const t = (c.x - a.x) * dir.x + (c.y - a.y) * dir.y
      const w = (u.opening.type === 'window' ? WINDOW_W : DOOR_W) * u.opening.scale
      gaps.push({ t0: t - w / 2, t1: t + w / 2, o: u.opening, unit: u.key })
    }
    gaps.sort((p, q) => p.t0 - q.t0)
    let t = 0
    let n = 0
    const at = (s) => ({ x: a.x + dir.x * s, y: a.y + dir.y * s })
    for (const gp of gaps) {
      if (gp.t0 - t > 0.02) pieces.push({ key: `${key}#${n++}`, kind, a: at(t), b: at(gp.t0), thick, rooms: first.rooms })
      if (gp.o.type === 'window') pieces.push({ key: `${key}~${gp.unit}`, kind: 'glass', a: at(gp.t0), b: at(gp.t1), thick: GLASS_T, rooms: first.rooms, unit: gp.unit })
      if (gp.o.type === 'door' && gp.o.scale > 0.5) doorways.push({ id: gp.o.id, a: at(gp.t0), b: at(gp.t1), v: run.v })
      if (gp.o.type === 'exit') {
        // outward: toward the side of the unit that is outside (rooms = [before, after] across it)
        const insideIsFirst = first.rooms[0] !== null
        const out = run.v ? { x: insideIsFirst ? 1 : -1, y: 0 } : { x: 0, y: insideIsFirst ? 1 : -1 }
        const ea = at(gp.t0)
        const eb = at(gp.t1)
        exits.push({ id: gp.o.id, a: ea, b: eb, mid: { x: (ea.x + eb.x) / 2, y: (ea.y + eb.y) / 2 }, out, width: gp.t1 - gp.t0 })
      }
      t = gp.t1
    }
    if (len - t > 0.02) pieces.push({ key: `${key}#${n}`, kind, a: at(t), b, thick, rooms: first.rooms })
  }
  return { pieces, exits, doorways }
}

export class House {
  constructor(layout, frames, { config } = {}) {
    this.layout = layout
    // where the exits are: they belong to the plan, and he can move one (see exitAlternatives)
    this.exitSpecs = layout.exits.map((e) => ({ ...e }))
    this.cfgs = this.buildCfgs(this.exitSpecs)
    this.cfgCache = new Map()
    this.cfg = this.cfgs.get(config ?? layout.configs[0])
    this.X = X_REST.slice()
    this.Y = Y_REST.slice()
    this.ruleBroken = false
    this.doorOpen = new Map()
    this.persist = new Map() // wall key → persistent state (struck, lifted)
    this.transform = null
    this.bind(frames)
    this.derive()
  }

  get configId() {
    return this.cfg.id
  }

  buildCfgs(exits) {
    const m = new Map(this.layout.configs.map((id) => [id, buildConfig(id, { ...CONFIGS[id], exits })]))
    for (const [id, spec] of this.bodySpecs ?? []) m.set(id, buildConfig(id, { ...spec, exits }))
    return m
  }

  specOf(id) {
    return CONFIGS[id] ?? this.bodySpecs?.get(id)
  }

  // An organisation drawn from his body (bodyplan.js) for a posture: its outline, corridor and
  // rooms follow the posture's bones on the lines that posture holds. Registered like the drawn
  // organisations; returns its id, or null if that body cannot hold a valid house.
  bodyConfig(id, frames, { player = null } = {}) {
    const { X, Y } = this.linesFor(frames)
    const r = planFromBody(frames, X, Y, this.exitSpecs, { player, rule: !!this.layout.rule && !this.ruleBroken, label: id.split(':')[1]?.replace(/-/g, ' ') ?? 'his body' })
    if (!r.spec) return null
    const cfg = buildConfig(id, { ...r.spec, exits: this.exitSpecs })
    if (!validateConfig(cfg, X, Y).ok) return null
    this.bodySpecs ??= new Map()
    this.bodySpecs.set(id, r.spec)
    this.cfgs.set(id, cfg)
    return id
  }

  // The organisation of a plan: one of the house's, or the same rooms with exits elsewhere.
  cfgFor(configId, exits = null) {
    if (!exits) return this.cfgs.get(configId)
    const key = `${configId}|${JSON.stringify(exits)}`
    if (!this.cfgCache.has(key)) {
      if (this.cfgCache.size > 200) this.cfgCache.clear()
      this.cfgCache.set(key, buildConfig(configId, { ...this.specOf(configId), exits }))
    }
    return this.cfgCache.get(key)
  }

  // Other places in the exterior wall where an exit could be cut: every exterior unit of every
  // room, except where a door, an exit or a window already is. Returns full exit lists.
  exitAlternatives(id) {
    const cfg = this.cfg
    const out = []
    const rooms = new Set(cfg.bay.flat().filter(Boolean))
    for (const room of rooms) {
      if (cfg.rooms[room]?.type === 'court') continue
      for (const side of ['N', 'S', 'E', 'W']) {
        const units = exteriorUnits(cfg.sides, room, side)
        units.forEach((u, pick) => {
          if (cfg.openings.has(u)) return
          const g = unitGeom(u, this.X, this.Y)
          out.push({ exits: this.exitSpecs.map((e) => (e.id === id ? { id, room, side, pick } : e)), unit: u, mid: { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 } })
        })
      }
    }
    return out
  }

  // ---------- binding the grid lines to his body ----------

  bind(frames) {
    this.bindFrames = frames
    const sample = (line, vertical) => {
      const pts = []
      const [lo, hi] = vertical ? [Y_REST[0], Y_REST[NY]] : [X_REST[0], X_REST[NX]]
      for (let s = lo + 0.25; s < hi; s += 0.5) {
        const p = vertical ? { x: line, y: s } : { x: s, y: line }
        let best = null
        for (const [id, f] of Object.entries(frames)) {
          const d = Math.max(0, distToSegment(p, f.a, f.b) - f.hw)
          if (!best || d < best.d) best = { id, d, f }
        }
        const f = best.f
        const bx = f.b.x - f.a.x
        const by = f.b.y - f.a.y
        const u = clamp(((p.x - f.a.x) * bx + (p.y - f.a.y) * by) / (bx * bx + by * by || 1))
        pts.push({ bone: best.id, u, w: Math.exp(-((best.d / 1.6) ** 2)) })
      }
      return pts
    }
    this.lineBind = {
      X: X_REST.map((x, i) => (i === 0 || i === NX ? null : sample(x, true))),
      Y: Y_REST.map((y, j) => (j === 0 || j === NY ? null : sample(y, false))),
    }
  }

  // The lines his body puts the house on, for a set of bone frames.
  linesFor(frames) {
    const shift = (bind, axis) => {
      if (!bind) return 0
      let s = 0
      let wsum = 0
      for (const { bone, u, w } of bind) {
        const f0 = this.bindFrames[bone]
        const f1 = frames[bone]
        const p0 = f0.a[axis] + (f0.b[axis] - f0.a[axis]) * u
        const p1 = f1.a[axis] + (f1.b[axis] - f1.a[axis]) * u
        s += (p1 - p0) * w
        wsum += w
      }
      return wsum ? (s / wsum) * MOBILITY : 0
    }
    const X = constrainLines(X_REST.map((x, i) => x + clamp(shift(this.lineBind.X[i], 'x'), -1.1, 1.1)), X_REST)
    const Y = constrainLines(Y_REST.map((y, j) => y + clamp(shift(this.lineBind.Y[j], 'y'), -1.1, 1.1)), Y_REST)
    return { X, Y }
  }

  // A complete target: lines from a posture, and an organisation of rooms.
  // exits: a different placing of the exits (when he moves one), else as they are.
  planFor(frames, configId = this.cfg.id, exits = null) {
    const { X, Y } = this.linesFor(frames)
    return exits ? { X, Y, configId, exits } : { X, Y, configId }
  }

  validatePlan(plan) {
    return validateConfig(this.cfgFor(plan.configId, plan.exits), plan.X, plan.Y)
  }

  // ---------- the transformation system: the only thing that changes the walls ----------

  begin(target, { duration = 4, focus = null, label = '' } = {}) {
    if (target.exits) {
      // an exit moves: from now on the house's organisations carry it in its new place; the old
      // opening closes as the new one opens (the exit's wall units are walls in both)
      this.exitSpecs = target.exits.map((e) => ({ ...e }))
      this.cfgs = this.buildCfgs(this.exitSpecs)
    }
    const cfgB = this.cfgs.get(target.configId)
    const lineDelay = (L, i, vertical) => {
      if (!focus) return 0
      const d = Math.abs(L[i] - (vertical ? focus.x : focus.y))
      return clamp(d / 8) * 0.35 * duration
    }
    const changedLines = [...this.X.map((x, i) => Math.abs(target.X[i] - x)), ...this.Y.map((y, j) => Math.abs(target.Y[j] - y))].filter((d) => d > 0.03).length
    const topology = cfgB !== this.cfg
    if (!changedLines && !topology) return { moved: 0, lines: 0, topology: false }
    this.transform = {
      fromX: this.X.slice(),
      fromY: this.Y.slice(),
      toX: target.X.slice(),
      toY: target.Y.slice(),
      dX: this.X.map((_, i) => lineDelay(this.X, i, true)),
      dY: this.Y.map((_, j) => lineDelay(this.Y, j, false)),
      A: this.cfg,
      B: cfgB,
      t: 0,
      duration,
      label,
    }
    // how many walls take part
    const before = new Set(this.pieces.map((p) => p.key))
    const after = buildGeometry(target.X, target.Y, cfgB, cfgB).pieces
    let moved = 0
    for (const p of after) {
      const old = this.pieces.find((q) => q.key === p.key)
      if (!old || Math.hypot(old.a.x - p.a.x, old.a.y - p.a.y) + Math.hypot(old.b.x - p.b.x, old.b.y - p.b.y) > 0.05) moved++
    }
    for (const k of before) if (!after.some((p) => p.key === k)) moved++
    return { moved, lines: changedLines, topology }
  }

  get transforming() {
    return !!this.transform
  }

  update(dt, player) {
    const tr = this.transform
    if (tr) {
      tr.t += dt
      if (this.float) this.float.t += dt
      const span = (d) => Math.max(0.4, tr.duration - d)
      this.X = constrainLines(tr.fromX.map((x, i) => x + (tr.toX[i] - x) * ease((tr.t - tr.dX[i]) / span(tr.dX[i]))), X_REST)
      this.Y = constrainLines(tr.fromY.map((y, j) => y + (tr.toY[j] - y) * ease((tr.t - tr.dY[j]) / span(tr.dY[j]))), Y_REST)
      const kOut = ease(tr.t / (tr.duration * 0.45))
      const kIn = ease((tr.t - tr.duration * 0.45) / (tr.duration * 0.55))
      this.derive(tr.A, tr.B, kOut, kIn, player)
      if (tr.t >= tr.duration) {
        this.X = tr.toX.slice()
        this.Y = tr.toY.slice()
        this.cfg = tr.B
        this.transform = null
        this.derive(this.cfg, this.cfg, 1, 1, player)
        return 'done'
      }
      return true
    }
    // walls that rose over the ball come down once it has moved away
    if (player && this.walls.some((w) => w.lifted)) this.derive(this.cfg, this.cfg, 1, 1, player)
    // loose walls keep drifting while a dream holds them
    else if (this.float) {
      this.float.t += dt
      this.derive(this.cfg, this.cfg, 1, 1, player)
    }
    return false
  }

  // Rebuild the walls from the plan, keeping each wall's identity (struck, lifted) by its key.
  derive(A = this.cfg, B = this.cfg, kOut = 1, kIn = 1, player = null) {
    const { pieces, exits, doorways } = buildGeometry(this.X, this.Y, A, B, kOut, kIn)
    this.pieces = pieces
    this.doorways = doorways
    const walls = []
    for (const p of pieces) {
      const st = this.persist.get(p.key) ?? { struck: -9, lifted: false }
      this.persist.set(p.key, st)
      const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)
      const w = { id: p.key, kind: p.kind, thick: p.thick, len, x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2, a: Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x), rooms: p.rooms, windows: p.kind === 'glass' ? [{ at: 0.5, width: len, open: 1 }] : [], broken: false, region: this.regionAt?.((p.a.x + p.b.x) / 2, (p.a.y + p.b.y) / 2) ?? null }
      Object.defineProperty(w, 'struck', { get: () => st.struck, set: (v) => (st.struck = v), enumerable: true })
      // a wall sweeping across the ball rises over it; once clear, it comes down
      if (player) {
        const over = distToSegment(player, p.a, p.b) < player.r + p.thick / 2 + (st.lifted ? 0.05 : 0)
        st.lifted = (this.transform || st.lifted) && over
      } else st.lifted = false
      w.lifted = st.lifted
      // in a dream, chosen interior walls come loose: they drift, tilt and lift (still solid)
      const fl = this.float && p.kind === 'interior' ? this.float.of(p) : null
      if (fl && this.float.k > 0.001) {
        const k = this.float.k
        const t = this.float.t
        w.x += fl.amp * Math.sin(t * fl.wx + fl.phase) * k
        w.y += fl.amp * Math.cos(t * fl.wy + fl.phase * 1.3) * k
        w.a += fl.rot * Math.sin(t * fl.wr + fl.phase * 0.7) * k
        w.float = k * (0.55 + 0.45 * Math.sin(t * 1.1 + fl.phase))
      }
      walls.push(w)
    }
    // the oldest wall (stage III): a U around the sealed door, anchored to it
    const rule = this.layout.rule
    if (rule && !this.ruleBroken) {
      const d = exits.find((e) => e.id === rule.door)
      if (d) {
        const u = { x: (d.b.x - d.a.x) / d.width, y: (d.b.y - d.a.y) / d.width }
        const n = { x: -d.out.x, y: -d.out.y }
        const c = d.mid
        const P = (s, k) => ({ x: c.x + u.x * s + n.x * k, y: c.y + u.y * s + n.y * k })
        const segs = [
          [P(-rule.half, 0.15), P(-rule.half, rule.depth)],
          [P(-rule.half, rule.depth), P(rule.half, rule.depth)],
          [P(rule.half, rule.depth), P(rule.half, 0.15)],
        ]
        segs.forEach(([a, b], i) => {
          const len = Math.hypot(b.x - a.x, b.y - a.y)
          const key = `rule${i}`
          const st = this.persist.get(key) ?? { struck: -9 }
          this.persist.set(key, st)
          const w = { id: key, kind: 'rule', thick: SHELL_T * 0.9, len, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a: Math.atan2(b.y - a.y, b.x - a.x), rooms: [], windows: [], broken: false, lifted: false, region: null }
          Object.defineProperty(w, 'struck', { get: () => st.struck, set: (v) => (st.struck = v), enumerable: true })
          walls.push(w)
        })
      }
    }
    this.walls = walls
    const doors = exits.map((e) => ({ ...e, open: this.doorOpen.get(e.id) ?? true }))
    // an exit that moves to another wall closes in one before it opens in the other: for that
    // moment the house keeps it where it last was, so a door never vanishes
    for (const d of this.doors ?? []) if (!doors.some((e) => e.id === d.id)) doors.push(d)
    this.doors = doors
  }

  setDoorOpen(id, open) {
    this.doorOpen.set(id, open)
    for (const d of this.doors) if (d.id === id) d.open = open
  }

  breakRule() {
    this.ruleBroken = true
    this.derive()
  }

  // ---------- spatial queries ----------

  bayAt(x, y, X = this.X, Y = this.Y, cfg = this.cfg) {
    const i = bayOf(x, X)
    const j = bayOf(y, Y)
    if (i < 0 || j < 0) return null
    return cfg.bay[j][i]
  }

  inside(x, y) {
    return this.bayAt(x, y) !== null
  }

  // which room the point is in
  roomAt(x, y) {
    const r = this.bayAt(x, y)
    return r ? { id: r, ...this.cfg.rooms[r] } : null
  }

  get courtyards() {
    const out = []
    const cfg = this.transform && this.transform.t > this.transform.duration * 0.5 ? this.transform.B : this.cfg
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (cfg.rooms[cfg.bay[j][i]]?.type === 'court') out.push({ x0: this.X[i], y0: this.Y[j], x1: this.X[i + 1], y1: this.Y[j + 1] })
    return out
  }

  courtyardAt(x, y) {
    return this.courtyards.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
  }

  // Every bay, for drawing floors.
  bays() {
    const out = []
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) out.push({ x0: this.X[i], y0: this.Y[j], x1: this.X[i + 1], y1: this.Y[j + 1], room: this.cfg.bay[j][i], type: this.cfg.rooms[this.cfg.bay[j][i]]?.type ?? null })
    return out
  }

  // The corners of the building (for the wind drawing).
  get outline() {
    const pts = []
    for (const w of this.walls) if (w.kind === 'shell') pts.push(...Object.values(wallEnds(w)))
    return pts
  }

  get bound() {
    return this.walls.filter((w) => w.kind === 'interior')
  }

  // Solid geometry: the same walls that are drawn (glass panes are solid; open doors are gaps).
  segments() {
    const out = []
    for (const w of this.walls) {
      if (w.lifted) continue
      const e = wallEnds(w)
      out.push({ a: e.a, b: e.b, r: w.thick / 2, wall: w, kind: w.kind, key: w.id })
    }
    for (const d of this.doors) if (!d.open) out.push({ a: d.a, b: d.b, r: SHELL_T / 2, kind: 'door', key: `door:${d.id}` })
    return out
  }

  // Geometry of a target plan (for prediction): pieces and exits, plus the rule if any.
  geometryFor(plan) {
    const cfg = this.cfgFor(plan.configId, plan.exits)
    return buildGeometry(plan.X, plan.Y, cfg, cfg)
  }

  windows(pieces = null) {
    const list = pieces ?? this.walls.map((w) => ({ ...wallEnds(w), kind: w.kind, rooms: w.rooms, wall: w }))
    const out = []
    for (const p of list) {
      if (p.kind !== 'glass') continue
      const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)
      const along = { x: (p.b.x - p.a.x) / len, y: (p.b.y - p.a.y) / len }
      const x = (p.a.x + p.b.x) / 2
      const y = (p.a.y + p.b.y) / 2
      let n = { x: -along.y, y: along.x }
      if (this.inside(x + n.x * 0.3, y + n.y * 0.3)) n = { x: -n.x, y: -n.y }
      out.push({ wall: p.wall ?? null, x, y, along, outside: n, width: len, open: 1, kind: 'window', a: p.a, b: p.b })
    }
    return out
  }

  // ---------- reachability (a fine grid, 4 × 4 per cell) ----------

  // plan: a target ({ X, Y, configId }) to rasterise instead of the present walls.
  rasterise(plan = null, { ignoreRule = false, doorsShut = true, margin = 0 } = {}) {
    const W = COLS * RES
    const H = ROWS * RES
    const X = plan ? plan.X : this.X
    const Y = plan ? plan.Y : this.Y
    const cfg = plan ? this.cfgFor(plan.configId, plan.exits) : this.cfg
    const occ = new Uint8Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (this.bayAt((i + 0.5) / RES, (j + 0.5) / RES, X, Y, cfg) === null) occ[j * W + i] = 1
    const segs = plan ? this.geometryFor(plan).pieces : this.walls.filter((w) => w.kind !== 'rule').map((w) => ({ ...wallEnds(w), thick: w.thick }))
    const doors = plan ? this.geometryFor(plan).exits : this.doors
    for (const d of doors) this.clearDoor(occ, d)
    for (const s of segs) this.stamp(occ, s, s.thick, margin)
    if (!ignoreRule && !this.ruleBroken) for (const w of this.walls) if (w.kind === 'rule') this.stamp(occ, wallEnds(w), w.thick, margin)
    if (doorsShut) for (const d of this.doors) if (!d.open) this.stamp(occ, d, SHELL_T)
    return occ
  }

  stamp(occ, e, thick, margin = 0) {
    const W = COLS * RES
    const H = ROWS * RES
    const m = thick / 2 + PLAYER_R - 0.02 + margin
    const i0 = Math.max(0, Math.floor((Math.min(e.a.x, e.b.x) - m) * RES))
    const i1 = Math.min(W - 1, Math.ceil((Math.max(e.a.x, e.b.x) + m) * RES))
    const j0 = Math.max(0, Math.floor((Math.min(e.a.y, e.b.y) - m) * RES))
    const j1 = Math.min(H - 1, Math.ceil((Math.max(e.a.y, e.b.y) + m) * RES))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (distToSegment({ x: (i + 0.5) / RES, y: (j + 0.5) / RES }, e.a, e.b) < m) occ[j * W + i] = 1
  }

  clearDoor(occ, d) {
    const W = COLS * RES
    for (let k = 0; k <= 12; k++) {
      const t = 0.25 + (k / 12) * 0.5
      for (let s = -0.3; s <= 0.75; s += 0.08) {
        const x = d.a.x + (d.b.x - d.a.x) * t + d.out.x * s
        const y = d.a.y + (d.b.y - d.a.y) * t + d.out.y * s
        const i = Math.floor(x * RES)
        const j = Math.floor(y * RES)
        if (i >= 0 && j >= 0 && i < W && j < ROWS * RES) occ[j * W + i] = 0
      }
    }
  }

  distances(occ, from) {
    const W = COLS * RES
    const H = ROWS * RES
    const dist = new Int32Array(W * H).fill(-1)
    let i0 = Math.floor(from.x * RES)
    let j0 = Math.floor(from.y * RES)
    if (i0 < 0 || j0 < 0 || i0 >= W || j0 >= H) return dist
    if (occ[j0 * W + i0]) {
      let best = null
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const i = i0 + di
          const j = j0 + dj
          if (i < 0 || j < 0 || i >= W || j >= H || occ[j * W + i]) continue
          const d = di * di + dj * dj
          if (!best || d < best.d) best = { i, j, d }
        }
      }
      if (!best) return dist
      i0 = best.i
      j0 = best.j
    }
    const q = [j0 * W + i0]
    dist[q[0]] = 0
    for (let h = 0; h < q.length; h++) {
      const k = q[h]
      const i = k % W
      const j = (k - i) / W
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue
        const n = nj * W + ni
        if (occ[n] || dist[n] >= 0) continue
        dist[n] = dist[k] + 1
        q.push(n)
      }
    }
    return dist
  }

  distAt(dist, p) {
    const i = Math.floor(p.x * RES)
    const j = Math.floor(p.y * RES)
    const W = COLS * RES
    let best = -1
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const ii = i + di
        const jj = j + dj
        if (ii < 0 || jj < 0 || ii >= W || jj >= ROWS * RES) continue
        const v = dist[jj * W + ii]
        if (v >= 0 && (best < 0 || v < best)) best = v
      }
    }
    return best
  }

  routeTo(dist, door) {
    const v = this.distAt(dist, { x: door.mid.x + door.out.x * 0.15, y: door.mid.y + door.out.y * 0.15 })
    return v < 0 ? -1 : v / RES
  }

  path(occ, from, to) {
    const dist = this.distances(occ, to)
    const W = COLS * RES
    let i = Math.floor(from.x * RES)
    let j = Math.floor(from.y * RES)
    if (dist[j * W + i] < 0) {
      let best = null
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const v = dist[(j + dj) * W + (i + di)]
          if (v >= 0 && (!best || di * di + dj * dj < best.d)) best = { i: i + di, j: j + dj, d: di * di + dj * dj }
        }
      }
      if (!best) return null
      i = best.i
      j = best.j
    }
    const pts = []
    let cur = dist[j * W + i]
    while (cur > 0 && pts.length < 2000) {
      let moved = false
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = dist[(j + dj) * W + (i + di)]
        if (v >= 0 && v < cur) {
          i += di
          j += dj
          cur = v
          moved = true
          break
        }
      }
      if (!moved) break
      pts.push({ x: (i + 0.5) / RES, y: (j + 0.5) / RES })
    }
    return pts
  }

  freeAt(occ, p) {
    const i = Math.floor(p.x * RES)
    const j = Math.floor(p.y * RES)
    if (i < 0 || j < 0 || i >= COLS * RES || j >= ROWS * RES) return false
    return !occ[j * COLS * RES + i]
  }

  nearestFree(occ, p, door) {
    const dist = door ? this.distances(occ, { x: door.mid.x - door.out.x * 0.4, y: door.mid.y - door.out.y * 0.4 }) : null
    const W = COLS * RES
    let best = null
    for (let j = 0; j < ROWS * RES; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i
        if (occ[k] || (dist && dist[k] < 0)) continue
        const x = (i + 0.5) / RES
        const y = (j + 0.5) / RES
        if (!this.inside(x, y)) continue
        const d = Math.hypot(x - p.x, y - p.y)
        if (!best || d < best.d) best = { x, y, d }
      }
    }
    return best
  }
}
