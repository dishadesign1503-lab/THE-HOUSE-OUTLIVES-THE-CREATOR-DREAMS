// Headless check of the 3D dream (src/house/dream3d/architects.js): for many dreams in every
// stage, each architect rebuilds the plan, and the anchor must stay reachable from the player:
// a player walked along the way there, through the walls' own collision, must step on it.
// Every architect must build only what world.js can draw, and each must rebuild the plan in a
// spatial language of its own (not only another colour).
// Run: npm run test:dream3d

import { Game } from '../src/house/game/game.js'
import { ARCHITECTS, dreamHouse, solidsOf } from '../src/house/dream3d/architects.js'
import { collide, PLAYER_RADIUS } from '../src/house/world/physics.js'
import { readFileSync } from 'node:fs'

// what world.js knows how to draw
const WORLD = readFileSync(new URL('../src/house/dream3d/world.js', import.meta.url), 'utf8')
const CAN = {
  mat: new Set([...WORLD.matchAll(/^ {4}(\w+): std\(/gm)].map((m) => m[1])),
  floor: new Set([...WORLD.matchAll(/kind === '(\w+)'\) return \{ mat/g)].map((m) => m[1]).concat('travertine')),
  shape: new Set([...WORLD.matchAll(/c\.shape === '(\w+)'/g)].map((m) => m[1]).concat('round')),
  ceiling: new Set([...WORLD.matchAll(/cl\.kind === '(\w+)'/g)].map((m) => m[1]).concat('slab')),
}

// walk a player from the start to the anchor: the shortest way over a fine grid of where the
// player fits, then step along it with the game's collision, as world.js walks
function walkToAnchor(d) {
  const solids = solidsOf(d.house)
  const b = d.house.bounds
  const R = 0.08
  const x0 = b.x0 - 1
  const y0 = b.y0 - 1
  const W = Math.ceil((b.x1 - b.x0 + 2) / R)
  const H = Math.ceil((b.y1 - b.y0 + 2) / R)
  const free = new Uint8Array(W * H).fill(1)
  const at = (c) => ({ x: x0 + ((c % W) + 0.5) * R, y: y0 + (Math.floor(c / W) + 0.5) * R })
  // a cell is blocked where the player's circle would touch a solid
  for (const s of solids) {
    const m = s.r + PLAYER_RADIUS
    const [dx, dy] = [s.b.x - s.a.x, s.b.y - s.a.y]
    const L = dx * dx + dy * dy
    for (let j = Math.max(0, Math.floor((Math.min(s.a.y, s.b.y) - m - y0) / R)); j <= Math.min(H - 1, Math.ceil((Math.max(s.a.y, s.b.y) + m - y0) / R)); j++) {
      for (let i = Math.max(0, Math.floor((Math.min(s.a.x, s.b.x) - m - x0) / R)); i <= Math.min(W - 1, Math.ceil((Math.max(s.a.x, s.b.x) + m - x0) / R)); i++) {
        const p = at(j * W + i)
        const t = L ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L)) : 0
        if (Math.hypot(p.x - s.a.x - dx * t, p.y - s.a.y - dy * t) < m) free[j * W + i] = 0
      }
    }
  }
  const cellOf = (p) => Math.floor((p.y - y0) / R) * W + Math.floor((p.x - x0) / R)
  const onAnchor = (p) => Math.hypot(Math.max(Math.abs(p.x - d.anchor.x) - 0.3, 0), Math.max(Math.abs(p.y - d.anchor.y) - 0.3, 0)) < PLAYER_RADIUS
  const from = new Int32Array(W * H).fill(-1)
  const c0 = cellOf(d.start)
  from[c0] = c0
  const q = [c0]
  let goal = -1
  for (let n = 0; n < q.length && goal < 0; n++) {
    const c = q[n]
    if (onAnchor(at(c))) goal = c
    const i = c % W
    for (const k of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, c - W, c + W]) {
      if (k >= 0 && k < W * H && free[k] && from[k] < 0) {
        from[k] = c
        q.push(k)
      }
    }
  }
  if (goal < 0) return false
  const path = []
  for (let c = goal; c !== c0; c = from[c]) path.unshift(at(c))
  const p = { x: d.start.x, y: d.start.y, vx: 0, vy: 0, r: PLAYER_RADIUS, contactUntil: {} }
  for (const t of path) {
    for (let i = 0; i < 4; i++) {
      p.x += (t.x - p.x) / (4 - i)
      p.y += (t.y - p.y) / (4 - i)
      collide(p, solids)
    }
  }
  return onAnchor(p)
}

