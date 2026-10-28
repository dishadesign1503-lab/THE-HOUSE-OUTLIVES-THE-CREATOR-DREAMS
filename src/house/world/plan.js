// THE FLOOR PLAN AS ARCHITECTURAL DATA — a tartan grid of structural lines and the rooms between.
//
//   lines      X (vertical grid lines) and Y (horizontal), in cells. The outer lines are the
//              building's frame and never move; inner lines move when the house changes.
//   bays       the rectangles between consecutive lines (6 × 8 here)
//   rooms      each a set of bays, with a stable id, a name and a type (room, corridor, court…)
//   units      each bay edge. A unit between two different rooms (or a room and outside) is part
//              of a wall; a unit between bays of the same room is open floor.
//   walls      consecutive units on one line between the same two rooms form one wall, with a
//              stable id, its two rooms, a thickness (exterior thick, interior thinner) and its
//              openings. Shared boundaries therefore exist once, and every wall ends at a junction.
//   openings   doors between rooms, exits in the exterior wall, windows in exterior walls: each sits
//              on one unit and is cut out of the wall as a real gap (a window holds a glass pane).
//
// A configuration = an assignment of bays to rooms + its doors, exits and windows. The house
// transforms by moving its lines (rooms grow and shrink, walls on a line move together, openings
// travel with their walls) and, for large changes, by passing to another configuration (walls that
// end retract into their junctions while the new ones grow out of theirs).

export const X_REST = [0.6, 2.2, 3.4, 4.6, 5.8, 7.0, 8.4]
export const Y_REST = [0.8, 2.4, 3.6, 5.0, 6.4, 7.6, 9.0, 10.6, 12.4]
export const NX = X_REST.length - 1 // bay columns
export const NY = Y_REST.length - 1 // bay rows
export const SHELL_T = 0.3
export const INTERIOR_T = 0.14
export const GLASS_T = 0.06
export const DOOR_W = 0.84
export const WINDOW_W = 0.62
export const MIN_BAY = 1.0

const SIDES = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }

// ---------- units: the edges of the bays ----------
// vertical unit "v{i}_{j}": on X line i, between Y lines j and j+1; separates bays (i-1, j) and (i, j)
// horizontal unit "h{j}_{i}": on Y line j, between X lines i and i+1; separates bays (i, j-1) and (i, j)

export function unitSides(key) {
  const v = key[0] === 'v'
  const [a, b] = key.slice(1).split('_').map(Number)
  return v ? [[a - 1, b], [a, b]] : [[b, a - 1], [b, a]]
}

export function unitGeom(key, X, Y) {
  const v = key[0] === 'v'
  const [a, b] = key.slice(1).split('_').map(Number)
  return v ? { a: { x: X[a], y: Y[b] }, b: { x: X[a], y: Y[b + 1] }, v: true, line: a, along: b } : { a: { x: X[b], y: Y[a] }, b: { x: X[b + 1], y: Y[a] }, v: false, line: a, along: b }
}

export function allUnits() {
  const out = []
  for (let i = 0; i <= NX; i++) for (let j = 0; j < NY; j++) out.push(`v${i}_${j}`)
  for (let j = 0; j <= NY; j++) for (let i = 0; i < NX; i++) out.push(`h${j}_${i}`)
  return out
}

// ---------- configurations ----------

// spec: { map: 8 strings of 6 letters ('.' = outside), rooms: { letter: { name, type } },
//         doors: [[A, B, pick?]], exits: [{ id, room, side, pick? }], windows: [[room, side, pick?]] }
export function buildConfig(id, spec) {
  const bay = spec.map.map((row) => [...row].map((ch) => (ch === '.' ? null : ch)))
  const roomAt = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NY ? null : bay[j][i])
  const sides = (key) => unitSides(key).map(([i, j]) => roomAt(i, j))
  const shared = (A, B) =>
    allUnits()
      .filter((k) => {
        const [p, q] = sides(k)
        return (p === A && q === B) || (p === B && q === A)
      })
      .sort()
  const exterior = (R, side) => exteriorUnits(sides, R, side)
  const pick = (list, p) => list[p == null ? Math.floor((list.length - 1) / 2) : Math.min(list.length - 1, p)]
  const openings = new Map() // unit → { type: 'door' | 'exit' | 'window', id }
  const problems = []
  for (const [A, B, p] of spec.doors) {
    const u = pick(shared(A, B), p)
    if (!u) problems.push(`no shared wall between ${A} and ${B}`)
    else openings.set(u, { type: 'door', id: `${A}-${B}` })
  }
  for (const e of spec.exits ?? []) {
    const u = pick(exterior(e.room, e.side), e.pick)
    if (!u) problems.push(`no ${e.side} wall for exit ${e.id}`)
    else openings.set(u, { type: 'exit', id: e.id })
  }
  for (const [R, side, p] of spec.windows ?? []) {
    const u = pick(exterior(R, side), p)
    // an organisation whose room has no such wall simply has no window there
    if (u && !openings.has(u)) openings.set(u, { type: 'window', id: `${R}${side}` })
  }
  return { id, label: spec.label ?? id, character: spec.character ?? {}, bay, rooms: spec.rooms, openings, problems, roomAt, sides }
}

// The units of room R's exterior wall on one side (N, S, E or W), in order. sides: unit → [p, q].
export function exteriorUnits(sides, R, side) {
  const [dx, dy] = SIDES[side]
  return allUnits()
    .filter((k) => {
      const [p, q] = sides(k)
      const v = k[0] === 'v'
      if (v !== (dx !== 0)) return false
      // the room on the inner side, outside on the outer side
      return dx + dy > 0 ? p === R && q === null : p === null && q === R
    })
    .sort()
}

