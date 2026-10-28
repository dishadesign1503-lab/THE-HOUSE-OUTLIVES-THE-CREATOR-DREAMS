// THE ARCHITECT HE DREAMS HE IS — three ways of rebuilding the same plan.
//
// He hears and cannot see, so he dreams with his body: he declares himself an architect, and the
// house is rebuilt in that architect's spatial language. The source is always the present plan
// (its walls, its bays, its grid lines); nothing is invented from nothing. Each architect returns
// the same description, which the 3D dream (world.js) builds and walks:
//   walls      ribbons along a path, morphing from the plan's straight wall (k = 0) to the dream (k = 1)
//   columns    on the grid's crossings, growing out of the floor
//   ceilings   flat slabs or vaults over the bays (seen from below only: a cut-away from above)
//   floor      the architect's paving, and anything outside (Mies's pool)
// The anchor must stay reachable, as in the 2D dream: if a rebuilt house blocks every way to it,
// the dream is rebuilt more gently (dreamHouse), down to the plan itself.
// No browser APIs here.

import { PLAYER_RADIUS } from '../world/physics.js'

export const WALL_H = 1.9 // the height of a wall, in cells (the plan's unit)

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const P = (x, y) => ({ x, y })
const lerp = (a, b, k) => a + (b - a) * k
const hash = (str, seed = 0) => {
  let h = seed % 1000003
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 1000003
  return h / 1000003
}

function resample(a, b, n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(P(lerp(a.x, b.x, i / (n - 1)), lerp(a.y, b.y, i / (n - 1))))
  return out
}

// moves the points of a straight wall a → b sideways by o(t), t from 0 to 1 along it (left normal)
function bend(pts, a, b, o) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const n = P(-(b.y - a.y) / L, (b.x - a.x) / L)
  return pts.map((p, i) => {
    const d = o(i / (pts.length - 1))
    return P(p.x + n.x * d, p.y + n.y * d)
  })
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L) : 0
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}

const insideAt = (plan, x, y) => plan.bays.some((b) => b.room && x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)

// +1 when the wall's left normal points out of the house, -1 when it points in
function outwardSign(plan, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const m = P((a.x + b.x) / 2 - ((b.y - a.y) / L) * 0.3, (a.y + b.y) / 2 + ((b.x - a.x) / L) * 0.3)
  return insideAt(plan, m.x, m.y) ? -1 : 1
}

// the grid's crossings inside the house (where all four bays around belong to rooms)
function crossings(plan) {
  const out = []
  for (let i = 1; i < plan.X.length - 1; i++) {
    for (let j = 1; j < plan.Y.length - 1; j++) {
      const x = plan.X[i]
      const y = plan.Y[j]
      if ([-0.05, 0.05].every((dx) => [-0.05, 0.05].every((dy) => insideAt(plan, x + dx, y + dy)))) out.push(P(x, y))
    }
  }
  return out
}

function bounds(plan) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const w of plan.walls) {
    for (const p of [w.a, w.b]) {
      b.x0 = Math.min(b.x0, p.x)
      b.y0 = Math.min(b.y0, p.y)
      b.x1 = Math.max(b.x1, p.x)
      b.y1 = Math.max(b.y1, p.y)
    }
  }
  return b
}

const len = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
const points = (w) => Math.max(8, Math.ceil(len(w) * 8))

// A wall as the plan has it: straight, full height, its own thickness. The architects start here.
function planWall(w, mat) {
  const pts = resample(w.a, w.b, points(w))
  return { id: w.id, kind: w.kind, pts0: pts, pts1: pts, bot0: 0, bot1: 0, top0: WALL_H, top1: WALL_H, thick0: w.thick, thick1: w.thick, mat, solid: true }
}

// columns stand clear of the walls, of the player and of the anchor
function clearSpot(c, walls, keep, r) {
  if (keep.some((k) => Math.hypot(c.x - k.x, c.y - k.y) < k.r)) return false
  for (const w of walls) {
    if (!w.solid) continue
    for (let i = 0; i < w.pts1.length - 1; i++) if (distToSegment(c, w.pts1[i], w.pts1[i + 1]) < w.thick1 / 2 + r + 0.08) return false
  }
  return true
}

