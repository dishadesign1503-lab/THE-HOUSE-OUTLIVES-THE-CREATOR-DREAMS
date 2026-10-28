// A FLOOR PLAN FROM HIS BODY — the plan the house takes when he embodies something.
//
// The house is a grid of bays inside a frame; a bay can be inside the house or outside it, and the
// exterior shell follows whatever bays are inside. Here the bays are chosen and named from the
// posture he is taking (its bone frames, in plan coordinates, on the grid lines that posture holds):
//
//   outline   the bays his body covers, grown outward from where his body is densest: where his
//             arms branch the plan branches, where he curls it is compact, where he lies across it
//             is long and low. Always connected; the bay the player stands in is kept (joined to
//             the rest by the shortest run of bays), so no one is left outside.
//   corridor  the bays his spine and the upper parts of his limbs pass through: the circulation is
//             his skeleton (the gallery, G).
//   rooms     the remaining bays, grouped by the region of his body they lie over (head, arms,
//             hands, legs, feet …), each group one room; very large groups are halved, the
//             smallest merged until there are at most eleven.
//   exits     each exit's room is given to a group that has exterior wall on the exit's side
//             (north for the north door, west for the west door, …).
//   doors     every room is joined to the corridor where they meet, otherwise to a neighbour
//             that already is (one connected house); windows keep their rooms' exterior walls.
// The result is an ordinary organisation of the house (the same validation as any other).

import { NX, NY, buildConfig, validateConfig } from './plan.js'
import { BONE_REGION, distToSegment } from '../body/body.js'

const ROOMS = {
  H: { name: 'north hall', type: 'hall' },
  S: { name: 'study', type: 'room' },
  G: { name: 'gallery', type: 'corridor' },
  A: { name: 'antechamber', type: 'room' },
  W: { name: 'west room', type: 'room' },
  C: { name: 'courtyard', type: 'court' },
  E: { name: 'east room', type: 'room' },
  D: { name: 'dining room', type: 'room' },
  K: { name: 'kitchen', type: 'room' },
  L: { name: 'south-west room', type: 'room' },
  T: { name: 'south-east room', type: 'room' },
  N: { name: 'entrance hall', type: 'hall' },
}
const WINDOWS = [['S', 'N'], ['S', 'W'], ['W', 'W', 0], ['L', 'W'], ['N', 'S', 0], ['T', 'S'], ['E', 'E', 0], ['K', 'E'], ['A', 'E']]
const SIDES = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const CORRIDOR_BONES = ['spine', 'chest', 'neck', 'thighL', 'thighR', 'armL', 'armR']
const key = (i, j) => `${i},${j}`

function bayOf(v, L) {
  for (let i = 0; i < L.length - 1; i++) if (v >= L[i] && v < L[i + 1]) return i
  return -1
}

