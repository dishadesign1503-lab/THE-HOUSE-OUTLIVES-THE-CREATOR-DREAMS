// HOW HE CHOOSES (the utility planner).
//
// He does not move walls: he changes how he lies, and the house's plan follows. A candidate is a
// posture (his body) and an organisation of rooms (the plan): small adjustments keep the present
// organisation and only shift the grid lines over the parts of him that move; large changes may
// pass to another organisation. Each candidate is turned into a target plan and checked before
// it can be chosen:
//   architecture   every bay wide enough, every door and window fits its wall, every room
//                  reachable through doors (plan.js validateConfig)
//   the player     no wall comes to rest on the ball; a door (or in stage III every niche, and the
//                  oldest wall) can still be reached from where the ball is
//   a real change  the plan must actually change
// Then it is scored for the goal: the route, habitual passages closed, relief of the disturbed
// part of him, how much of the house moves, and (for large changes) the wind along the way.
//
// A hypnotic instruction does not choose for him. It arrives as a suggestion: concepts, how
// receptive he is to it now (pull: negative when he is contrary), and what he remembers of
// instructions like it. Every candidate then also gets
//   utility = … + pull × instructionCompatibility(posture)  −  echo (how often this suggestion
//             already led to this posture: he does not simply replay an answer)
// so the suggestion shapes the choice among feasible, valid plans; it can be followed,
// reinterpreted, turned around, or outweighed by stillness.

import { Body, POSES, RELIEF, BONE_REGION, distToSegment } from '../body/body.js'
import { Environment } from '../world/environment.js'
import { RES } from '../world/house.js'
import { compatibility, shapeFit } from './suggestion.js'

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const PLAYER_R = 0.2

export const GOAL_ACTIONS = {
  PRESERVE_STABILITY: ['hold'],
  INVESTIGATE: ['twitch'],
  DEFEND: ['guard'],
  ADAPT: ['stir', 'block'],
  RESTORE_ORDER: ['restore'],
  RECONFIGURE: ['repose'],
  DREAM: ['dream'], // answering a hypnotic suggestion in his sleep
  EMBODY: ['embody'], // hypnotised: "you are a …": he tries to sleep in the shape of that object
  RELOCATE_EXIT: ['relocate'], // irritated: the exit and the rooms around it move
}