// ---------- the three architects ----------

export const ARCHITECTS = {
  gaudi: {
    id: 'gaudi',
    name: 'ANTONI GAUDÍ',
    years: '1852 – 1926',
    declaration: 'I AM GAUDÍ.',
    motto: 'The straight line belongs to men. The curved line belongs to God.',
    principles: ['Every wall bends into a wave.', 'The ceilings hang like chains, turned upside down.', 'Columns branch like trees.', 'Broken tiles cover everything.'],
    accent: '#ffb36b',
    look: { background: '#160c0e', fog: '#2a1611', sky: '#ffd9a8', ground: '#3a1d10', sun: '#ffb36b', sunAt: [-4, 9, 3], fogNear: 2.5, fogFar: 15 },
    build(plan, s, keep) {
      const walls = plan.walls.map((w) => {
        const e = planWall(w, 'trencadis')
        const h = hash(w.id, plan.seed)
        const n = e.pts0.length
        if (w.kind === 'interior') {
          // waves, the ends held so the junctions stay joined
          const m = 1 + Math.floor(h * 3)
          const A = s * Math.min(0.3, 0.16 * len(w) + 0.04)
          e.pts1 = bend(e.pts0, w.a, w.b, (t) => A * Math.sin(Math.PI * t) * Math.sin(Math.PI * t * m + h * 6.283))
          e.top1 = e.pts0.map((_, i) => WALL_H * (1.08 + 0.1 * s * Math.sin((i / (n - 1)) * Math.PI * (m + 1) + h * 9)))
          e.thick1 = w.thick * 1.4
        } else if (w.kind === 'shell' || w.kind === 'glass') {
          // the facade swells outward, like stone worn by the sea (Casa Milà)
          const m = Math.max(1, Math.round(len(w) / 1.6))
          const A = s * Math.min(0.32, 0.12 * len(w)) * outwardSign(plan, w.a, w.b)
          e.pts1 = bend(e.pts0, w.a, w.b, (t) => A * Math.abs(Math.sin(Math.PI * t * m)))
          e.top1 = e.pts0.map((_, i) => WALL_H * (1.16 + 0.12 * Math.sin((i / (n - 1)) * Math.PI * 2 * m + h * 5)))
          e.mat = w.kind === 'glass' ? 'stained' : 'stone'
          if (w.kind === 'glass') e.thick1 = 0.08
        } else if (w.kind === 'door') e.mat = 'door'
        else e.mat = 'stone'
        return e
      })
      const columns = []
      if (s >= 0.6) for (const c of crossings(plan)) if (clearSpot(c, walls, keep, 0.14)) columns.push({ ...c, r: 0.1, h: WALL_H * 1.15, shape: 'tree', mat: 'stone' })
      // a catenary vault over every bay of a room (open courts stay open to the sky)
      const ceilings = plan.bays.filter((b) => b.room && b.type !== 'court').map((b) => ({ ...b, kind: 'vault', y: WALL_H * 1.12, rise: 0.4 * Math.min(b.x1 - b.x0, b.y1 - b.y0), mat: 'vault' }))
      return { walls, columns, ceilings, floor: 'hex', extras: [] }
    },
  },

  corbusier: {
    id: 'corbusier',
    name: 'LE CORBUSIER',
    years: '1887 – 1965',
    declaration: 'I AM LE CORBUSIER.',
    motto: 'A house is a machine for living in.',
    principles: ['The structure stands apart: pilotis on a grid.', 'The free plan: walls let go of the columns.', 'A ribbon window runs along the facade.', 'Colour on the partitions, white everywhere else.'],
    accent: '#2a6bff',
    look: { background: '#cdd3d8', fog: '#cdd3d8', sky: '#ffffff', ground: '#8b8f93', sun: '#fff4e0', sunAt: [5, 10, -3], fogNear: 4, fogFar: 22 },
    build(plan, s, keep) {
      const grid = crossings(plan)
      const nearGrid = (p) => grid.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 0.08)
      const walls = []
      for (const w of plan.walls) {
        const h = hash(w.id, plan.seed)
        if (w.kind === 'interior') {
          // free plan: a partition lets go of the column at its end, and some of them curve
          const e = planWall(w, h < 0.5 ? 'white' : ['blue', 'red', 'ochre', 'green'][Math.floor(h * 8) % 4])
          const L = len(w)
          const u = P((w.b.x - w.a.x) / L, (w.b.y - w.a.y) / L)
          const pa = nearGrid(w.a) ? 0.32 * s : 0
          const pb = nearGrid(w.b) ? 0.32 * s : 0
          if (L - pa - pb < 0.25) {
            // too short to stand on its own: it goes
            e.top1 = 0
            e.solid = false
          } else {
            const a1 = P(w.a.x + u.x * pa, w.a.y + u.y * pa)
            const b1 = P(w.b.x - u.x * pb, w.b.y - u.y * pb)
            e.pts1 = resample(a1, b1, e.pts0.length)
            const A = s * Math.min(0.35, 0.22 * (L - pa - pb)) * (h < 0.25 ? 1 : h < 0.4 ? -1 : 0)
            if (A) e.pts1 = bend(e.pts1, a1, b1, (t) => A * Math.sin(Math.PI * t))
            e.thick1 = 0.1
          }
          walls.push(e)
        } else if (w.kind === 'shell' || w.kind === 'glass') {
          // free facade: a parapet, a ribbon of glass, and a band of wall above it
          const parapet = planWall(w, 'white')
          parapet.top1 = 0.85
          const ribbon = planWall(w, 'ribbon')
          Object.assign(ribbon, { id: `${w.id}:ribbon`, bot0: 0.85, bot1: 0.85, top0: 0.85, top1: 1.5, thick1: 0.05, solid: false })
          const band = planWall(w, 'white')
          Object.assign(band, { id: `${w.id}:band`, bot0: WALL_H, bot1: 1.5, solid: false })
          walls.push(parapet, ribbon, band)
        } else walls.push(planWall(w, w.kind === 'door' ? 'red' : 'white'))
      }
      const columns = []
      if (s >= 0.6) for (const c of grid) if (clearSpot(c, walls, keep, 0.09)) columns.push({ ...c, r: 0.09, h: WALL_H, shape: 'round', mat: 'white' })
      const ceilings = plan.bays.filter((b) => b.room && b.type !== 'court').map((b) => ({ ...b, kind: 'slab', y: WALL_H, mat: 'ceiling' }))
      return { walls, columns, ceilings, floor: 'concrete', extras: [] }
    },
  },

  mies: {
    id: 'mies',
    name: 'LUDWIG MIES VAN DER ROHE',
    years: '1886 – 1969',
    declaration: 'I AM MIES VAN DER ROHE.',
    motto: 'Less is more.',
    principles: ['The walls stand free and slide past each other.', 'The outer walls become glass.', 'Cruciform steel columns carry a thin roof.', 'Marble, onyx, travertine, and still water.'],
    accent: '#9fb8ff',
    look: { background: '#0a1120', fog: '#0f1a2c', sky: '#9fb8ff', ground: '#1a1a1a', sun: '#dfe8ff', sunAt: [3, 8, 6], fogNear: 4, fogFar: 20 },
    build(plan, s, keep) {
      const walls = []
      const columns = []
      for (const w of plan.walls) {
        const h = hash(w.id, plan.seed)
        if (w.kind === 'interior') {
          // a free-standing plane: it runs past one corner and stops short of the other, so the
          // walls no longer meet and the space flows between them (Barcelona Pavilion)
          const e = planWall(w, ['onyx', 'marble', 'travertineWall'][Math.floor(h * 6) % 3])
          const L = len(w)
          const u = P((w.b.x - w.a.x) / L, (w.b.y - w.a.y) / L)
          const n = P(-u.y, u.x)
          const ext = s * (0.25 + 0.3 * hash(w.id, plan.seed + 3))
          const cut = s * 0.32
          const [ea, eb] = h < 0.5 ? [ext, -cut] : [-cut, ext]
          const shift = s * 0.08 * (hash(w.id, plan.seed + 5) < 0.5 ? -1 : 1)
          if (L + ea + eb < 0.3) {
            e.top1 = 0
            e.solid = false
          } else {
            const a1 = P(w.a.x - u.x * ea + n.x * shift, w.a.y - u.y * ea + n.y * shift)
            const b1 = P(w.b.x + u.x * eb + n.x * shift, w.b.y + u.y * eb + n.y * shift)
            e.pts1 = resample(a1, b1, e.pts0.length)
            e.thick1 = 0.08
          }
          walls.push(e)
        } else if (w.kind === 'shell' || w.kind === 'glass' || w.kind === 'door') {
          // the whole skin becomes glass between thin steel mullions
          const e = planWall(w, 'glass')
          e.thick1 = 0.04
          walls.push(e)
          const n = Math.max(1, Math.round(len(w) / 1.2))
          for (let i = 1; i < n; i++) columns.push({ x: lerp(w.a.x, w.b.x, i / n), y: lerp(w.a.y, w.b.y, i / n), r: 0.02, h: WALL_H, shape: 'mullion', mat: 'steel', solid: false })
        } else walls.push(planWall(w, 'travertineWall'))
      }
      if (s >= 0.6) for (const c of crossings(plan)) if (clearSpot(c, walls, keep, 0.1)) columns.push({ ...c, r: 0.08, h: WALL_H, shape: 'cross', mat: 'steel' })
      // one thin roof plane, reaching past the glass
      const b = bounds(plan)
      const ceilings = [{ kind: 'slab', x0: b.x0 - 0.9, y0: b.y0 - 0.9, x1: b.x1 + 0.9, y1: b.y1 + 0.9, y: WALL_H, mat: 'ceiling' }]
      const extras = [{ kind: 'pool', x0: b.x0 - 0.4, x1: b.x1 + 0.4, y0: b.y1 + 0.9, y1: b.y1 + 3.4 }]
      return { walls, columns, ceilings, floor: 'travertine', extras }
    },
  },
}