// frames: his posture's bone frames (plan coordinates); X, Y: the grid lines; exits: the house's
// exit list; player: { x, y }; opts.size: how many bays the house keeps at most.
// Returns { spec } or { problems }.
export function planFromBody(frames, X, Y, exits, { player = null, size = 34, minSize = 18, label = 'his body', rule = false } = {}) {
  const bones = Object.entries(frames)
  const centre = (i, j) => ({ x: (X[i] + X[i + 1]) / 2, y: (Y[j] + Y[j + 1]) / 2 })
  // how near each bay is to his body (cells; below 0 = under the flesh)
  const near = {}
  const region = {}
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const c = centre(i, j)
      let best = Infinity
      let reg = null
      for (const [id, f] of bones) {
        const d = distToSegment(c, f.a, f.b) - f.hw
        if (d < best) {
          best = d
          reg = BONE_REGION[id]
        }
      }
      near[key(i, j)] = best
      region[key(i, j)] = reg
    }
  }
  // the outline: grow from the bay nearest his body, always to the nearest neighbouring bay
  const inside = new Set()
  let start = null
  for (const k of Object.keys(near)) if (!start || near[k] < near[start]) start = k
  inside.add(start)
  while (inside.size < size) {
    let next = null
    for (const k of inside) {
      const [i, j] = k.split(',').map(Number)
      for (const [di, dj] of N4) {
        const n = key(i + di, j + dj)
        if (i + di < 0 || j + dj < 0 || i + di >= NX || j + dj >= NY || inside.has(n)) continue
        if (!next || near[n] < near[next]) next = n
      }
    }
    if (!next || (near[next] > 0.95 && inside.size >= minSize)) break
    inside.add(next)
  }
  // keep the player's bay (and the shortest way to it)
  if (player) {
    const pi = bayOf(player.x, X)
    const pj = bayOf(player.y, Y)
    if (pi >= 0 && pj >= 0 && !inside.has(key(pi, pj))) {
      const prev = new Map([[key(pi, pj), null]])
      const q = [[pi, pj]]
      let hit = null
      while (q.length && !hit) {
        const [i, j] = q.shift()
        for (const [di, dj] of N4) {
          const ni = i + di
          const nj = j + dj
          const n = key(ni, nj)
          if (ni < 0 || nj < 0 || ni >= NX || nj >= NY || prev.has(n)) continue
          prev.set(n, key(i, j))
          if (inside.has(n)) {
            hit = n
            break
          }
          q.push([ni, nj])
        }
      }
      for (let k = hit && prev.get(hit); k; k = prev.get(k)) inside.add(k)
    }
  }
  const isIn = (i, j) => i >= 0 && j >= 0 && i < NX && j < NY && inside.has(key(i, j))
  // the corridor: the bays his spine and upper limbs pass through
  const corridor = new Set()
  for (const id of CORRIDOR_BONES) {
    const f = frames[id]
    if (!f) continue
    for (let t = 0; t <= 1.0001; t += 1 / 12) {
      const p = { x: f.a.x + (f.b.x - f.a.x) * t, y: f.a.y + (f.b.y - f.a.y) * t }
      const i = bayOf(p.x, X)
      const j = bayOf(p.y, Y)
      if (isIn(i, j)) corridor.add(key(i, j))
    }
  }
  if (corridor.size > inside.size * 0.45) {
    corridor.clear()
    for (const id of ['spine', 'chest', 'neck']) {
      const f = frames[id]
      for (let t = 0; t <= 1.0001; t += 1 / 12) {
        const i = bayOf(f.a.x + (f.b.x - f.a.x) * t, X)
        const j = bayOf(f.a.y + (f.b.y - f.a.y) * t, Y)
        if (isIn(i, j)) corridor.add(key(i, j))
      }
    }
  }
  if (!corridor.size) corridor.add(start)
  // one corridor: join its pieces through the house by the shortest runs of bays
  const components = (set) => {
    const left = new Set(set)
    const out = []
    while (left.size) {
      const first = left.values().next().value
      const comp = new Set([first])
      left.delete(first)
      const q = [first]
      while (q.length) {
        const [i, j] = q.shift().split(',').map(Number)
        for (const [di, dj] of N4) {
          const n = key(i + di, j + dj)
          if (left.has(n)) {
            left.delete(n)
            comp.add(n)
            q.push(n)
          }
        }
      }
      out.push(comp)
    }
    return out
  }
  let parts = components(corridor)
  while (parts.length > 1) {
    const [a, ...rest] = parts
    const prev = new Map()
    const q = []
    for (const k of a) {
      prev.set(k, null)
      q.push(k)
    }
    let hit = null
    while (q.length && !hit) {
      const k = q.shift()
      const [i, j] = k.split(',').map(Number)
      for (const [di, dj] of N4) {
        const n = key(i + di, j + dj)
        if (!isIn(i + di, j + dj) || prev.has(n)) continue
        prev.set(n, k)
        if (rest.some((r) => r.has(n))) {
          hit = n
          break
        }
        q.push(n)
      }
    }
    if (!hit) break
    for (let k = hit; k; k = prev.get(k)) corridor.add(k)
    parts = components(corridor)
  }
  // the rooms: the other bays, by the body region they lie over
  const rest = [...inside].filter((k) => !corridor.has(k))
  const byRegion = new Map()
  for (const k of rest) {
    const r = region[k] ?? 'stomach'
    if (!byRegion.has(r)) byRegion.set(r, new Set())
    byRegion.get(r).add(k)
  }
  let groups = []
  for (const set of byRegion.values()) for (const c of components(set)) groups.push(c)
  // halve the largest (a room of more than 7 bays), if both halves stay whole
  const halve = (g) => {
    const cells = [...g].map((k) => k.split(',').map(Number))
    const xs = cells.map(([i]) => i)
    const ys = cells.map(([, j]) => j)
    const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)
    cells.sort((p, q) => (alongX ? p[0] - q[0] || p[1] - q[1] : p[1] - q[1] || p[0] - q[0]))
    const a = new Set(cells.slice(0, Math.ceil(cells.length / 2)).map(([i, j]) => key(i, j)))
    const b = new Set(cells.slice(Math.ceil(cells.length / 2)).map(([i, j]) => key(i, j)))
    return components(a).length === 1 && components(b).length === 1 ? [a, b] : [g]
  }
  groups = groups.flatMap((g) => (g.size > 7 ? halve(g) : [g]))
  const touches = (a, b) => [...a].some((k) => {
    const [i, j] = k.split(',').map(Number)
    return N4.some(([di, dj]) => b.has(key(i + di, j + dj)))
  })
  // at most eleven rooms: merge the smallest into a neighbour
  groups.sort((a, b) => a.size - b.size)
  while (groups.length > 11) {
    const g = groups.shift()
    const n = groups.find((h) => touches(g, h))
    if (n) for (const k of g) n.add(k)
    else for (const k of g) corridor.add(k)
    groups.sort((a, b) => a.size - b.size)
  }
  // exits: each exit's room is a group with exterior wall on the exit's side
  const exteriorOn = (g, side) => {
    const [di, dj] = SIDES[side]
    return [...g].filter((k) => {
      const [i, j] = k.split(',').map(Number)
      return !isIn(i + di, j + dj)
    }).length
  }
  const needs = new Map()
  for (const e of exits) {
    if (!needs.has(e.room)) needs.set(e.room, new Set())
    needs.get(e.room).add(e.side)
  }
  const named = new Map() // group → letter
  for (const [letter, sides] of [...needs].sort((a, b) => b[1].size - a[1].size)) {
    let best = null
    for (const g of groups) {
      if (named.has(g)) continue
      const counts = [...sides].map((s) => exteriorOn(g, s))
      if (counts.some((c) => c === 0)) continue
      // the oldest wall stands in front of the north door: that room needs room for it
      if (rule && letter === 'H' && counts[0] < 2) continue
      const score = Math.min(...counts) * 10 + g.size
      if (!best || score > best.score) best = { g, score }
    }
    if (!best) return { problems: [`no room of his body can hold the ${[...sides].join('/')} exit of room ${letter}`] }
    named.set(best.g, letter)
  }
  const pool = Object.keys(ROOMS).filter((l) => l !== 'G' && ![...named.values()].includes(l))
  for (const g of [...groups].sort((a, b) => b.size - a.size)) if (!named.has(g)) named.set(g, pool.shift())
  // the map
  const letterAt = new Map()
  for (const k of corridor) letterAt.set(k, 'G')
  for (const [g, l] of named) for (const k of g) letterAt.set(k, l)
  const map = []
  for (let j = 0; j < NY; j++) {
    let row = ''
    for (let i = 0; i < NX; i++) row += isIn(i, j) ? letterAt.get(key(i, j)) ?? 'G' : '.'
    map.push(row)
  }
  // doors: each room to the corridor where they meet, else to a neighbour already joined
  const sets = new Map([['G', corridor]])
  for (const [g, l] of named) sets.set(l, g)
  const doors = []
  const joined = new Set(['G'])
  let progress = true
  while (progress) {
    progress = false
    for (const [l, g] of sets) {
      if (joined.has(l)) continue
      const to = touches(g, corridor) ? 'G' : [...joined].find((o) => touches(g, sets.get(o)))
      if (to) {
        doors.push([to, l])
        joined.add(l)
        progress = true
      }
    }
  }
  if (joined.size < sets.size) return { problems: ['a room of his body could not be joined to the rest'] }
  const spec = { label, character: {}, map, rooms: ROOMS, doors, windows: WINDOWS, generated: true }
  return { spec }
}

// Check a generated plan as the house would: a valid organisation on these lines.
export function checkBodyPlan(id, spec, exits, X, Y) {
  const cfg = buildConfig(id, { ...spec, exits })
  return validateConfig(cfg, X, Y)
}