// The units that are walls in a configuration: { key → { rooms: [A, B], exterior } }
export function wallUnits(cfg) {
  const out = new Map()
  for (const k of allUnits()) {
    const [p, q] = cfg.sides(k)
    if (p === q) continue
    out.set(k, { rooms: [p, q], exterior: p === null || q === null })
  }
  return out
}

// ---------- room graph ----------

export function roomGraph(cfg) {
  const adj = new Map()
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a).add(b)
  }
  for (const [u, o] of cfg.openings) {
    if (o.type !== 'door') continue
    const [a, b] = cfg.sides(u)
    add(a, b)
    add(b, a)
  }
  return adj
}

// ---------- lines ----------

// Keep lines in order with every bay at least MIN_BAY; the frame lines stay where they are.
export function constrainLines(L, rest) {
  const out = L.slice()
  out[0] = rest[0]
  out[out.length - 1] = rest[rest.length - 1]
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < out.length - 1; i++) out[i] = Math.max(out[i], out[i - 1] + MIN_BAY)
    for (let i = out.length - 2; i >= 1; i--) out[i] = Math.min(out[i], out[i + 1] - MIN_BAY)
  }
  return out
}

// ---------- validation ----------

// Is a configuration architecturally valid with these lines?
export function validateConfig(cfg, X, Y) {
  const problems = [...cfg.problems]
  for (let i = 0; i < NX; i++) if (X[i + 1] - X[i] < MIN_BAY - 1e-6) problems.push(`column ${i} too narrow`)
  for (let j = 0; j < NY; j++) if (Y[j + 1] - Y[j] < MIN_BAY - 1e-6) problems.push(`row ${j} too narrow`)
  const walls = wallUnits(cfg)
  for (const [u, o] of cfg.openings) {
    if (!walls.has(u)) problems.push(`${o.type} ${o.id} is not in a wall`)
    const g = unitGeom(u, X, Y)
    const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
    const need = o.type === 'window' ? WINDOW_W + 0.2 : DOOR_W + 0.16
    if (len < need) problems.push(`${o.type} ${o.id} does not fit its wall`)
    if (o.type === 'door' && walls.get(u)?.exterior) problems.push(`door ${o.id} opens to the outside`)
    if ((o.type === 'window' || o.type === 'exit') && !walls.get(u)?.exterior) problems.push(`${o.type} ${o.id} is not in an exterior wall`)
  }
  // every room reachable from every other through doors (one connected house)
  const rooms = new Set(cfg.bay.flat().filter(Boolean))
  const adj = roomGraph(cfg)
  const first = [...rooms][0]
  const seen = new Set([first])
  const q = [first]
  while (q.length) for (const n of adj.get(q.shift()) ?? []) if (!seen.has(n)) seen.add(n), q.push(n)
  for (const r of rooms) if (!seen.has(r)) problems.push(`room ${r} cannot be reached`)
  return { ok: problems.length === 0, problems }
}

// ---------- how different two plans are ----------

// Compare plan A (cfgA with lines XA, YA) with plan B. Returns:
//   baysReassigned  share of bays that now belong to another room (0..1)
//   adjacency       how many pairs of rooms became, or stopped being, neighbours
//   wallsMoved      share of B's wall length lying more than 0.3 cells from any wall of A (0..1)
//   roomShift       mean distance (cells) the rooms' centres moved
export function comparePlans(cfgA, XA, YA, cfgB, XB, YB) {
  let changed = 0
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (cfgA.bay[j][i] !== cfgB.bay[j][i]) changed++
  const pairs = (cfg) => {
    const s = new Set()
    for (const [, w] of wallUnits(cfg)) if (w.rooms[0] && w.rooms[1]) s.add([...w.rooms].sort().join(''))
    return s
  }
  const pa = pairs(cfgA)
  const pb = pairs(cfgB)
  let adjacency = 0
  for (const p of pa) if (!pb.has(p)) adjacency++
  for (const p of pb) if (!pa.has(p)) adjacency++
  const segs = (cfg, X, Y) => [...wallUnits(cfg).keys()].map((k) => unitGeom(k, X, Y))
  const sa = segs(cfgA, XA, YA)
  const sb = segs(cfgB, XB, YB)
  const near = (p) => sa.some((s) => distSeg(p, s.a, s.b) < 0.3)
  let total = 0
  let moved = 0
  for (const s of sb) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    const n = Math.max(2, Math.ceil(len / 0.25))
    for (let i = 0; i <= n; i++) {
      const p = { x: s.a.x + ((s.b.x - s.a.x) * i) / n, y: s.a.y + ((s.b.y - s.a.y) * i) / n }
      total++
      if (!near(p)) moved++
    }
  }
  const centre = (cfg, X, Y) => {
    const c = {}
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const r = cfg.bay[j][i]
        if (!r) continue
        const a = (X[i + 1] - X[i]) * (Y[j + 1] - Y[j])
        c[r] ??= { x: 0, y: 0, a: 0 }
        c[r].x += ((X[i] + X[i + 1]) / 2) * a
        c[r].y += ((Y[j] + Y[j + 1]) / 2) * a
        c[r].a += a
      }
    }
    return c
  }
  const ca = centre(cfgA, XA, YA)
  const cb = centre(cfgB, XB, YB)
  let shift = 0
  let n = 0
  for (const r of Object.keys(ca)) {
    if (!cb[r]) continue
    shift += Math.hypot(ca[r].x / ca[r].a - cb[r].x / cb[r].a, ca[r].y / ca[r].a - cb[r].y / cb[r].a)
    n++
  }
  return { baysReassigned: +(changed / (NX * NY)).toFixed(2), adjacency, wallsMoved: +(moved / Math.max(1, total)).toFixed(2), roomShift: +(shift / Math.max(1, n)).toFixed(2) }
}

function distSeg(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}
