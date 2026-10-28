// Headless tests for The House Outlives Its Creator:   npm run test:house
//
//  0. ARCHITECTURE: every posture × organisation of rooms is a valid plan: rooms wide enough,
//     shared walls once, no crossing walls, no loose wall ends, doors and windows only inside walls,
//     every room reachable through doors; and it stays valid in every frame of a transformation
//  1. the authored houses: the door reachable from the start in most postures
//  2. PLAYER PHYSICS: walls never move when the ball hits or presses them; the ball never
//     passes through a wall or leaves the house
//  3. THE CHAIN: collision → cell → region → his state → decision → transformation → completed;
//     walls move only while a commanded transformation runs
//  4. his responses: stillness, a twitch for a small knock, adjustments, rolling over after
//     repeated knocks in one place, a larger change after a strong one; not the same every time
//  5. the transformation: smooth (no jumps), local before global, never through the ball
//  6. wind: a real force (the ball is blown; it can still be fought), windows move with their
//     panels and change the air; sunlight slippery; wind and sun never change
//  7. many posture changes never trap the player
//  8. a bot plays all three stages by tilt alone, through both endings

import { LAYOUTS } from '../src/house/world/layouts.js'
import { House, wallEnds, segmentsCross } from '../src/house/world/house.js'
import { CONFIGS } from '../src/house/world/layouts.js'
import { MIN_BAY, comparePlans } from '../src/house/world/plan.js'
import { classify } from '../src/house/voice/classify.js'
import { parseInstruction } from '../src/house/voice/objects.js'
import { embodimentCandidates } from '../src/house/body/embody.js'
import { measure } from '../src/house/agent/suggestion.js'
import { angleDelta } from '../src/sleeping/entity/skeleton.js'
import { Body, POSES, distToSegment } from '../src/house/body/body.js'
import { Game } from '../src/house/game/game.js'
import { HouseAgent } from '../src/house/agent/agent.js'
import { stepPlayer, createPlayer, overlapping, PLAYER_RADIUS, AIR_PUSH } from '../src/house/world/physics.js'
import { createRng } from '../src/sleeping/sim/rng.js'

let failures = 0
let checks = 0
function check(ok, label) {
  checks++
  if (ok && process.env.VERBOSE) console.log(`  ok    ${label}`)
  if (!ok) {
    failures++
    console.log(`  FAIL  ${label}`)
  }
  return ok
}
const section = (s) => console.log(`\n${s}`)
const run = (g, sec, input = {}, onEvent) => {
  for (let i = 0; i < sec * 60; i++) {
    g.update(1 / 60, typeof input === 'function' ? input(g) : input)
    for (const e of g.drain()) onEvent?.(e)
  }
}
const idle = (g, max = 20) => {
  for (let i = 0; i < max * 60 && (g.tx.state !== 'IDLE' || g.carry); i++) g.update(1 / 60, {})
  g.drain()
}
const snapshotWalls = (g) => g.house.walls.map((w) => `${w.x.toFixed(4)},${w.y.toFixed(4)},${w.a.toFixed(4)}`).join('|')