// the shape of a rebuilt house, at the architect's full strength: how far the partitions bend
// off their line, how far their ends move, how much their tops vary, how many fold sharply
function shapeOf(house) {
  const parts = house.walls.filter((w) => w.kind === 'interior' && w.solid)
  const mean = (f) => parts.reduce((s, w) => s + f(w), 0) / (parts.length || 1)
  const off = (p, a, b) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1)
  const tops = (w) => [w.top1].flat()
  const turn = (w) => {
    let max = 0
    const P = w.pts1
    for (let i = 1; i < P.length - 1; i++) {
      const a = Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x)
      const b = Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x)
      max = Math.max(max, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))))
    }
    return max
  }
  const end = (w, i, j) => Math.hypot(w.pts1[i].x - w.pts0[i].x, w.pts1[i].y - w.pts0[i].y) + Math.hypot(w.pts1[j].x - w.pts0[j].x, w.pts1[j].y - w.pts0[j].y)
  return {
    floor: house.floor,
    ceilings: [...new Set(house.ceilings.map((c) => c.kind))].sort().join('+') || '-',
    columns: [...new Set(house.columns.map((c) => c.shape))].sort().join('+') || '-',
    bend: mean((w) => Math.max(...w.pts1.map((p) => off(p, w.pts0[0], w.pts0[w.pts0.length - 1])))),
    ends: mean((w) => end(w, 0, w.pts0.length - 1)),
    tops: mean((w) => Math.max(...tops(w)) - Math.min(...tops(w))),
    folds: mean((w) => (turn(w) > 0.35 ? 1 : 0)),
  }
}
const shapes = {}

let pass = 0
let fail = 0
const check = (ok, what) => (ok ? pass++ : (fail++, console.log('  FAIL', what)))
const strengths = {}

for (const stage of [0, 1, 2]) {
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game({ stage, seed })
    for (let i = 0; i < 30; i++) g.update(1 / 60, {})
    if (!g.debugDream()) continue
    const plan = g.dreamPlan()
    for (const a of Object.values(ARCHITECTS)) {
      const d = dreamHouse(plan, a)
      const what = `stage ${stage} seed ${seed} ${a.id}`
      check(!!d, `${what}: no dream house`)
      if (!d) continue
      strengths[a.id] = [...(strengths[a.id] ?? []), d.strength]
      // the start is clear of every solid
      const p = { x: d.start.x, y: d.start.y, vx: 0, vy: 0, r: PLAYER_RADIUS, contactUntil: {} }
      check(!collide(p, solidsOf(d.house)), `${what}: starts inside a wall`)
      check(d.house.walls.every((w) => w.pts0.length === w.pts1.length), `${what}: a wall changes its vertex count`)
      check(d.reachable, `${what}: the anchor is out of reach`)
      check(walkToAnchor(d), `${what}: a player walking there never steps on the anchor`)
      // everything built is something the 3D world can draw
      const bad = [
        ...d.house.walls.filter((w) => !CAN.mat.has(w.mat)).map((w) => `material ${w.mat}`),
        ...d.house.columns.filter((c) => !CAN.shape.has(c.shape) || !CAN.mat.has(c.mat)).map((c) => `column ${c.shape}/${c.mat}`),
        ...d.house.ceilings.filter((c) => !CAN.ceiling.has(c.kind) || !CAN.mat.has(c.mat)).map((c) => `ceiling ${c.kind}/${c.mat}`),
        ...(CAN.floor.has(d.house.floor) ? [] : [`floor ${d.house.floor}`]),
      ]
      check(!bad.length, `${what}: world.js cannot draw ${bad[0]}`)
      // he declares the architect he is
      check(a.declaration === `I AM ${a.name.replace(/^ANTONI |^LUDWIG /, '')}.`, `${a.id}: the declaration does not name him`)
      ;(shapes[a.id] ??= []).push(shapeOf(a.build(plan, 1, [])))
    }
    // the way back: finding the anchor settles the dream in the plan
    g.anchorFound()
    check(g.dream?.phase === 'settling', `stage ${stage} seed ${seed}: anchorFound does not settle the dream`)
    for (let i = 0; i < 60 * 30 && g.dream; i++) g.update(1 / 60, {})
    check(!g.dream, `stage ${stage} seed ${seed}: the dream never ends`)
  }
}
// each architect's own spatial language: no two alike in their floor, and in at least two of
// their ceiling, their columns, and how their partitions bend, move, rise and fold
const avg = (list, k) => list.reduce((s, x) => s + x[k], 0) / list.length
const sig = Object.fromEntries(
  Object.entries(shapes).map(([id, l]) => [id, { floor: l[0].floor, ceilings: l[0].ceilings, columns: l[0].columns, bend: avg(l, 'bend'), ends: avg(l, 'ends'), tops: avg(l, 'tops'), folds: avg(l, 'folds') }]),
)
console.log('  architect   floor       ceiling   columns          bend  ends  tops  folds')
for (const [id, g] of Object.entries(sig)) console.log(`  ${id.padEnd(11)} ${g.floor.padEnd(11)} ${g.ceilings.padEnd(9)} ${g.columns.padEnd(16)} ${[g.bend, g.ends, g.tops, g.folds].map((v) => v.toFixed(2)).join('  ')}`)
const ids = Object.keys(sig)
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const [a, b] = [sig[ids[i]], sig[ids[j]]]
    const differ = ['ceilings', 'columns'].filter((k) => a[k] !== b[k]).length + ['bend', 'ends', 'tops', 'folds'].filter((k) => Math.abs(a[k] - b[k]) > 0.08).length
    check(a.floor !== b.floor && differ >= 2, `${ids[i]} and ${ids[j]} rebuild the plan alike`)
  }
}
for (const [id, s] of Object.entries(strengths)) console.log(`  ${id}: ${s.length} dreams, strength ${s.filter((x) => x === 1).length} full · ${s.filter((x) => x < 1).length} gentler`)
console.log(`\n${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