// which architect he becomes: his own choice, read from the dream's seed (?architect=gaudi to test)
export function pickArchitect(seed) {
  const forced = typeof location !== 'undefined' && /[?&#]architect=(\w+)/.exec(location.search + location.hash)?.[1]
  if (forced && ARCHITECTS[forced]) return ARCHITECTS[forced]
  const ids = Object.keys(ARCHITECTS)
  return ARCHITECTS[ids[Math.abs(Math.floor(seed)) % ids.length]]
}

// ---------- the solid part, and the way to the anchor ----------

// what the player collides with in the dreamt house (k = 1): { a, b, r, key } as physics.js expects
export function solidsOf(house) {
  const out = []
  for (const w of house.walls) {
    if (!w.solid || Math.max(...[w.top1].flat()) < 0.3) continue
    for (let i = 0; i < w.pts1.length - 1; i++) out.push({ a: w.pts1[i], b: w.pts1[i + 1], r: w.thick1 / 2, key: `${w.id}:${i}`, kind: w.kind })
  }
  for (const c of house.columns) if (c.solid !== false) out.push({ a: c, b: c, r: c.r, key: `col:${c.x.toFixed(2)},${c.y.toFixed(2)}`, kind: 'column' })
  return out
}

const RES = 0.08

// a fine grid of where the player's circle fits, and the flood from the start across it
function reachGrid(solids, area) {
  const W = Math.ceil((area.x1 - area.x0) / RES)
  const H = Math.ceil((area.y1 - area.y0) / RES)
  const blocked = new Uint8Array(W * H)
  for (const s of solids) {
    const m = s.r + PLAYER_RADIUS
    const i0 = Math.max(0, Math.floor((Math.min(s.a.x, s.b.x) - m - area.x0) / RES))
    const i1 = Math.min(W - 1, Math.ceil((Math.max(s.a.x, s.b.x) + m - area.x0) / RES))
    const j0 = Math.max(0, Math.floor((Math.min(s.a.y, s.b.y) - m - area.y0) / RES))
    const j1 = Math.min(H - 1, Math.ceil((Math.max(s.a.y, s.b.y) + m - area.y0) / RES))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (blocked[j * W + i]) continue
        const c = P(area.x0 + (i + 0.5) * RES, area.y0 + (j + 0.5) * RES)
        if (distToSegment(c, s.a, s.b) < m) blocked[j * W + i] = 1
      }
    }
  }
  const cellOf = (p) => {
    const i = Math.floor((p.x - area.x0) / RES)
    const j = Math.floor((p.y - area.y0) / RES)
    return i >= 0 && j >= 0 && i < W && j < H ? j * W + i : -1
  }
  const centre = (c) => P(area.x0 + ((c % W) + 0.5) * RES, area.y0 + (Math.floor(c / W) + 0.5) * RES)
  // the free cell nearest to p (breadth-first over every cell)
  const nearestFree = (p) => {
    const c0 = cellOf(p)
    if (c0 < 0) return null
    const seen = new Uint8Array(W * H)
    const q = [c0]
    seen[c0] = 1
    for (let n = 0; n < q.length; n++) {
      const c = q[n]
      if (!blocked[c]) return centre(c)
      const i = c % W
      for (const d of [i > 0 ? -1 : 0, i < W - 1 ? 1 : 0, -W, W]) {
        const k = c + d
        if (d && k >= 0 && k < W * H && !seen[k]) {
          seen[k] = 1
          q.push(k)
        }
      }
    }
    return null
  }
  const flood = (p) => {
    const reach = new Uint8Array(W * H)
    const c0 = cellOf(p)
    if (c0 < 0 || blocked[c0]) return reach
    const q = [c0]
    reach[c0] = 1
    for (let n = 0; n < q.length; n++) {
      const c = q[n]
      const i = c % W
      for (const d of [i > 0 ? -1 : 0, i < W - 1 ? 1 : 0, -W, W]) {
        const k = c + d
        if (d && k >= 0 && k < W * H && !reach[k] && !blocked[k]) {
          reach[k] = 1
          q.push(k)
        }
      }
    }
    return reach
  }
  return { W, H, cellOf, centre, nearestFree, flood }
}