// ---------- 0 ----------
section('0. Architecture: valid plans, not random walls')
const near = (p, q, e = 0.012) => Math.hypot(p.x - q.x, p.y - q.y) < e
// the problems in one set of wall pieces and their openings
function audit({ pieces, exits, doorways }, { growing = false } = {}) {
  const bad = []
  const ends = pieces.flatMap((p) => [p.a, p.b])
  const jambs = [...exits, ...doorways].flatMap((o) => [o.a, o.b])
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    for (let j = i + 1; j < pieces.length; j++) {
      const q = pieces[j]
      if (segmentsCross(p.a, p.b, q.a, q.b)) bad.push(`${p.key} crosses ${q.key}`)
      // the same wall twice: collinear and overlapping
      const c1 = (q.a.x - p.a.x) * (p.b.y - p.a.y) - (q.a.y - p.a.y) * (p.b.x - p.a.x)
      const c2 = (q.b.x - p.a.x) * (p.b.y - p.a.y) - (q.b.y - p.a.y) * (p.b.x - p.a.x)
      if (Math.abs(c1) < 1e-6 && Math.abs(c2) < 1e-6) {
        const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)
        const t = (r) => ((r.x - p.a.x) * (p.b.x - p.a.x) + (r.y - p.a.y) * (p.b.y - p.a.y)) / L
        if (Math.min(L, Math.max(t(q.a), t(q.b))) - Math.max(0, Math.min(t(q.a), t(q.b))) > 0.02) bad.push(`${p.key} doubles ${q.key}`)
      }
    }
    // every end meets another wall (a junction) or is the jamb of an opening
    // (while walls grow and retract, their free ends are allowed)
    if (!growing) {
      for (const e of [p.a, p.b]) {
        const meets = ends.filter((x) => near(x, e)).length > 1 || jambs.some((x) => near(x, e)) || pieces.some((q) => q !== p && distToSegment(e, q.a, q.b) < 0.012)
        if (!meets) bad.push(`${p.key} ends in the open`)
      }
    }
    if (p.kind === 'glass' && !p.rooms.includes(null)) bad.push(`window ${p.key} not in an exterior wall`)
  }
  // every opening lies inside a wall: the wall continues on both sides of it
  if (!growing) {
    for (const o of [...exits, ...doorways]) {
      const sides = [o.a, o.b].filter((e) => pieces.some((q) => near(q.a, e) || near(q.b, e))).length
      if (sides < 2) bad.push(`opening ${o.id} is not inside a wall`)
    }
  }
  return bad
}
{
  let plans = 0
  const problems = []
  for (const [id, L] of Object.entries(LAYOUTS)) {
    const house = new House(L, Body.framesOf(L.body.pose, L.body))
    for (const configId of L.configs) {
      for (const pose of Object.keys(POSES)) {
        const plan = house.planFor(Body.framesOf(pose, L.body), configId)
        plans++
        const bad = [...house.validatePlan(plan).problems, ...audit(house.geometryFor(plan))]
        if (bad.length) problems.push(`${id}/${configId}/${pose}: ${bad[0]}`)
      }
    }
  }
  check(problems.length === 0, `all ${plans} plans (3 levels × ${LAYOUTS.origin.configs.length} organisations × ${Object.keys(POSES).length} postures) are valid architecture${problems.length ? `: ${problems.slice(0, 3).join('; ')}` : ''}`)
  // the organisations: 12 rooms with stable ids, each one connected space
  for (const [cid, spec] of Object.entries(CONFIGS)) {
    const letters = new Set(spec.map.join('').split('').filter((c) => c !== '.'))
    let split = 0
    for (const r of letters) {
      const cells = []
      spec.map.forEach((row, j) => [...row].forEach((c, i) => c === r && cells.push([i, j])))
      const seen = new Set([cells[0].join()])
      const q = [cells[0]]
      while (q.length) {
        const [i, j] = q.shift()
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${i + di},${j + dj}`
          if (!seen.has(k) && spec.map[j + dj]?.[i + di] === r) {
            seen.add(k)
            q.push([i + di, j + dj])
          }
        }
      }
      if (seen.size !== cells.length) split++
    }
    check(split === 0 && letters.size === 12, `${cid}: 12 rooms, each one connected space (${split} split)`)
  }
  const g = new Game({ stage: 0, seed: 1 })
  check(new Set(g.house.walls.map((w) => w.id)).size === g.house.walls.length, `every wall has its own id (${g.house.walls.length} wall pieces)`)
  const segs = g.house.segments().filter((s) => s.kind !== 'door' && s.kind !== 'rule')
  check(segs.length === g.house.pieces.length && segs.every((s, i) => near(s.a, g.house.pieces[i].a) && near(s.b, g.house.pieces[i].b)), 'what is drawn and what the ball collides with are the same pieces')
}
{
  // through every frame of a reorganisation the plan stays valid: no crossing or doubled walls,
  // lines in order, no room narrower than a bay; every wall stays on its grid line
  let frames = 0
  const bad = []
  let onLine = 0
  let pieces = 0
  for (const [seed, pose, cfg] of [[1, 'curled~', 'courtSouth'], [2, 'side', 'spineEast'], [3, 'stretched', 'origin'], [4, 'kneesUp', 'courtSouth']]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    g.agent.decide = () => ({ type: 'hold', goal: 'PRESERVE_STABILITY' })
    if (cfg === 'origin') {
      g.repose('side~', { major: true, configId: 'spineEast' })
      idle(g)
    }
    g.repose(pose, { major: true, configId: cfg })
    for (let i = 0; i < 60 * 12 && g.tx.state !== 'IDLE'; i++) {
      g.update(1 / 60, {})
      g.drain()
      frames++
      const h = g.house
      for (let k = 0; k < h.X.length - 1; k++) if (h.X[k + 1] - h.X[k] < MIN_BAY - 1e-6) bad.push('a column too narrow')
      for (let k = 0; k < h.Y.length - 1; k++) if (h.Y[k + 1] - h.Y[k] < MIN_BAY - 1e-6) bad.push('a row too narrow')
      bad.push(...audit({ pieces: h.pieces, exits: h.doors, doorways: h.doorways }, { growing: h.transforming }))
      for (const p of h.pieces) {
        pieces++
        if (h.X.some((x) => Math.abs(p.a.x - x) < 1e-9 && Math.abs(p.b.x - x) < 1e-9) || h.Y.some((y) => Math.abs(p.a.y - y) < 1e-9 && Math.abs(p.b.y - y) < 1e-9)) onLine++
      }
    }
    check(g.house.configId === cfg && g.house.validatePlan({ X: g.house.X, Y: g.house.Y, configId: cfg }).ok, `[${pose} → ${cfg}] the rooms reorganised and came to rest as a valid plan`)
  }
  check(bad.length === 0, `valid in all ${frames} frames of four reorganisations${bad.length ? `: ${[...new Set(bad)].slice(0, 3).join('; ')}` : ''}`)
  check(onLine === pieces, `walls on a line move together: every wall stayed on its grid line (${onLine}/${pieces})`)
}

// ---------- 1 ----------
section('1. Houses and postures')
for (const [id, L] of Object.entries(LAYOUTS)) {
  const house = new House(L, Body.framesOf(L.body.pose, L.body))
  const start = { x: L.start[0], y: L.start[1] }
  let ok = 0
  let n = 0
  for (const configId of L.configs) {
    for (const pose of Object.keys(POSES)) {
      const plan = house.planFor(Body.framesOf(pose, L.body), configId)
      const dist = house.distances(house.rasterise(plan, { doorsShut: false }), start)
      n++
      if (house.geometryFor(plan).exits.some((d) => d.id !== 'sealed' && house.routeTo(dist, d) >= 0)) ok++
    }
  }
  const occ0 = house.rasterise(null, { doorsShut: false })
  const kinds = house.walls.reduce((m, w) => ((m[w.kind] = (m[w.kind] ?? 0) + 1), m), {})
  check(house.freeAt(occ0, start), `${id}: the start is free`)
  check(house.doors.some((d) => d.id !== 'sealed' && house.routeTo(house.distances(occ0, start), d) >= 0), `${id}: a door is reachable from the start`)
  check(ok >= n * 0.6, `${id}: a door is reachable from the start in ${ok}/${n} plans`)
  check(kinds.glass === 9 && house.walls.filter((w) => w.kind === 'glass').every((w) => w.rooms.includes(null)), `${id}: 9 windows, all in the exterior wall`)
  console.log(`  ${id}: ${JSON.stringify(kinds)} wall pieces, door reachable in ${ok}/${n} plans`)
}

// ---------- 2 ----------
section('2. Player physics: walls stay put')
{
  // he will not decide anything: this is only about the ball and the walls
  const g = new Game({ stage: 0, seed: 3 })
  g.agent.decide = () => ({ type: 'hold', goal: 'PRESERVE_STABILITY' }) // his mind is switched off here
  const before = snapshotWalls(g)
  const rng = createRng(9)
  let tilt = { x: 0, y: 0 }
  let inside = 0
  let outside = 0
  let bumps = 0
  for (let i = 0; i < 60 * 90; i++) {
    if (i % 40 === 0) tilt = { x: rng.range(-1, 1), y: rng.range(-1, 1) }
    g.update(1 / 60, { tilt })
    bumps += g.drain().filter((e) => e.type === 'collision').length
    const p = g.player
    for (const s of g.house.segments()) if (distToSegment(p, s.a, s.b) < PLAYER_RADIUS + s.r - 0.03) inside++
    if (!g.house.inside(p.x, p.y)) outside++
  }
  check(bumps > 30, `the ball hit walls (${bumps} collisions)`)
  check(snapshotWalls(g) === before, 'not one wall moved, however often it was hit')
  check(inside === 0, `the ball never overlapped a wall (${inside} frames)`)
  check(outside === 0, `never left the house (${outside})`)
  // pressing steadily into a wall
  const g2 = new Game({ stage: 0, seed: 4 })
  g2.agent.decide = () => ({ type: 'hold', goal: 'PRESERVE_STABILITY' })
  const b2 = snapshotWalls(g2)
  run(g2, 6, { tilt: { x: -1, y: 0 } })
  check(snapshotWalls(g2) === b2, 'a ball pressed against a wall for 6 s does not push it')
  console.log(`  90 s of random tilt: ${bumps} collisions, walls unchanged`)
}

// ---------- 3 ----------
section('3. The chain: collision → region → decision → transformation')
{
  const g = new Game({ stage: 1, seed: 11 })
  g.agent.idleWish = () => false
  let moved = 0
  let movedOutside = 0
  let prev = snapshotWalls(g)
  const order = []
  for (let k = 0; k < 6; k++) {
    g.debugCollision()
    for (let i = 0; i < 60 * 3; i++) {
      g.update(1 / 60, {})
      for (const e of g.drain()) if (['collision', 'decision', 'transform', 'twitch', 'settled'].includes(e.type)) order.push(e.type)

      const now = snapshotWalls(g)
      if (now !== prev) {
        moved++
        if (g.tx.state !== 'TRANSFORMING' && g.tx.state !== 'SETTLING') movedOutside++
      }
      prev = now
    }
  }
  idle(g)
  const states = g.txHistory
  const c = g.chain
  check(!!c.collision && !!c.cell && !!c.region, `a collision reached a cell and a body region (${c.cell}, ${c.region})`)
  check(!!c.decision, `his mind decided (${c.decision?.action})`)
  check(!!c.requested && c.requested.walls > 0, `a transformation was requested (${c.requested?.label}, ${c.requested?.walls} walls)`)
  check(!!c.completed, 'and completed')
  for (const s of ['DISTURBED', 'DECIDING', 'TRANSFORMING', 'SETTLING', 'IDLE']) check(states.includes(s), `the controller passed through ${s}`)
  const firstDecision = order.indexOf('decision')
  check(order[0] === 'collision' && firstDecision > 0 && order.indexOf('settled') > firstDecision, `the order of events: ${order.slice(0, 5).join(' → ')}`)
  check(moved > 0 && movedOutside === 0, `walls moved only during commanded transformations (${moved} frames moving, ${movedOutside} outside)`)
}

// ---------- 4 ----------
section('4. His responses')
{
  const g = new Game({ stage: 0, seed: 21 })
  let changes = 0
  run(g, 30, {}, (e) => (e.type === 'transform' || e.type === 'twitch') && !e.idle && changes++)
  check(changes <= 2, `undisturbed for 30 s, he keeps (almost) still: ${changes} small independent adjustments`)
}
{
  // a single light knock: a twitch, or stillness; never a whole new posture
  const kinds = []
  for (const seed of [31, 32, 33, 34, 35]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    g.knock({ x: g.player.x, y: g.player.y - 0.4, speed: 1.2, kind: 'interior' })
    run(g, 2, {}, (e) => e.type === 'decision' && kinds.push(e.goal))
  }
  check(kinds.length === 5 && kinds.every((k) => k === 'INVESTIGATE' || k === 'PRESERVE_STABILITY'), `a light knock: ${kinds.join(', ')}`)
}
{
  // repeated knocks in one place: the responses escalate to rolling over
  let rolled = 0
  const seqs = []
  for (const seed of [41, 42, 43]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    const goals = []
    // the same part of him each time, wherever it lies now (the player may drift meanwhile)
    const region = g.body.region[Math.floor(g.player.y - 0.4) * 9 + Math.floor(g.player.x)]
    const spot = () => {
      for (let j = 0; j < 13; j++) for (let i = 0; i < 9; i++) if (g.body.region[j * 9 + i] === region && g.body.weight[j * 9 + i] > 0.3) return { x: i + 0.5, y: j + 0.5 }
      return { x: g.player.x, y: g.player.y - 0.4 }
    }
    for (let k = 0; k < 8 && !goals.includes('RECONFIGURE'); k++) {
      g.knock({ ...spot(), speed: 2.6, kind: 'interior' })
      run(g, 1.2, {}, (e) => e.type === 'decision' && goals.push(e.goal))
      idle(g)
    }
    seqs.push(goals.map((x) => x.slice(0, 5)).join('>'))
    if (goals.includes('RECONFIGURE')) rolled++
  }
  check(rolled >= 2, `repeated knocks in one place led him to roll over (${rolled}/3: ${seqs.join(' | ')})`)
}
{
  // one strong blow: a larger change
  let big = 0
  for (const seed of [51, 52, 53]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    g.knock({ x: g.player.x, y: g.player.y - 0.4, speed: 4.2, kind: 'interior' })
    g.knock({ x: g.player.x, y: g.player.y - 0.4, speed: 4.2, kind: 'interior' })
    run(g, 1.5, {}, (e) => e.type === 'decision' && (e.goal === 'RECONFIGURE' || e.goal === 'ADAPT') && big++)
  }
  check(big >= 2, `strong blows led to a posture change (${big}/3)`)
}
{
  // he does not answer the same way every time
  const g = new Game({ stage: 1, seed: 61 })
  g.agent.idleWish = () => false
  const actions = []
  for (let k = 0; k < 6; k++) {
    g.knock({ x: g.player.x, y: g.player.y - 0.4, speed: 2.4, kind: 'interior' })
    run(g, 1, {}, (e) => e.type === 'decision' && actions.push(e.action))
    idle(g)
  }
  const distinct = new Set(actions).size
  check(distinct >= 3, `varied responses: ${distinct} different among ${actions.length} (${actions.join('; ')})`)
}
{
  // learning: a family that keeps failing loses utility
  const A = new HouseAgent({ rng: createRng(1).next })
  const B = new HouseAgent({ rng: createRng(1).next })
  for (let i = 0; i < 6; i++) B.memory.learn('RECONFIGURE', 'repose', false)
  for (const x of [A, B]) {
    Object.assign(x.s, { arousal: 0.9, irritation: 0.6, structuralStability: 0.2 })
    x.lastEvent = { region: 'feet', amount: 0.4, reps: 4, t: 0 }
  }
  const g = new Game({ stage: 1, seed: 5 })
  const w = g.world()
  check(B.evaluate(w).RECONFIGURE < A.evaluate(w).RECONFIGURE - 0.2, 'failed strategies lose utility')
}
{
  // habits: a passage used again and again is closed by a posture, with no collision
  const g = new Game({ stage: 1, seed: 22 })
  g.agent.temper.adaptBias = 0.9
  let blocked = null
  for (let i = 0; i < 60 * 50 && !blocked; i++) {
    const at = i > 60 * 20 ? { x: 4.0, y: 11.3 } : Math.floor(i / 50) % 2 ? { x: 1.6, y: 9.0 } : { x: 1.6, y: 8.0 }
    Object.assign(g.player, { x: at.x, y: at.y, vx: 0, vy: 0 })
    g.update(1 / 60, {})
    for (const e of g.drain()) if (e.type === 'transform' && e.action === 'block') blocked = e
    if (i === 60 * 21) g.debugEvaluate()
  }
  check(!!blocked, `he closed the passage the player kept using (${blocked?.label ?? 'no'})`)
}

// ---------- 5 ----------
section('5. The transformation')
{
  let maxJump = 0
  let through = 0
  let localOk = 0
  for (const [seed, pose] of [[1, 'curled~'], [2, 'side'], [3, 'armOverHead'], [4, 'stretched~']]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    const prev = new Map(g.house.walls.map((w) => [w.id, { x: w.x, y: w.y }]))
    g.repose(pose, { major: true })
    for (let i = 0; i < 60 * 12 && g.tx.state !== 'IDLE'; i++) {
      g.update(1 / 60, {})
      g.drain()
      for (const w of g.house.walls) {
        const p = prev.get(w.id)
        if (p) maxJump = Math.max(maxJump, Math.hypot(w.x - p.x, w.y - p.y))
        prev.set(w.id, { x: w.x, y: w.y })
        if (!w.lifted && w.kind !== 'shell' && distToSegment(g.player, ...Object.values(wallEnds(w))) < PLAYER_RADIUS + w.thick / 2 - 0.03) through++
      }
    }
    check(g.tx.state === 'IDLE', `[${pose}] it completed`)
    // a small adjustment moves few walls
    const g2 = new Game({ stage: 1, seed })
    const s = g2.house.begin(g2.house.planFor(Body.framesOf('legOut', g2.body.place)), { duration: 3 })
    g2.house.transform = null
    const s2 = g2.house.begin(g2.house.planFor(Body.framesOf(pose, g2.body.place)), { duration: 3 })
    if (s.lines < s2.lines) localOk++
  }
  check(maxJump < 0.06, `walls glide: the largest step in one frame was ${maxJump.toFixed(3)} cells`)
  check(through === 0, `no solid wall passed through the ball (${through})`)
  check(localOk >= 3, `a single limb moves fewer grid lines than a whole new posture (${localOk}/4)`)
  // a twitch shifts only the grid lines bound to that part of him, and brings them back
  const g = new Game({ stage: 1, seed: 7 })
  g.agent.idleWish = () => false
  const before = snapshotWalls(g)
  const X0 = g.house.X.slice()
  const Y0 = g.house.Y.slice()
  g.twitch('rightArm')
  const tr = g.house.transform
  const moved = tr ? [...tr.toX.map((x, i) => Math.abs(x - X0[i])), ...tr.toY.map((y, j) => Math.abs(y - Y0[j]))].filter((d) => d > 0.03).length : 0
  idle(g)
  check(moved > 0 && moved <= 6 && tr.A === tr.B, `a twitch shifted only ${moved} of 12 inner grid lines; the rooms kept their organisation`)
  check(snapshotWalls(g) === before, 'and returned them to their places')
}

// ---------- 6 ----------
section('6. Wind and sun')
{
  const g = new Game({ stage: 0, seed: 9 })
  let best = null
  for (let y = 1; y < 12; y += 0.25) {
    for (let x = 0.8; x < 8.2; x += 0.25) {
      if (!g.house.inside(x, y) || !g.house.freeAt(g.occNow, { x, y })) continue
      const v = g.env.airAt(x, y)
      const m = Math.hypot(v.x, v.y)
      if (!best || m > best.m) best = { x, y, v, m }
    }
  }
  const force = Math.min(8, best.m * AIR_PUSH)
  check(force > 4, `the strongest draught pushes at ${force.toFixed(1)} cells/s² (tilt gives 11)`)
  // with no tilt, the ball is blown
  const p = createPlayer(0, 0)
  Object.assign(p, { x: best.x, y: best.y })
  for (let i = 0; i < 60; i++) stepPlayer(p, { x: 0, y: 0 }, 1 / 60, g.house.segments(), { air: g.env.airAt(p.x, p.y) })
  const blown = Math.hypot(p.x - best.x, p.y - best.y)
  check(blown > 0.4, `untilted, the ball was blown ${blown.toFixed(2)} cells in one second`)
  // full tilt against it still makes way
  const q = createPlayer(0, 0)
  Object.assign(q, { x: best.x, y: best.y })
  const u = { x: -best.v.x / best.m, y: -best.v.y / best.m }
  for (let i = 0; i < 30; i++) stepPlayer(q, u, 1 / 60, [], { air: best.v })
  check((q.x - best.x) * u.x + (q.y - best.y) * u.y > 0.05, 'tilting hard against it still makes way')
  const slide = (light) => {
    const r = createPlayer(0, 0)
    r.vx = 2
    for (let i = 0; i < 120; i++) stepPlayer(r, { x: 0, y: 0 }, 1 / 60, [], { light })
    return r.x
  }
  check(slide(1) > slide(0) * 1.3, 'sunlit floor is slippery')
}
{
  const g = new Game({ stage: 1, seed: 8 })
  g.agent.idleWish = () => false
  const wind0 = JSON.stringify(g.env.wind)
  const sun0 = JSON.stringify(g.env.sun)
  const winPos0 = g.house.windows().map((w) => `${w.x.toFixed(2)},${w.y.toFixed(2)},${w.outside.x.toFixed(2)}`).join()
  const inflow0 = g.env.windows.map((w) => (w.inflow ?? 0).toFixed(2)).join()
  let windowsMoved = 0
  let inflowChanged = 0
  let lightChanged = 0
  const light0 = g.env.light.slice()
  for (const pose of ['curled~', 'side', 'stretched~', 'armOverHead']) {
    g.repose(pose, { major: true })
    idle(g)
    if (g.house.windows().map((w) => `${w.x.toFixed(2)},${w.y.toFixed(2)},${w.outside.x.toFixed(2)}`).join() !== winPos0) windowsMoved++
    if (g.env.windows.map((w) => (w.inflow ?? 0).toFixed(2)).join() !== inflow0) inflowChanged++
    let dl = 0
    for (let i = 0; i < light0.length; i++) dl += Math.abs(g.env.light[i] - light0[i])
    if (dl > 1) lightChanged++
  }
  check(JSON.stringify(g.env.wind) === wind0 && JSON.stringify(g.env.sun) === sun0, 'the wind and the sun never changed')
  check(windowsMoved >= 3, `windows moved with their walls (${windowsMoved}/4)`)
  check(inflowChanged >= 2, `which changed how much wind enters (${inflowChanged}/4)`)
  check(lightChanged >= 2, `and where the light falls (${lightChanged}/4)`)
}

// ---------- 7 ----------
section('7. Many posture changes never trap the player')
{
  let bad = 0
  let n = 0
  for (const seed of [11, 12, 13]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    const rng = createRng(seed)
    for (let k = 0; k < 6; k++) {
      const occ = g.house.rasterise(null, { doorsShut: false })
      for (let t = 0; t < 80; t++) {
        const x = 1 + rng.next() * 7
        const y = 1.5 + rng.next() * 10
        const reach = g.house.distances(occ, { x, y })
        if (g.house.inside(x, y) && g.house.freeAt(occ, { x, y }) && g.house.doors.some((d) => g.house.routeTo(reach, d) >= 0)) {
          Object.assign(g.player, { x, y, vx: 0, vy: 0 })
          break
        }
      }
      g.refreshCache()
      g.debugTransform()
      run(g, 0.4)
      idle(g)
      n++
      g.refreshCache()
      if (!g.house.doors.some((d) => g.house.routeTo(g.distNow, d) >= 0)) bad++
    }
  }
  check(bad === 0, `after ${n} posture changes a door was always reachable (${bad} bad)`)
}

// ---------- 7b ----------
section('7b. The player is carried through transformations, never reset')
{
  let jumps = 0
  let squeezed = 0
  let atStart = 0
  let maxV = 0
  let carried = 0
  let closer = 0
  let further = 0
  let n = 0
  for (const seed of [71, 72, 73, 74]) {
    const g = new Game({ stage: 1, seed })
    g.agent.idleWish = () => false
    const rng = createRng(seed)
    // walk away from the start first
    run(g, 2.5, { tilt: { x: rng.range(-1, 1), y: -1 } })
    for (let k = 0; k < 5; k++) {
      g.refreshCache()
      const route0 = Math.min(...g.house.doors.map((d) => g.house.routeTo(g.distNow, d)).filter((r) => r >= 0))
      const still = k % 2 === 0 // standing still, or rolling while he changes
      const tilt = still ? { x: 0, y: 0 } : { x: rng.range(-0.6, 0.6), y: rng.range(-0.6, 0.6) }
      if (still) Object.assign(g.player, { vx: 0, vy: 0 })
      const p0 = { x: g.player.x, y: g.player.y }
      g.debugTransform()
      let prev = { ...p0 }
      let over = 0
      for (let i = 0; i < 60 * 12 && (g.tx.state !== 'IDLE' || i < 30); i++) {
        g.update(1 / 60, { tilt })
        g.drain()
        const p = g.player
        if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.2 && !g.carry) {
          jumps++
          console.log(`    jump: seed ${seed} change ${k} ${prev.x.toFixed(2)},${prev.y.toFixed(2)} → ${p.x.toFixed(2)},${p.y.toFixed(2)} (${g.tx.state}, ${g.chain.requested?.label})`)
        }
        if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < 0.05 && Math.hypot(p0.x - g.start.x, p0.y - g.start.y) > 0.5) atStart++
        // trapped: overlapping a wall for more than a quarter of a second
        over = overlapping(p, g.house.segments(), 0.04) ? over + 1 : 0
        if (over === 16) squeezed++
        maxV = Math.max(maxV, Math.hypot(p.vx, p.vy))
        prev = { x: p.x, y: p.y }
      }
      n++
      if (still && Math.hypot(g.player.x - p0.x, g.player.y - p0.y) > 0.05) carried++
      g.refreshCache()
      const route1 = Math.min(...g.house.doors.map((d) => g.house.routeTo(g.distNow, d)).filter((r) => r >= 0))
      if (still && route1 < route0 - 0.25) closer++
      if (still && route1 > route0 + 0.25) further++
    }
  }
  check(atStart === 0, `after ${n} transformations the player never went back to the start`)
  check(jumps === 0, `its movement stayed continuous (${jumps} jumps)`)
  check(squeezed === 0, `never trapped inside a wall (${squeezed} times; a closing wall pushes it out within a few frames)`)
  check(maxV <= 4.2 + 1e-6, `its speed never ran away (max ${maxV.toFixed(2)} cells/s)`)
  check(carried >= 5, `standing still, it was carried by the moving room (${carried}/${Math.ceil(n / 2) + 2})`)
  check(closer > 0 && further > 0, `the moving house brought the way out closer (${closer}) and pushed it further (${further})`)
}

// ---------- 7c ----------
section('7c. Hypnotic instructions: he interprets, he does not obey')
{
  // the local classifier: words and phrases → concepts (several at once), nothing about melody
  const expect = [
    ['You are a lamp stand.', 'UPRIGHT'],
    ['You are a boat drifting sideways.', 'LATERAL_MOVEMENT'],
    ['You are a tree stretching towards the sky.', 'ELONGATED'],
    ['You are a stone resting at the bottom of the sea.', 'STILLNESS'],
    ['You are becoming smaller.', 'CONTRACTION'],
    ['You are slowly turning onto your side.', 'ROLLING'],
    ['You are stretching your arms.', 'EXTENSION'],
    ['You are curling into yourself.', 'FLEXION'],
    ['You are becoming perfectly still.', 'STILLNESS'],
    ["Don't move.", 'STILLNESS'],
    ['banana telephone', 'UNKNOWN'],
  ]
  const wrong = expect.filter(([t, c]) => classify(t).top[0] !== c)
  check(wrong.length === 0, `the classifier reads ${expect.length - wrong.length}/${expect.length} instructions as expected${wrong.length ? `: ${wrong.map(([t]) => t).join('; ')}` : ''}`)
  const both = classify('You are a boat slowly turning sideways').concepts
  check(both.LATERAL_MOVEMENT > 0 && both.ROLLING > 0, 'one instruction can carry several concepts (a boat slowly turning sideways → lateral + rolling)')
}
const instructAndWait = (g, text, sec = 9) => {
  const r = g.instruct(text)
  let decision = null
  let hypno = []
  run(g, sec, {}, (e) => {
    if (e.type === 'decision' && !decision) decision = e
    if (e.type === 'hypno') hypno.push(e.phase)
  })
  return { r, decision, hypno, entry: g.agent.memory.instructions.at(-1) }
}
{
  // the same words, different situations → different valid responses, chosen by his planner
  const answers = new Set()
  const contexts = [
    (g) => g, // calm, as he lies at first
    (g) => (g.repose('curled', { major: true }), idle(g), g), // already curled
    (g) => (Object.assign(g.agent.s, { irritation: 0.8, arousal: 0.5 }), g), // irritated
    (g) => (g.repose('stretched~', { major: true }), idle(g), g), // stretched the other way
  ]
  let valid = 0
  let notReset = 0
  for (const [i, ctxf] of contexts.entries()) {
    const g = new Game({ stage: 1, seed: 80 + i })
    g.agent.idleWish = () => false
    g.agent.dreamWish = () => false
    g.qualify = () => {}
    // the player stands in a room away from the start (no knocks to answer first)
    const spot = g.house.nearestFree(g.house.rasterise(null, { doorsShut: false }), { x: 2.0, y: 8.6 })
    Object.assign(g.player, { x: spot.x, y: spot.y, vx: 0, vy: 0 })
    ctxf(g)
    run(g, 1)
    const before = { x: g.player.x, y: g.player.y }
    const { entry } = instructAndWait(g, 'You are curling into yourself')
    idle(g)
    answers.add(`${entry.chosen?.goal}:${entry.chosen?.pose ?? entry.chosen?.action}`)
    if (g.house.validatePlan({ X: g.house.X, Y: g.house.Y, configId: g.house.configId }).ok) valid++
    if (Math.hypot(g.player.x - g.start.x, g.player.y - g.start.y) > 0.3 || Math.hypot(before.x - g.start.x, before.y - g.start.y) < 0.3) notReset++
  }
  check(answers.size >= 3, `"You are curling into yourself" in four situations: ${answers.size} different responses (${[...answers].join(', ')})`)
  check(valid === 4, `every response left a valid plan (${valid}/4)`)
  check(notReset === 4, `the player was never sent back to the start (${notReset}/4)`)
}
{
  // repeated suggestions: he grows less receptive, then contrary; memory keeps words, not audio
  const g = new Game({ stage: 1, seed: 90 })
  g.agent.idleWish = () => false
    g.agent.dreamWish = () => false
  g.qualify = () => {}
  const seen = []
  for (let k = 0; k < 4; k++) {
    const { entry } = instructAndWait(g, 'You are a lamp stand')
    idle(g)
    seen.push(entry)
  }
  check(seen[3].receptivity < seen[0].receptivity - 0.3, `repeating "You are a lamp stand": receptivity ${seen.map((e) => e.receptivity).join(' → ')}`)
  check(new Set(seen.map((e) => `${e.chosen?.goal}:${e.chosen?.pose}`)).size >= 2, `and he did not answer the same way each time (${seen.map((e) => e.chosen?.pose ?? e.chosen?.action).join(', ')})`)
  const m = g.agent.memory.instructions[0]
  check(m && m.text && m.concepts && m.chosen && 'outcome' in m && !('audio' in m) && !('samples' in m), 'memory keeps the words, concepts, his state, his choice and its outcome; no audio')
  // a suggestion of stillness makes staying still the likely answer
  const g2 = new Game({ stage: 1, seed: 91 })
  g2.agent.dreamWish = () => false
  g2.agent.idleWish = () => false
  const { decision } = instructAndWait(g2, 'You are becoming perfectly still')
  check(decision?.goal === 'PRESERVE_STABILITY', `"You are becoming perfectly still": ${decision?.action}`)
  // the spirals: interpreting first, then reacting, then fading
  const g3 = new Game({ stage: 1, seed: 92 })
  g3.agent.dreamWish = () => false
  g3.agent.idleWish = () => false
  const { hypno } = instructAndWait(g3, 'You are a boat drifting sideways', 12)
  check(hypno[0] === 'interpreting' && hypno.includes('reacting') && hypno.includes('fading'), `the spiral states follow the decision: ${hypno.join(' → ')}`)
  // a calm instruction is not a disturbance; a shouted, forceful one counts
  check(g3.irk.count === 0, 'a calm instruction did not count as a disturbance')
  g3.instruct('MOVE NOW! WAKE UP!', { loudness: 0.9 })
  check(g3.irk.count === 1, `a forceful instruction counted (${g3.irk.count})`)
}
{
  // three significant disturbances: he moves the exit, within a valid plan, still reachable
  let moved = 0
  let ok = 0
  let vanished = 0
  for (const [stage, seed] of [[1, 95], [1, 96], [2, 97]]) {
    const g = new Game({ stage, seed })
    g.agent.idleWish = () => false
    g.agent.dreamWish = () => false
    const target = () => g.relocateTarget()
    const id = target()
    const before = g.house.doors.find((d) => d.id === id)
    for (let k = 0; k < 3; k++) {
      g.knock({ x: g.player.x, y: g.player.y - 0.3, speed: 4.4, kind: 'interior' })
      run(g, 1.8)
    }
    let relocated = false
    for (let i = 0; i < 60 * 15; i++) {
      g.update(1 / 60, {})
      for (const e of g.drain()) if (e.type === 'exitMoving') relocated = true
      if (!g.house.doors.some((d) => d.id === id)) vanished++
    }
    idle(g)
    g.refreshCache()
    const after = g.house.doors.find((d) => d.id === id)
    if (relocated && Math.hypot(after.mid.x - before.mid.x, after.mid.y - before.mid.y) > 1) moved++
    if (g.house.validatePlan({ X: g.house.X, Y: g.house.Y, configId: g.house.configId }).ok && g.house.routeTo(g.distNow, after) >= 0) ok++
  }
  check(moved === 3, `the third disturbance moved the exit to another wall (${moved}/3)`)
  check(ok === 3, `in a valid plan, the moved exit reachable from the player (${ok}/3)`)
  check(vanished === 0, 'the exit never vanished while it moved')
}

// ---------- 7d ----------
section('7d. Hypnosis: "You are a …" — he embodies the object, the walls follow')
{
  // the sentence and the object
  const cases = [['You are a lamp stand.', 'lamp stand'], ['you are about', 'boat'], ['You are a tree', 'tree'], ['YOU ARE A STONE', 'stone'], ['You are a bridge', 'bridge'], ['You are a tall thin thing', 'thing']]
  const bad = cases.filter(([t, o]) => parseInstruction(t).object !== o)
  check(bad.length === 0, `objects found in ${cases.length - bad.length}/${cases.length} sentences (incl. the recogniser's "about" for "a boat")${bad.length ? `: ${bad.map(([t]) => t).join('; ')}` : ''}`)
  const refused = ['Hello, how are you', 'You are a toaster', ''].map((t) => parseInstruction(t))
  check(refused.every((r) => !r.ok && r.error), `refused with a reason: ${refused.map((r) => r.error).join(' / ')}`)
  const lamp = parseInstruction('You are a lamp stand').attributes
  const boat = parseInstruction('You are a boat').attributes
  check(lamp.upright > 0.8 && boat.upright < 0.2 && boat.horizontal > 0.8 && lamp.horizontal < 0.2, 'a lamp stand and a boat have different attributes (upright vs horizontal)')
}
{
  // the composed postures express the objects (measured, from the same starting posture)
  const place = LAYOUTS.adapt.body
  const shape = (t) => {
    const p = parseInstruction(t)
    const id = embodimentCandidates(p.object, p.attributes, 'mandala', place).find((v) => v.intensity === 1 && !v.mirror).id
    return measure(Body.framesOf(id, place))
  }
  const m0 = measure(Body.framesOf('mandala', place))
  const lampM = shape('You are a lamp stand')
  const stoneM = shape('You are a stone')
  const boatM = shape('You are a boat')
  const starM = shape('You are a star')
  check(lampM.elong > m0.elong * 2 && lampM.apart < m0.apart, `lamp stand: elongated (${m0.elong.toFixed(1)} → ${lampM.elong.toFixed(1)}), feet together`)
  check(stoneM.size < m0.size * 0.75 && stoneM.bend > m0.bend * 1.5, `stone: compact (size ${m0.size.toFixed(1)} → ${stoneM.size.toFixed(1)}), bent (${m0.bend.toFixed(0)}° → ${stoneM.bend.toFixed(0)}°)`)
  check(Math.abs(angleDelta((m0.turn * 180) / Math.PI, (boatM.turn * 180) / Math.PI)) > 30 && boatM.elong > m0.elong * 2, 'boat: rolled onto its side and long')
  check(starM.apart > lampM.apart * 2.5 && starM.reach > m0.reach, 'star: limbs flung apart')
}
{
  // the whole chain in the game: decision by the planner, three stages, body and walls each time
  const objects = ['You are a lamp stand', 'You are a boat', 'You are a tree', 'You are a stone', 'You are a bridge']
  const g = new Game({ stage: 1, seed: 120 })
  g.agent.idleWish = () => false
    g.agent.dreamWish = () => false
  g.qualify = () => {}
  const spot = g.house.nearestFree(g.house.rasterise(null, { doorsShut: false }), { x: 2.0, y: 8.6 })
  Object.assign(g.player, { x: spot.x, y: spot.y, vx: 0, vy: 0 })
  run(g, 1)
  let threeStages = 0
  let wordsRight = 0
  let bodyAndWalls = 0
  let valid = 0
  let kept = 0
  let byAgent = 0
  const targets = []
  for (const t of objects) {
    const object = parseInstruction(t).object
    const r = g.hypnotize(t)
    const says = []
    const stages = []
    let prev = { pose: g.body.pose, lines: g.house.X.concat(g.house.Y).join() }
    run(g, 15, {}, (e) => {
      if (e.type === 'trance') says.push(e.words)
    })
    const h = g.chain.hypnosis
    if (r.ok && h.stages?.length === 3) threeStages++
    if (says.length === 3 && says.every((w) => w === `I AM ${/^[aeiou]/.test(object) ? 'AN' : 'A'} ${object.toUpperCase()}.`)) wordsRight++
    if (h.stages?.every((s) => s.walls > 0 && s.lines > 0) && g.body.pose !== prev.pose && g.house.X.concat(g.house.Y).join() !== prev.lines) bodyAndWalls++
    if (h.result?.validPlan && h.result.routeToExit != null) valid++
    if (Math.hypot(g.player.x - g.start.x, g.player.y - g.start.y) > 0.5) kept++
    if (h.decision?.goal === 'EMBODY' && h.candidates?.length >= 2) byAgent++
    targets.push(h.targetPose)
  }
  check(threeStages === 5, `5 objects, each taken in three stages (${threeStages}/5)`)
  check(wordsRight === 5, `"I AM A …" three times with the right object (${wordsRight}/5)`)
  check(bodyAndWalls === 5, `every stage moved his body and the walls (${bodyAndWalls}/5)`)
  check(valid === 5, `each ended in a valid plan with the exit reachable (${valid}/5)`)
  check(kept === 5, `the player was never sent back to the start (${kept}/5)`)
  check(byAgent === 5, `his planner chose among candidate postures each time (${byAgent}/5): ${targets.join(' · ')}`)
}
{
  // his state and memory shape the answer: calm vs irritated, and a repeated object
  const answer = (setup, texts) => {
    const g = new Game({ stage: 1, seed: 121 })
    g.agent.idleWish = () => false
    g.agent.dreamWish = () => false
    g.qualify = () => {}
    // inside the house, away from the doors (standing at a door, a reshaping house can ease the
    // player out through it, which ends the stage)
    const spot = g.house.nearestFree(g.house.rasterise(null, { doorsShut: false }), { x: 2.0, y: 8.6 })
    Object.assign(g.player, { x: spot.x, y: spot.y, vx: 0, vy: 0 })
    setup(g)
    return texts.map((t) => {
      g.hypnotize(t)
      run(g, 15)
      return g.chain.hypnosis.targetPose
    })
  }
  const calm = answer(() => {}, ['You are a boat'])[0]
  const cross = answer((g) => Object.assign(g.agent.s, { irritation: 0.7, arousal: 0.4 }), ['You are a boat'])[0]
  check(calm !== cross, `the same words, calm vs irritated: "${calm}" vs "${cross}"`)
  const again = answer(() => {}, ['You are a boat', 'You are a boat', 'You are a boat'])
  check(new Set(again).size === 3, `"You are a boat" three times: ${again.join(' → ')}`)
  const g = new Game({ stage: 1, seed: 122 })
  g.agent.dreamWish = () => false
  g.hypnotize('You are a stone')
  run(g, 15)
  const m = g.agent.memory.instructions.at(-1)
  check(m.object === 'stone' && m.chosen?.goal === 'EMBODY' && m.outcome !== undefined && !('audio' in m), 'memory: the object, his choice, its outcome; no audio')
}

// ---------- 7e ----------
section('7e. Hypnosis reorganises the floor plan substantially')
{
  const rows = []
  const chosen = new Set()
  let substantial = 0
  let validAll = 0
  let envRecomputed = 0
  for (const [i, t] of ['You are a tree', 'You are a stone', 'You are a boat', 'You are a lamp stand', 'You are a bridge'].entries()) {
    const g = new Game({ stage: 1, seed: 140 + i })
    g.agent.idleWish = () => false
    g.agent.dreamWish = () => false
    g.qualify = () => {}
    const start = { cfg: g.house.cfg, X: g.house.X.slice(), Y: g.house.Y.slice() }
    const v0 = g.env.version
    g.hypnotize(t)
    run(g, 15)
    const h = g.chain.hypnosis
    const c = comparePlans(start.cfg, start.X, start.Y, g.house.cfg, g.house.X, g.house.Y)
    chosen.add(g.house.configId)
    if (c.baysReassigned >= 0.15 && c.adjacency >= 5 && c.roomShift >= 0.5) substantial++
    if (h.result?.validPlan && h.result.routeToExit != null) validAll++
    if (g.env.version > v0) envRecomputed++
    rows.push(`${t.slice(8)} → ${g.house.cfg.label}: ${Math.round(c.baysReassigned * 100)}% bays, ${c.adjacency} adjacencies, ${Math.round(c.wallsMoved * 100)}% walls elsewhere, rooms moved ${c.roomShift}`)
  }
  for (const r of rows) console.log(`  ${r}`)
  check(substantial === 5, `each plan changed substantially from the start: ≥15 % of bays to other rooms, ≥5 changed adjacencies, rooms moved ≥0.5 cells (${substantial}/5)`)
  check(chosen.size >= 4, `different objects led to different organisations (${chosen.size} of 5: ${[...chosen].join(', ')})`)
  check(validAll === 5, `all valid, the exit reachable (${validAll}/5)`)
  check(envRecomputed === 5, `wind and light recomputed for the new geometry (${envRecomputed}/5)`)
}

// ---------- 7f ----------
section('7f. He dreams: fog, loose walls, the green ANCHOR')
{
  // he begins to dream on his own, at moments that differ (not a timer)
  const onsets = []
  for (const seed of [151, 152, 153, 154]) {
    const g = new Game({ stage: 1, seed })
    let at = null
    for (let i = 0; i < 60 * 300 && at == null; i++) {
      g.update(1 / 60, {})
      for (const e of g.drain()) if (e.type === 'dream') at = g.time
    }
    onsets.push(at)
  }
  check(onsets.every((t) => t != null) && new Set(onsets.map((t) => Math.round(t))).size === 4, `left asleep, he began to dream on his own at ${onsets.map((t) => t?.toFixed(1)).join(', ')} s`)
  // the player cannot start one: hypnosis does not, and nothing in the game's inputs does
  const g0 = new Game({ stage: 1, seed: 155 })
  g0.hypnotize('You are a tree')
  let dreamt = false
  run(g0, 12, {}, (e) => e.type === 'dream' && (dreamt = true))
  check(!dreamt, 'a hypnosis does not start a dream')
}
{
  const g = new Game({ stage: 1, seed: 160 })
  g.agent.idleWish = () => false
  run(g, 1)
  const before = { cfg: g.house.cfg, X: g.house.X.slice(), Y: g.house.Y.slice() }
  g.debugDream() // (the developer's tool, to test without waiting)
  const d = g.dream
  const ev = []
  run(g, 2.2, {}, (e) => ev.push(e.type))
  check(ev.includes('message') && d.fog > 0.3 && d.cloud > 0.5, `the warning, the fog (${d.fog.toFixed(2)}) and the dream cloud (${d.cloud.toFixed(2)})`)
  check(g.house.doors.every((x) => !x.open), 'the exits are shut while he dreams')
  const a = d.anchorPos()
  const occ = g.house.rasterise(null, { doorsShut: false })
  check(!!d.anchor && g.house.inside(a.x, a.y) && g.house.freeAt(occ, a) && g.house.distAt(g.house.distances(occ, g.player), a) >= 0, `the ANCHOR is on a free floor tile in the ${d.anchor?.room}, reachable from the player`)
  // let the dream run (the player waits), then walk to the anchor
  let loose = 0
  let maxStep = 0
  let unreachable = 0
  let anchorOff = 0
  let prev = { x: g.player.x, y: g.player.y }
  const cfgs = new Set()
  let reachedAt = null
  let endedAt = null
  for (let i = 0; i < 60 * 90 && !endedAt; i++) {
    const p = g.player
    let tilt = { x: 0, y: 0 }
    if (g.dream?.phase === 'active' && g.dream.t > 12) {
      const target = g.dream.anchorPos()
      const path = g.house.path(g.house.rasterise(null, { doorsShut: false }), p, target)
      const t = path && path.length ? path[Math.min(path.length - 1, 2)] : target
      const dx = t.x - p.x
      const dy = t.y - p.y
      const m = Math.hypot(dx, dy) || 1
      tilt = { x: (dx / m) * 0.8 - p.vx * 0.3, y: (dy / m) * 0.8 - p.vy * 0.3 }
    }
    const aBefore = g.dream?.anchorPos()
    g.update(1 / 60, { tilt })
    for (const e of g.drain()) {
      if (e.type === 'anchorReached') reachedAt = g.time
      if (e.type === 'dreamEnd') endedAt = g.time
      if (e.type === 'dreamCycle') cfgs.add(e.configId)
    }
    if (g.dream) {
      loose = Math.max(loose, g.house.walls.filter((w) => (w.float ?? 0) > 0.3).length)
      // the anchor stays on its tile: it moves only with its room's lines, never jumps
      const aNow = g.dream.anchorPos()
      if (aBefore && Math.hypot(aNow.x - aBefore.x, aNow.y - aBefore.y) > 0.1) anchorOff++
      if (i % 60 === 0 && g.dream.phase === "active" && g.dream.reachable === false) unreachable++
    }
    maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y))
    prev = { x: p.x, y: p.y }
  }
  check(loose >= 8, `walls came loose and floated (up to ${loose} at once)`)
  check(cfgs.size >= 2, `the rooms passed through ${cfgs.size} organisations during the dream (${[...cfgs].join(', ')})`)
  check(anchorOff === 0, 'the anchor stayed on its tile as the rooms moved')
  check(unreachable <= 3, `the anchor stayed reachable (${unreachable} brief checks without a way)`)
  check(maxStep < 0.2, `the player moved continuously (largest step ${maxStep.toFixed(3)} cells), never teleported`)
  check(reachedAt != null, `stepping onto the anchor ended the dream's instability (at ${reachedAt?.toFixed(1)} s)`)
  check(endedAt != null && g.house.float == null && !g.dream, `the loose walls settled, the fog cleared, the cloud faded (${endedAt ? (endedAt - reachedAt).toFixed(1) : '–'} s after)`)
  const r = g.chain.dream.result
  g.refreshCache()
  const routes = g.house.doors.map((x) => g.house.routeTo(g.distNow, x)).filter((v) => v >= 0)
  check(r?.validPlan && routes.length > 0, `the house after the dream: a valid plan, a door reachable (${r?.kept ? 'kept part of the dream' : 'returned to how it was'}: ${r?.rooms})`)
  const c = comparePlans(before.cfg, before.X, before.Y, g.house.cfg, g.house.X, g.house.Y)
  console.log(`  after the dream: ${Math.round(c.baysReassigned * 100)}% bays, ${c.adjacency} adjacencies changed from before it`)
  // and hypnosis still works afterwards
  run(g, 2)
  const h = g.hypnotize('You are a stone')
  run(g, 15)
  check(h.ok && g.chain.hypnosis?.result?.done, 'hypnosis still works after the dream')
}

// ---------- 7g ----------
section('7g. Dreams recur; the exit stays passable')
{
  // a player who rolls about, rests, and hypnotises him every minute: he still dreams, again and again
  const counts = []
  for (const seed of [11, 12]) {
    const g = new Game({ stage: 0, seed })
    g.completeStage = () => {}
    const spot = g.house.nearestFree(g.house.rasterise(null, { doorsShut: false }), { x: 2.0, y: 8.6 })
    Object.assign(g.player, { x: spot.x, y: spot.y })
    let n = 0
    let ended = 0
    for (let i = 0; i < 60 * 360; i++) {
      const t = i / 60
      const tilt = (t % 60) < 20 && !g.dream ? { x: Math.sin(t * 0.9) * 0.7, y: Math.cos(t * 0.6) * 0.7 } : { x: 0, y: 0 }
      if (Math.abs((t % 60) - 30) < 1 / 120) g.hypnotize('You are a stone')
      g.update(1 / 60, { tilt })
      for (const e of g.drain()) {
        if (e.type === 'dream') n++
        if (e.type === 'dreamEnd') ended++
      }
      if (g.dream?.phase === 'active' && g.dream.t > 6) {
        const a = g.dream.anchorPos()
        g.player.x += (a.x - g.player.x) * 0.02
        g.player.y += (a.y - g.player.y) * 0.02
      }
    }
    counts.push(`${n} dreams, ${ended} completed`)
    check(n >= 2 && ended >= 2, `seed ${seed}: six minutes of play with hypnoses — ${n} dreams began on their own, ${ended} completed through the anchor`)
  }
}
const walkOut = (g, sec = 60) => {
  for (let i = 0; i < sec * 60 && g.status === 'playing'; i++) {
    const d = g.exitDoors().find((x) => x.open && g.house.routeTo(g.distNow, x) >= 0)
    let tilt = { x: 0, y: 0 }
    if (d && !g.holding && !g.carry) tilt = steerTo(g, { x: d.mid.x + d.out.x * 0.5, y: d.mid.y + d.out.y * 0.5 })
    g.update(1 / 60, { tilt })
    g.drain()
  }
  return g.status === 'complete'
}
{
  // after a hypnosis in stage I the door is open and the player walks out through it
  let out = 0
  for (const [seed, t] of [[170, 'You are a stone'], [171, 'You are a boat'], [172, 'You are a tree']]) {
    const g = new Game({ stage: 0, seed })
    g.agent.dreamWish = () => false
    const spot = g.house.nearestFree(g.house.rasterise(null, { doorsShut: false }), { x: 2.0, y: 8.6 })
    Object.assign(g.player, { x: spot.x, y: spot.y })
    run(g, 1)
    g.hypnotize(t)
    run(g, 15)
    g.refreshCache()
    const open = g.house.doors.every((d) => d.open)
    if (open && walkOut(g)) out++
  }
  check(out === 3, `after a hypnosis in stage I the door is open and the player walked out through it (${out}/3)`)
  // after a dream, too
  const g = new Game({ stage: 0, seed: 173 })
  g.agent.idleWish = () => false
  run(g, 1)
  g.debugDream()
  for (let i = 0; i < 60 * 90 && g.dream; i++) {
    let tilt = { x: 0, y: 0 }
    if (g.dream.phase === 'active' && g.dream.t > 4) tilt = steerTo(g, g.dream.anchorPos())
    g.update(1 / 60, { tilt })
    g.drain()
  }
  run(g, 2)
  g.refreshCache()
  check(!g.dream && g.house.doors.every((d) => d.open) && walkOut(g), 'after a dream the door is open again and the player walked out through it')
}

// ---------- 8 ----------
section('8. A bot plays all three stages by tilt alone')

function steerTo(g, target) {
  const p = g.player
  const path = g.house.path(g.occNow, p, target)
  let t = target
  if (path && path.length) t = path[Math.min(path.length - 1, 2)]
  const dx = t.x - p.x
  const dy = t.y - p.y
  const d = Math.hypot(dx, dy) || 1
  const want = Math.min(1.2, d * 3 + 0.2)
  // lean into the wind, as a player would
  const air = g.env.airAt(p.x, p.y)
  let ax = ((dx / d) * want - p.vx) * 1.4 - (air.x * AIR_PUSH) / 11
  let ay = ((dy / d) * want - p.vy) * 1.4 - (air.y * AIR_PUSH) / 11
  const m = Math.hypot(ax, ay)
  if (m > 1) {
    ax /= m
    ay /= m
  }
  return { x: ax, y: ay }
}

const outside = (d) => ({ x: d.mid.x + d.out.x * 0.5, y: d.mid.y + d.out.y * 0.5 })

function play(g, goalFn, maxSec, stopWhen, log) {
  let collisions = 0
  let pathTimer = 0
  let tilt = { x: 0, y: 0 }
  for (let i = 0; i < maxSec * 60; i++) {
    // when he dreams, a player makes for the anchor (the exits are shut until it is reached)
    const goal = g.dream?.phase === 'active' && g.dream.anchor ? g.dream.anchorPos() : goalFn(g)
    if (g.holding || g.carry || !goal) tilt = { x: 0, y: 0 }
    else if (goal.tilt) tilt = goal.tilt
    else if (--pathTimer <= 0) {
      pathTimer = 3
      tilt = steerTo(g, goal)
    }
    g.update(1 / 60, { tilt })
    for (const e of g.drain()) {
      if (e.type === 'collision') collisions++
      if (log && ['message', 'decision', 'stageComplete', 'ending', 'niche', 'crack', 'restored', 'interrupted', 'agentFailed', 'relocated'].includes(e.type)) {
        log.push(`${g.time.toFixed(1).padStart(6)}s  ${e.type}${e.text ? `: ${e.text}` : ''}${e.type === 'decision' ? ` ${e.goal}: ${e.action}` : ''}${e.kind ? ` ${e.kind}` : ''}${e.order ? ` ${e.order}` : ''}${e.reason && e.type !== 'decision' ? ` — ${e.reason}` : ''}`)
      }
    }
    if (stopWhen(g)) return { ok: true, t: g.time, collisions }
  }
  return { ok: false, t: g.time, collisions }
}

// the nearest reachable door; if it is shut, knock on it (as a player would) until he turns
let knockPhase = 'back'
function doorGoal(g) {
  let best = null
  for (const d of g.exitDoors()) {
    const r = g.house.routeTo(g.distNow, d)
    if (r >= 0 && (!best || r < best.r)) best = { d, r }
  }
  if (!best) return null
  const d = best.d
  if (d.open) return outside(d)
  const inner = { x: d.mid.x - d.out.x * 1.1, y: d.mid.y - d.out.y * 1.1 }
  const near = Math.hypot(g.player.x - inner.x, g.player.y - inner.y)
  if (knockPhase === 'back' && near < 0.2) knockPhase = 'hit'
  if (knockPhase === 'hit' && Math.hypot(g.player.x - d.mid.x, g.player.y - d.mid.y) < 0.45) knockPhase = 'back'
  return knockPhase === 'hit' ? { tilt: d.out } : inner
}

function playStages(seed, ending) {
  const log = []
  const g = new Game({ stage: 0, seed })
  let r = play(g, doorGoal, 300, (g) => g.status === 'complete', log)
  check(r.ok, `[${ending} ${seed}] stage I completed (${r.t.toFixed(1)} s, ${r.collisions} knocks)`)
  g.startStage(1)
  r = play(g, doorGoal, 480, (g) => g.status === 'complete', log)
  check(r.ok, `[${ending} ${seed}] stage II completed (${r.t.toFixed(1)} s, ${g.shifts} posture changes)`)
  g.startStage(2)
  g.refreshCache()
  check(g.house.routeTo(g.distNow, g.door('sealed')) < 0, `[${ending} ${seed}] stage III: the sealed door cannot be reached`)
  if (ending === 'preserve') {
    r = play(
      g,
      (g) => {
        if (g.system === 'running') return g.niches.find((n) => n.order === g.nicheNext)
        if (g.system === 'restoring') return null
        return g.door('old').open ? outside(g.door('old')) : null
      },
      480,
      (g) => g.status === 'ending',
      log,
    )
    check(r.ok && g.ending === 'preserve', `[preserve ${seed}] circuit, stillness, the old door: preserve ending (${r.t.toFixed(1)} s)`)
    check(g.body.pose === g.layout.body.pose, `[preserve ${seed}] he lies again as the house was built (${g.body.pose})`)
  } else {
    // the places in front of the oldest wall, found from its actual walls: just outside the middle
    // of each of its three sides, with the push toward it
    const facesNow = () =>
      g.house.walls
        .filter((w) => w.kind === 'rule')
        .map((w) => {
          const n = { x: -Math.sin(w.a), y: Math.cos(w.a) }
          const off = w.thick / 2 + PLAYER_RADIUS + 0.12
          return [1, -1].map((sg) => ({ x: w.x + n.x * off * sg, y: w.y + n.y * off * sg, tilt: { x: -n.x * sg, y: -n.y * sg } })).find((f) => g.house.freeAt(g.occNow, f) && g.house.distAt(g.distNow, f) >= 0)
        })
        .filter(Boolean)
    let faces = facesNow()
    let face = null
    let phase = 'go'
    r = play(
      g,
      (g) => {
        if (g.system === 'interrupted') return outside(g.door('sealed'))
        if (phase === 'go') faces = facesNow()
        const reach = faces
        if (!face || !reach.some((f) => Math.hypot(f.x - face.x, f.y - face.y) < 0.05)) face = reach[0]
        if (!face) return null
        const off = Math.hypot(g.player.x - face.x, g.player.y - face.y)
        if (phase === 'go' && off < 0.12 && Math.hypot(g.player.vx, g.player.vy) < 0.3) phase = 'hit'
        if (phase === 'hit') {
          if (off > 0.3) phase = 'go'
          return { tilt: face.tilt }
        }
        return { x: face.x, y: face.y }
      },
      480,
      (g) => g.status === 'ending',
      log,
    )
    if (!check(r.ok && g.ending === 'interrupt', `[interrupt ${seed}] the oldest wall broken, out through the old seal (${r.t.toFixed(1)} s)`)) console.log(log.slice(-25).map((l) => `      ${l}`).join('\n'), `\n      player ${g.player.x.toFixed(2)},${g.player.y.toFixed(2)} system ${g.system} relocating ${g.relocatePending} doors ${g.house.doors.map((d) => `${d.id}@${d.mid.x.toFixed(1)},${d.mid.y.toFixed(1)}`).join(' ')} faces ${faces.map((f) => g.house.distAt(g.distNow, f)).join(',')} tx ${g.tx.state} since ${g.tx.since.toFixed(1)} holding ${g.holding} carry ${!!g.carry} v ${Math.hypot(g.player.vx, g.player.vy).toFixed(2)} transforming ${g.house.transforming} bodyMoving ${g.body.moving} hypno ${g.hypno?.phase} t ${g.time.toFixed(1)} exits ${JSON.stringify(g.house.exitSpecs)}`)
    check(g.agent.unbound, `[interrupt ${seed}] he tried to restore the old order, failed, and is unbound`)
  }
  return log
}

for (const seed of [1, 2, 3]) {
  const logP = playStages(seed, 'preserve')
  const logI = playStages(seed + 10, 'interrupt')
  if (seed === 1) {
    console.log('  one preserve playthrough:')
    for (const l of logP.slice(0, 40)) console.log(`    ${l}`)
    console.log('  one interrupt playthrough (stage III):')
    for (const l of logI.filter((l) => /crack|interrupt|oldest|ending|failed|RESTORE/.test(l))) console.log(`    ${l}`)
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures ? 1 : 0)