// how alike an object's attributes and an organisation's spatial character are (0..1)
function affinity(attr, character) {
  let dot = 0
  let na = 0
  let nb = 0
  for (const k of Object.keys(attr)) {
    const a = attr[k] ?? 0
    const b = character?.[k] ?? 0
    dot += a * b
    na += a * a
    nb += b * b
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

function regionDistance(frames, region, p) {
  let best = Infinity
  for (const [id, f] of Object.entries(frames)) if (BONE_REGION[id] === region) best = Math.min(best, distToSegment(p, f.a, f.b))
  return best
}

// How far it is, walking, between the two cells on either side of a passage the player uses
// (-1: no way at all). A passage is closed when a wall moves onto it or its door moves away.
function edgeWalk(house, occ, key) {
  const [kind, rest] = key.split(':')
  const [c, r] = rest.split(',').map(Number)
  const a = kind === 'v' ? { x: c - 0.5, y: r + 0.5 } : { x: c + 0.5, y: r - 0.5 }
  const b = kind === 'v' ? { x: c + 0.5, y: r + 0.5 } : { x: c + 0.5, y: r + 0.5 }
  if (!house.freeAt(occ, a) || !house.freeAt(occ, b)) return -1
  const d = house.distAt(house.distances(occ, a), b)
  return d < 0 ? -1 : d / RES
}

function edgeBlocked(house, occ, key, before) {
  const now = edgeWalk(house, occ, key)
  return before >= 0 && (now < 0 || now > before + 2)
}

const keyOf = (p) => `${p.key}`
const near = (a, b) => Math.hypot(a.a.x - b.a.x, a.a.y - b.a.y) + Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) < 0.05

// Predict what a posture (and organisation) means, before he takes it.
// push: a wall arriving next to the player may ease it aside (used for plans drawn from his body,
// which always keep the player's own bay inside; walls lie only on bay edges)
export function predict(ctx, poseName, configId, { env = false, exits: exitPlan = null, push = false } = {}) {
  const { house, body } = ctx
  const frames = Body.framesOf(poseName, body.place)
  const plan = house.planFor(frames, configId, exitPlan)
  const arch = house.validatePlan(plan)
  const geo = house.geometryFor(plan)
  // which walls change: new, gone, or moved
  const now = new Map(house.pieces.map((p) => [keyOf(p), p]))
  let wallsMoved = 0
  let crush = false
  for (const p of geo.pieces) {
    const before = now.get(keyOf(p))
    const changed = !before || !near(before, p)
    if (changed) wallsMoved++
    // a wall that would come to rest on the ball (touching one that stays put is fine)
    if (changed && distToSegment(ctx.player, p.a, p.b) < PLAYER_R + p.thick / 2 + 0.03) crush = true
  }
  const kept = new Set(geo.pieces.map(keyOf))
  for (const k of now.keys()) if (!kept.has(k)) wallsMoved++
  const occ = house.rasterise(plan, { doorsShut: false })
  const dist = house.distances(occ, ctx.player)
  const exits = new Map(geo.exits.map((e) => [e.id, e]))
  const routes = ctx.rules.doors.map((d) => (exits.get(d.id) ? house.routeTo(dist, exits.get(d.id)) : -1))
  const reachable = routes.filter((r) => r >= 0)
  const routeLen = reachable.length ? Math.min(...reachable) : -1
  if (push) crush = false
  let ok = arch.ok && !crush && (ctx.rules.sealed ? true : routeLen >= 0)
  let why = !arch.ok ? `not architecture: ${arch.problems[0]}` : crush ? 'a wall would come down on the ball' : routeLen < 0 && !ctx.rules.sealed ? 'no door could be reached' : ''
  // (a plan drawn from his body moves the niches with the house, to free reachable places; so
  // only the plans that keep the niches where they are must keep them reachable)
  if (ok && ctx.rules.mustReach && !push) {
    for (const p of ctx.rules.mustReach) {
      if (house.distAt(dist, p) < 0) {
        ok = false
        why = 'a niche would be cut off'
        break
      }
    }
  }
  if (ok && ctx.rules.sealed && ctx.rules.sealedDoor) {
    const through = house.distances(house.rasterise(plan, { ignoreRule: true, doorsShut: false }), ctx.player)
    const sd = exits.get(ctx.rules.sealedDoor.id)
    if (!sd || house.routeTo(through, sd) < 0) {
      ok = false
      why = 'the oldest wall would be out of reach'
    }
  }
  const lineShift = plan.X.reduce((s, x, i) => s + Math.abs(x - house.X[i]), 0) + plan.Y.reduce((s, y, j) => s + Math.abs(y - house.Y[j]), 0)
  let habitsBlocked = 0
  ctx.edgeNow ??= new Map()
  for (const [e, use] of ctx.memory.topEdges(8)) {
    if (!ctx.edgeNow.has(e)) ctx.edgeNow.set(e, edgeWalk(house, ctx.occNow, e))
    if (edgeBlocked(house, occ, e, ctx.edgeNow.get(e))) habitsBlocked += use
  }
  const out = { ok, why, plan, routeLen, routes, wallsMoved, moved: lineShift / 12 + (configId !== house.configId ? 0.8 : 0), topology: configId !== house.configId, habitsBlocked }
  if (ctx.focusRegion) out.relief = regionDistance(frames, ctx.focusRegion, ctx.player) - regionDistance(body.frames, ctx.focusRegion, ctx.player)
  if (ctx.rules.relocate) {
    // the exit he is moving: can the player still reach it, and how far is it
    const ex = exitPlan && geo.exits.find((e) => e.id === ctx.rules.relocate)
    out.exitRoute = ex ? house.routeTo(dist, ex) : -1
  }
  if (ctx.rules.protect) {
    const pd = exits.get(ctx.rules.protect.id)
    out.protectRoute = pd ? house.routeTo(dist, pd) : -1
  }
  if (env) {
    const e = new Environment({ wind: ctx.env.wind, sun: ctx.env.sun })
    e.sunOn = false
    e.iterations = 90
    e.recompute(house, plan)
    let air = 0
    let n = 0
    const target = [...exits.values()].find((x) => ctx.rules.doors.some((d) => d.id === x.id))
    if (target) {
      const path = house.path(occ, ctx.player, { x: target.mid.x - target.out.x * 0.3, y: target.mid.y - target.out.y * 0.3 }) ?? []
      for (let i = 0; i < path.length; i += RES) {
        const v = e.airAt(path[i].x, path[i].y)
        air += Math.hypot(v.x, v.y)
        n++
      }
    }
    out.airOnRoute = n ? air / n : 0
  }
  return out
}

// ---------- candidates ----------

// his own repertoire (the postures composed for an object under hypnosis are offered only then)
function poseCandidates(ctx, filter) {
  return Object.keys(POSES).filter((p) => !POSES[p].embodied && filter(POSES[p]))
}

const GEN = {
  hold() {
    return [{ action: 'hold', steps: ['stay as he is'], reason: 'nothing needs to change', score: 0.2 }]
  },

  // the touched region flinches: the grid lines over it shift and come back
  twitch(ctx) {
    if (!ctx.focusRegion) return []
    return [{ action: 'twitch', region: ctx.focusRegion, steps: [`his ${ctx.focusRegion} flinches`], reason: 'feel out the disturbance', score: 0.35 }]
  },

  // a small change of posture: the rooms over the moving part of him grow or shrink
  stir(ctx) {
    const relief = new Set(RELIEF[ctx.focusRegion] ?? [])
    return poseCandidates(ctx, (p) => !p.major && p.id !== ctx.body.pose).map((pose) => ({ action: 'stir', pose, configId: ctx.house.configId, steps: [POSES[pose].label], reason: 'move the part of him that was touched', score: relief.has(pose) ? 0.45 : 0 }))
  },

  guard(ctx) {
    return poseCandidates(ctx, (p) => p.id !== ctx.body.pose).map((pose) => ({ action: 'guard', pose, configId: ctx.house.configId, steps: [`${POSES[pose].label}, toward what he guards`], reason: 'keep the player from the door', score: 0 }))
  },

  block(ctx) {
    return poseCandidates(ctx, (p) => p.id !== ctx.body.pose).map((pose) => ({ action: 'block', pose, configId: ctx.house.configId, steps: [`${POSES[pose].label}, over the player's habitual way`], reason: 'the player keeps escaping this way', score: 0 }))
  },

  // back to an organisation and posture remembered as stable
  restore(ctx) {
    if (ctx.rules.ruleMissing) return [{ action: 'restore', impossible: true, steps: ['rebuild the oldest wall'], reason: 'its oldest wall is gone', score: 0 }]
    const L = ctx.restoreTo
    if (!L || (L.pose === ctx.body.pose && L.configId === ctx.house.configId)) return []
    return [{ action: 'restore', pose: L.pose, configId: L.configId ?? ctx.house.configId, steps: [`return to ${POSES[L.pose].label}`], reason: 'return to a shape that held', score: 0.5 + (L.stability ?? 0.5) * 0.5 }]
  },

  // a suggestion reached him: any way of lying is possible; for a suggestion of large movement
  // (or when he is contrary) the rooms may reorganise too. The planner weighs which, if any.
  dream(ctx) {
    const sug = ctx.suggestion
    if (!sug) return []
    const c = sug.concepts
    const big = (c.ROLLING ?? 0) + (c.LATERAL_MOVEMENT ?? 0) + (c.EXPANSION ?? 0) >= 0.6 || sug.k > 0.3
    const out = []
    for (const pose of Object.keys(POSES).filter((p) => !POSES[p].embodied)) {
      for (const configId of big && ctx.rules.allowMajor ? ctx.house.cfgs.keys() : [ctx.house.configId]) {
        if (pose === ctx.body.pose && configId === ctx.house.configId) continue
        const major = POSES[pose].major || configId !== ctx.house.configId
        if (major && !ctx.rules.allowMajor) continue
        out.push({ action: 'dream', pose, configId, major, steps: [POSES[pose].label, configId !== ctx.house.configId ? ctx.house.cfgs.get(configId).label : 'the same rooms'], reason: 'the suggestion reaches him in his sleep', score: 0 })
      }
    }
    return out
  },

  // under hypnosis: the postures composed for the named object (3 degrees × 2 sides); for an
  // object that lies across or spans or spreads, the rooms may reorganise around him as well
  embody(ctx) {
    const h = ctx.suggestion?.embody
    if (!h) return []
    const out = []
    for (const v of h.variants) {
      const P = POSES[v.id]
      if (!P) continue
      if (P.major && !ctx.rules.allowMajor && v.intensity > 0.6) continue
      // the house takes the shape of his body in this posture: outline, corridor and rooms drawn
      // from its bones (bodyplan.js); where that cannot be a valid house, only the grid follows him
      const body = ctx.rules.allowMajor ? ctx.house.bodyConfig(`body:${h.object.replace(/\s+/g, '-')}:${v.id}`, Body.framesOf(v.id, ctx.body.place), { player: ctx.player }) : null
      const configId = body ?? ctx.house.configId
      out.push({ action: 'embody', pose: v.id, configId, bodyPlan: !!body, intensity: v.intensity, mirror: v.mirror, major: !!P.major || configId !== ctx.house.configId, steps: [P.label, body ? 'the house in the shape of his body' : 'the same rooms'], reason: `he tries to be ${/^[aeiou]/.test(h.object) ? 'an' : 'a'} ${h.object}`, score: 0 })
    }
    return out
  },

  // irritated a third time: he turns over and the exit, with the rooms around it, moves to
  // another place in the exterior wall. Candidates: the most telling places × his larger postures.
  relocate(ctx) {
    const id = ctx.rules.relocate
    if (!id) return []
    const door = ctx.house.doors.find((d) => d.id === id)
    const h = ctx.state.irritation
    const alts = ctx.house
      .exitAlternatives(id)
      .map((a) => {
        const moved = door ? Math.hypot(a.mid.x - door.mid.x, a.mid.y - door.mid.y) : 3
        const fromPlayer = Math.hypot(a.mid.x - ctx.player.x, a.mid.y - ctx.player.y)
        // a real move (not next door), and the more irritated, the further from the player
        return { ...a, moved, pre: Math.min(moved, 6) * 0.3 + fromPlayer * (h - 0.4) * 0.2 - (moved < 1.5 ? 3 : 0) }
      })
      .sort((a, b) => b.pre - a.pre)
      .slice(0, 6)
    const poses = Object.keys(POSES).filter((p) => POSES[p].major && p !== ctx.body.pose)
    const out = []
    for (const a of alts) {
      for (const pose of poses) {
        out.push({ action: 'relocate', pose, configId: ctx.house.configId, exits: a.exits, newExit: a.mid, exitMoved: a.moved, major: true, steps: [POSES[pose].label, `the exit moves (${a.unit})`], reason: 'disturbed a third time: he reorganises around the exit', score: 0 })
      }
    }
    return out
  },

  // roll over, stretch out, curl up: a new posture, and the rooms reorganise around it
  repose(ctx) {
    if (!ctx.rules.allowMajor) return []
    const relief = new Set(RELIEF[ctx.focusRegion] ?? [])
    const out = []
    for (const pose of poseCandidates(ctx, (p) => p.major || relief.has(p.id))) {
      for (const configId of ctx.house.cfgs.keys()) {
        if (pose === ctx.body.pose && configId === ctx.house.configId) continue
        out.push({ action: 'repose', pose, configId, steps: [POSES[pose].label, configId !== ctx.house.configId ? ctx.house.cfgs.get(configId).label : 'the same rooms, reshaped'], reason: 'this way of lying no longer serves him', score: (relief.has(pose) ? 0.35 : 0) + (configId !== ctx.house.configId ? 0.15 : 0), major: true })
      }
    }
    return out
  },
}

// Propose, check and score candidates for a goal. Returns them best first (invalid ones last).
export function plan(goal, ctx) {
  const all = []
  for (const kind of GOAL_ACTIONS[goal]) for (const c of GEN[kind](ctx)) all.push(c)
  const sug = ctx.suggestion
  const now = sug ? Body.framesOf(ctx.body.pose, ctx.body.place) : null
  for (const c of all) {
    if (sug && !c.impossible && (c.pose || c.action === 'hold')) {
      c.compat = compatibility(sug.concepts, now, c.pose ?? null, ctx.body.place)
      if (c.action === 'embody') {
        // fit: how closely this posture resembles the object's whole shape
        const whole = sug.embody.variants.find((v) => v.intensity === 1 && v.mirror === c.mirror)
        c.compat = whole ? shapeFit(c.pose, whole.id, ctx.body.place) : c.compat
        // how well the measured shape fits the object, at the degree his mood allows: receptive,
        // he gives himself to it fully; aroused, irritated or nagged, only part of the way
        const preferred = clamp(0.35 + 0.65 * sug.r - 0.3 * sug.k, 0.6, 1)
        c.preferred = preferred
        // and whether the house can take the shape of his body
        c.affinity = c.bodyPlan ? 1 : 0
        c.score += 0.5 * c.compat - 2.5 * Math.abs(c.intensity - preferred) + 1.2 * c.affinity
        // he does not give the same answer twice to the same suggestion
        c.score -= 0.45 * ctx.memory.echoShape(sug.embody.object, c.intensity, c.mirror, c.configId)
      } else {
        // the suggestion as one input among the others: compatibility × how receptive he is
        c.score += sug.pull * c.compat
        if (c.pose) c.score -= 0.3 * ctx.memory.echo(sug.concepts, c.pose)
      }
    }
    const exp = ctx.memory.rate(ctx.memory.strategies, c.action)
    c.score += (exp - 0.5) * 0.6
    const last = ctx.lastUsed?.[c.pose ? `${c.pose}|${c.configId}` : c.action]
    if (last != null && ctx.t - last < 10) c.score -= 0.6 * (1 - (ctx.t - last) / 10)
    if (!c.pose) continue
    c.major = c.major || POSES[c.pose].major
    c.predicted = predict(ctx, c.pose, c.configId, { exits: c.exits, push: !!c.bodyPlan })
    const p = c.predicted
    if (!p.ok) {
      c.score = -9
      c.invalid = p.why
      continue
    }
    if (c.action === 'relocate') {
      if (p.exitRoute == null || p.exitRoute < 0) {
        c.score = -9
        c.invalid = 'the new exit could not be reached'
        continue
      }
      // irritated, he would rather put it far from the player; it must stay reachable
      const h = ctx.state.irritation
      c.score += h * 0.05 * p.exitRoute + 0.08 * Math.min(c.exitMoved, 6) - p.moved * 0.05
    }
    if (p.wallsMoved < (c.major ? 4 : 2)) {
      c.score = -9
      c.invalid = 'the house would not change'
      continue
    }
    c.score -= p.moved * (goal === 'RECONFIGURE' ? 0.05 : 0.25)
    if (p.relief != null) c.score += clamp(p.relief, -1, 2) * 0.25
    if (goal === 'ADAPT') c.score += (c.action === 'block' ? p.habitsBlocked * 0.3 : 0) + (p.routeLen - (ctx.routeLen ?? p.routeLen)) * 0.04
    if (goal === 'DEFEND' && p.protectRoute != null) c.score += (p.protectRoute < 0 ? 3 : p.protectRoute - (ctx.protectRoute ?? p.protectRoute)) * 0.15
    if (goal === 'RECONFIGURE') {
      c.score += p.habitsBlocked * 0.12 + Math.min(p.moved, 2) * 0.1
      const L = ctx.memory.layoutOf({ signature: () => `${c.pose}|${c.configId}` })
      if (L) c.score += (L.stability - 0.5) * 0.4
    }
    if (c.pose === ctx.previousPose) c.score -= 0.25
  }
  const top = all.filter((c) => c.major && !c.invalid).sort((a, b) => b.score - a.score).slice(0, 2)
  for (const c of top) {
    const e = predict(ctx, c.pose, c.configId, { env: true })
    c.predicted.airOnRoute = e.airOnRoute
    c.score -= ctx.state.environmentalSensitivity * e.airOnRoute * 0.5
  }
  return all.sort((a, b) => b.score - a.score)
}