// Rebuild the plan as the architect would, as strongly as still leaves the anchor within reach.
// Returns { house, start, anchor, strength }: where the player stands, and where the anchor is.
export function dreamHouse(plan, architect) {
  const b = bounds(plan)
  const area = { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 }
  const keep = [{ ...plan.player, r: 0.6 }, ...(plan.anchor ? [{ ...plan.anchor, r: 0.9 }] : [])]
  for (const s of [1, 0.6, 0.3, 0]) {
    const house = architect.build(plan, s, keep)
    house.bounds = b
    const grid = reachGrid(solidsOf(house), area)
    const start = grid.nearestFree(plan.player)
    if (!start) continue
    const reach = grid.flood(start)
    let anchor = plan.anchor
    if (!anchor) {
      // no anchor was set: the reachable spot farthest from the player holds it
      let best = -1
      for (let c = 0; c < reach.length; c++) {
        if (!reach[c]) continue
        const p = grid.centre(c)
        const d = Math.hypot(p.x - start.x, p.y - start.y)
        if (insideAt(plan, p.x, p.y) && d > best) [best, anchor] = [d, { ...p, room: null }]
      }
    }
    // the anchor tile (0.6 × 0.6) must have a cell the player can stand in
    const ok = anchor && [-0.2, 0, 0.2].some((dx) => [-0.2, 0, 0.2].some((dy) => reach[grid.cellOf(P(anchor.x + dx, anchor.y + dy))]))
    if (ok || s === 0) return { house, start, anchor: anchor ?? start, strength: s }
  }
  return null
}
