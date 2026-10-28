// HIS MIND — a local, utility-based planner with memory. No network, no language model.
//
// The causal chain it belongs to (see game.js):
//   wall collision → disturbance event → grid cell → body region → THIS: state update →
//   decision → posture or twitch → the transformation system moves the walls
//
// perceive()  takes each disturbance: its body region, its intensity; raises arousal and
//             irritation, the region's accumulated disturbance, remembers the event
// update()    lets state decay, watches the player (habits), and observes the outcome of his last
//             action once the house has settled; learns from it
// decide()    called by the transformation controller when a disturbance has arrived and the house
//             is idle: scores every family of action, plans candidates for the best one, chooses
// idleWish()  now and then, when calm, a small independent adjustment of his sleep
//
// Action families (goals) and what drives them:
//   PRESERVE_STABILITY  stay still            the disturbance is too small, he is calm and stable
//   INVESTIGATE         twitch the region     a small knock, the first in that region
//   ADAPT               adjust a limb, or     disturbance accumulated in one region; or a passage
//                       close a habit         the player keeps using
//   RECONFIGURE         roll, stretch, curl   repeated knocks in one region, a strong knock, high
//                                             arousal; larger with more
//   DEFEND              guard                 the player near what he guards (stage-dependent)
//   RESTORE_ORDER       return to a stable    calm again after changes; a remembered stable pose
//                       posture
//   DREAM               answer a hypnotic     a suggestion reached him and he is receptive to it
//                       suggestion in sleep
//   RELOCATE_EXIT       move the exit         the third significant disturbance (set by the game)
//
// perceiveInstruction()  a hypnotic instruction (its concepts, never the audio): how receptive he
//             is to it (calm and unirritated: more; aroused, irritated, hearing it again: less),
//             how contrary (irritation and repetition turn him against it), what it does to his
//             state, and what he remembers of instructions like it. The next decision weighs it.
// Each utility is multiplied by trust learned from outcomes, reduced for a family just used
// (he avoids repeating himself), with a little hysteresis and a very little noise.

import { plan as planActions, GOAL_ACTIONS } from './planner.js'
import { AgentMemory } from './memory.js'
import { compatibility } from './suggestion.js'
import { Body } from '../body/body.js'

export const GOALS = Object.keys(GOAL_ACTIONS)
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const cellKey = (c, r) => `${c},${r}`

export class HouseAgent {
  constructor({ rng = Math.random, temperament = {}, memory = null } = {}) {
    this.rng = rng
    this.temper = { tolerance: 1, adaptBias: 0, defendBias: 0, restoreBias: 0, majorAt: 0.75, ...temperament }
    this.memory = memory ?? new AgentMemory()
    this.s = { arousal: 0, irritation: 0, curiosity: 0, defensiveness: 0, structuralStability: 0.8, environmentalSensitivity: this.temper.environmentalSensitivity ?? 0.4 }
    this.mode = 'DORMANT' // DORMANT | ALERT | ACTING | OBSERVING | RITUAL | UNBOUND
    this.unbound = false
    this.t = 0
    this.regionHeat = {} // region → accumulated disturbance (fades over ~25 s)
    this.events = [] // recent disturbance events { t, region, amount }
    this.lastEvent = null
    this.utilities = {}
    this.candidates = []
    this.currentGoal = null
    this.currentPlan = null
    this.lastActionOutcome = null
    this.lastFamily = null
    this.lastFamilyAt = -99
    this.lastUsed = {}
    this.previousPose = null
    this.decisionLog = []
    this.forced = null
    this.idleTimer = 25
    this.focus = null
    this.suggestion = null // the hypnotic instruction waiting for his next decision
  }

  setTemperament(t) {
    Object.assign(this.temper, t)
  }

  // ---------- PERCEIVE ----------

  perceive({ amount, kind, at, cell, region, airy = false }) {
    if (this.mode === 'RITUAL') return 0
    const a = amount * this.temper.tolerance
    const reps = this.events.filter((e) => e.region === region && this.t - e.t < 20).length
    this.s.arousal = clamp(this.s.arousal + a * (1 + reps * 0.25))
    this.s.irritation = clamp(this.s.irritation + a * (reps ? 0.7 : 0.35))
    this.s.curiosity = clamp(this.s.curiosity + (reps ? 0.05 : 0.2))
    this.s.structuralStability = clamp(this.s.structuralStability - a * 0.15)
    if (region) this.regionHeat[region] = (this.regionHeat[region] ?? 0) + a
    this.focus = at
    this.lastEvent = { t: this.t, kind, region, amount: a, reps: reps + 1, cell: cellKey(cell.c, cell.r), at }
    this.events.push({ t: this.t, region, amount: a })
    if (this.events.length > 30) this.events.shift()
    if (kind !== 'noise' && kind !== 'shake') this.memory.bump(cell, a, airy)
    this.memory.record(this.t, kind, { cell: cellKey(cell.c, cell.r), region, amount: +a.toFixed(3) })
    if (this.mode === 'DORMANT') this.mode = 'ALERT'
    return a
  }

  // A hypnotic instruction: { text, concepts, forceful (0..1) } — words and concepts, no audio.
  // Returns how it landed: { receptivity, contrariness, repeats, disruptive }.
  perceiveInstruction(ins) {
    if (this.mode === 'RITUAL') return { receptivity: 0, contrariness: 0, repeats: 0, disruptive: false, ignored: true }
    const s = this.s
    const entry = { t: this.t, text: ins.text, object: ins.object ?? null, concepts: ins.concepts, state: { arousal: +s.arousal.toFixed(2), irritation: +s.irritation.toFixed(2) }, chosen: null, outcome: null }
    const repeats = this.memory.similarInstructions(entry, this.t - 90).length
    const familiarity = this.memory.similarInstructions(entry).length
    const forceful = ins.forceful ?? 0
    // calm words soothe him a little; forceful ones and nagging repetition irritate
    if (forceful < 0.3) s.arousal = clamp(s.arousal * 0.85)
    else {
      s.arousal = clamp(s.arousal + 0.25 * forceful)
      s.irritation = clamp(s.irritation + 0.15 * forceful)
    }
    if (repeats >= 1) s.irritation = clamp(s.irritation + 0.1 * repeats)
    s.curiosity = clamp(s.curiosity + (ins.concepts.UNKNOWN ? 0.12 : 0.06))
    const receptivity = clamp(0.9 - 0.7 * s.arousal - 0.6 * s.irritation - 0.2 * repeats - 0.05 * familiarity - 0.2 * forceful)
    const contrariness = clamp(0.9 * s.irritation + 0.22 * Math.max(0, repeats - 1) + 0.4 * forceful - 0.25)
    entry.repeats = repeats
    entry.receptivity = +receptivity.toFixed(2)
    entry.contrariness = +contrariness.toFixed(2)
    this.memory.rememberInstruction(entry)
    this.memory.record(this.t, 'instruction', { text: ins.text, concepts: Object.keys(ins.concepts).join('+'), repeats })
    const moving = Object.entries(ins.concepts).filter(([c]) => c !== 'STILLNESS' && c !== 'UNKNOWN').reduce((m, [, w]) => Math.max(m, w), 0)
    this.suggestion = { entry, concepts: ins.concepts, r: receptivity, k: contrariness, pull: 1.6 * (receptivity - contrariness), strength: moving, still: ins.concepts.STILLNESS ?? 0, unknown: !!ins.concepts.UNKNOWN }
    if (this.mode === 'DORMANT') this.mode = 'ALERT'
    return { receptivity, contrariness, repeats, disruptive: forceful >= 0.6 || (repeats >= 2 && s.irritation >= 0.35) }
  }

  // ---------- state over time ----------

  update(dt, world) {
    this.t += dt
    const s = this.s
    this.memory.observePlayer(world.cell, dt)
    this.memory.decay(dt)
    for (const r of Object.keys(this.regionHeat)) this.regionHeat[r] *= Math.exp(-dt / 25)
    const quiet = this.t - (this.events.at(-1)?.t ?? -99)
    if (quiet > 2) s.arousal = clamp(s.arousal - dt * 0.04)
    s.irritation = clamp(s.irritation - dt * 0.012)
    s.curiosity = clamp(s.curiosity - dt * 0.03)
    s.defensiveness = clamp(this.temper.defendBias + (world.protectDist != null ? clamp(1 - world.protectDist / 4) * 0.8 : 0))
    if (!world.moving && quiet > 3) s.structuralStability = clamp(s.structuralStability + dt * 0.02)
    s.environmentalSensitivity = clamp(0.8 * s.environmentalSensitivity + 0.2 * (this.temper.environmentalSensitivity ?? 0.4) * (0.5 + this.memory.airLesson))
    if (!world.moving) {
      const L = this.memory.rememberLayout(world.plan, this.t)
      L.heldFor += dt
      L.stability = clamp(0.3 + Math.min(L.heldFor, 60) / 100)
    }
    if (this.mode === 'OBSERVING') this.observe(world)
    if (this.mode === 'ALERT' && quiet > 8 && s.arousal < 0.1) this.mode = this.unbound ? 'UNBOUND' : 'DORMANT'
  }

  // THE DREAM. While he sleeps a pressure builds: faster after a restless stretch (changes,
  // hypnoses, knocks remembered from the last minute) and with curiosity. Disturbances and changes
  // of posture only pause it (he sleeps on through them); only really waking lowers it, once per
  // waking. Each second the chance that a dream begins grows with the square of that pressure,
  // drawn from his own random source: dreams come at moments no one can predict, never on a
  // timer, and nothing the player does can start or stop one. A dream can only begin while he
  // sleeps and nothing else is under way. Returns true when a dream begins.
  dreamWish(dt, { state, busy }) {
    this.dreamPressure ??= 0
    this.lastDreamAt ??= -30
    if (this.mode === 'RITUAL') {
      this.dreamPressure = 0
      return false
    }
    if (state === 'WAKING' && this.lastSleepState !== 'WAKING') this.dreamPressure *= 0.6
    this.lastSleepState = state
    if (state !== 'SLEEPING' && state !== 'SETTLING') return false
    const restless = this.memory.events.filter((e) => this.t - e.t < 60 && ['decision', 'instruction', 'wall', 'rule'].includes(e.type)).length
    this.dreamPressure = clamp(this.dreamPressure + dt * (0.01 + 0.004 * Math.min(restless, 6) + 0.01 * this.s.curiosity))
    if (state !== 'SLEEPING' || busy || this.t - this.lastDreamAt < 40) return false
    const hazard = 0.09 * this.dreamPressure ** 2 // per second
    if (this.rng() >= hazard * dt) return false
    this.lastDreamAt = this.t
    this.dreamPressure = 0
    this.memory.record(this.t, 'dream', { restless })
    return true
  }

  // A small, independent adjustment of his sleep, now and then, when nothing disturbs him.
  idleWish(dt) {
    if (this.mode === 'RITUAL') return false
    this.idleTimer -= dt
    if (this.idleTimer > 0) return false
    this.idleTimer = 22 + this.rng() * 14
    return this.s.arousal < 0.3
  }

  // ---------- EVALUATE ----------

  evaluate(world, { idle = false, instruction = false } = {}) {
    const s = this.s
    const ev = idle || instruction ? null : this.lastEvent
    const I = ev ? clamp(ev.amount, 0, 1.5) : 0
    const reps = ev?.reps ?? 0
    const L = ev?.region ? clamp(this.regionHeat[ev.region] ?? 0, 0, 2) : 0
    const A = s.arousal
    const S = s.structuralStability
    const exploit = clamp((this.memory.topEdges(1)[0]?.[1] ?? 0) / 6)
    const threat = world.protectDist != null ? clamp(1 - world.protectDist / 3) : 0
    const remembered = this.memory.bestStable(world.plan.signature()) ? 1 : 0
    const U = {
      PRESERVE_STABILITY: 0.45 + 0.35 * S - 2.2 * I - 0.8 * A,
      INVESTIGATE: 0.2 + 3 * Math.min(I, 0.18) + (reps <= 1 ? 0.25 : -0.25 * (reps - 1)) - 0.5 * A,
      // small adjustments, until the same place is touched again and again
      ADAPT: 0.1 + 0.9 * Math.min(L, 1.2) + 0.12 * Math.min(reps, 3) - 0.2 * Math.max(0, reps - 3) + exploit * (0.4 + this.temper.adaptBias),
      // repeated blows to one place, or one strong blow: he rolls over
      RECONFIGURE: -0.35 + 1.4 * A + 0.45 * Math.max(0, reps - 2) + 1.2 * Math.max(0, I - 0.3) + 0.8 * Math.max(0, L - 0.6) - 0.4 * S,
      DEFEND: s.defensiveness * (0.3 + threat) * 0.9,
      RESTORE_ORDER: (A < 0.3 ? 0.7 * (1 - S) * remembered * (0.5 + this.temper.restoreBias) : 0) + (world.rules.ruleMissing ? 1.4 : 0),
      DREAM: -1,
      EMBODY: -1,
      RELOCATE_EXIT: world.rules.relocate ? 2.5 : -1,
    }
    const sug = instruction ? this.suggestion : null
    if (sug?.embody) {
      // hypnotised with an object, he tries to take its shape; which shape, how far, on which
      // side and in which rooms is for his planner to weigh
      U.EMBODY = 3
    } else if (sug) {
      // the suggestion as context: receptive, he dreams along; contrary, he answers otherwise;
      // a suggestion of stillness makes staying still more attractive; nonsense makes him curious
      const rate = this.memory.instructionRate(sug.concepts)
      U.DREAM = (0.15 + 1.0 * sug.r * sug.strength + 0.5 * sug.k * sug.strength - 0.25 * A) * (0.6 + 0.8 * rate)
      U.PRESERVE_STABILITY += 0.9 * sug.r * sug.still
      U.RECONFIGURE += 0.5 * sug.k
      if (sug.unknown) U.INVESTIGATE += 0.35 * sug.r
    }
    if (idle) {
      // independent adjustments stay small
      U.RECONFIGURE = -1
      U.DEFEND *= 0.5
      U.INVESTIGATE = 0.3
      U.PRESERVE_STABILITY = 0.35
    }
    if (!world.rules.allowMajor) U.RECONFIGURE = -1
    if (this.unbound) {
      U.RESTORE_ORDER = -1
      U.DEFEND = -1
      U.ADAPT *= 0.5
    }
    if (!world.rules.allowMajor && U.DREAM > 0) U.DREAM *= 0.7
    for (const g of GOALS) {
      U[g] *= 0.6 + 0.8 * this.memory.rate(this.memory.goals, g)
      if (g === this.lastFamily && this.t - this.lastFamilyAt < 6 && g !== 'PRESERVE_STABILITY') U[g] -= 0.25
      U[g] += (this.rng() - 0.5) * 0.04
    }
    this.utilities = U
    return U
  }

  // ---------- DECIDE (called by the transformation controller) ----------

  decide(world, { idle = false, instruction = false } = {}) {
    // a decision closes any outcome still being watched
    if (this.mode === 'OBSERVING') this.observe(world, true)
    const U = this.evaluate(world, { idle, instruction })
    const sug = instruction ? this.suggestion : null
    this.suggestion = null // a suggestion is weighed once
    let ranked = GOALS.slice().sort((a, b) => U[b] - U[a])
    if (this.forced) {
      ranked = [this.forced, ...ranked.filter((g) => g !== this.forced)]
      this.forced = null
    }
    const ctx = this.context(world)
    ctx.suggestion = sug
    for (const goal of ranked) {
      if (goal === 'PRESERVE_STABILITY' || U[goal] <= U.PRESERVE_STABILITY - 1e-9) {
        this.candidates = []
        this.note('PRESERVE_STABILITY', 'stay still', sug ? 'he lets the suggestion pass over him' : idle ? 'nothing calls for a change' : 'the disturbance is not enough', [])
        this.currentGoal = 'PRESERVE_STABILITY'
        this.lastFamily = 'PRESERVE_STABILITY'
        if (sug) {
          const compat = compatibility(sug.concepts, Body.framesOf(world.body.pose, world.body.place), null, world.body.place)
          sug.entry.chosen = { goal: 'PRESERVE_STABILITY', action: 'stay still', pose: null, compat: +compat.toFixed(2) }
          sug.entry.outcome = { success: true, still: true }
          return { type: 'hold', goal: 'PRESERVE_STABILITY', compat, suggestion: sug }
        }
        return { type: 'hold', goal: 'PRESERVE_STABILITY' }
      }
      const cands = planActions(goal, ctx)
      this.candidates = cands.slice(0, 6).map((c) => ({ action: c.pose ? `${c.action}:${c.pose}${c.configId && c.configId !== world.house.configId ? `/${c.configId}` : ''}` : c.action, score: +c.score.toFixed(3), invalid: c.invalid }))
      const choice = cands.find((c) => (c.pose && !c.invalid) || c.action === 'twitch' || c.impossible)
      if (!choice) continue // nothing feasible for this family: try the next best
      if (choice.impossible) {
        this.lastActionOutcome = { goal, action: choice.action, success: false, reason: choice.reason }
        this.memory.learn(goal, choice.action, false)
        this.memory.record(this.t, 'failed', { goal, action: choice.action, reason: choice.reason })
        this.note(goal, choice.action, `impossible: ${choice.reason}`, choice.steps)
        if (world.rules.ruleMissing) {
          this.unbound = true
          this.mode = 'UNBOUND'
        }
        return { type: 'impossible', goal, choice }
      }
      this.currentGoal = goal
      this.lastFamily = goal
      this.lastFamilyAt = this.t
      this.lastUsed[choice.pose ? `${choice.pose}|${choice.configId}` : choice.action] = this.t
      this.previousPose = world.plan.pose
      if (sug) sug.entry.chosen = { goal, action: choice.action, pose: choice.pose ?? null, configId: choice.configId ?? null, compat: choice.compat != null ? +choice.compat.toFixed(2) : null, intensity: choice.intensity ?? null, mirror: choice.mirror ?? null }
      this.currentPlan = {
        goal,
        ...choice,
        instruction: sug?.entry ?? null,
        startedAt: this.t,
        reason: choice.reason,
        baseline: { collisions: this.recentCount(8), routeLen: world.routeLen, protectDist: world.protectDist, irritation: this.s.irritation, region: this.lastEvent?.region, heat: this.regionHeat[this.lastEvent?.region] ?? 0 },
      }
      this.mode = 'ACTING'
      this.note(goal, choice.pose ? `${choice.action} → ${choice.pose}` : choice.action, choice.reason, choice.steps)
      this.memory.record(this.t, 'decision', { goal, action: choice.action, pose: choice.pose })
      this.s.structuralStability = clamp(this.s.structuralStability - (choice.major ? 0.3 : 0.06))
      if (choice.major) this.s.arousal = clamp(this.s.arousal * 0.45)
      else this.s.arousal = clamp(this.s.arousal * 0.8)
      return { type: 'act', goal, choice, suggestion: sug, candidates: cands.slice(0, 6) }
    }
    this.note('PRESERVE_STABILITY', 'stay still', 'nothing feasible', [])
    if (sug) sug.entry.chosen = { goal: 'PRESERVE_STABILITY', action: 'stay still', pose: null, compat: null }
    return { type: 'hold', goal: 'PRESERVE_STABILITY' }
  }

  recentCount(sec) {
    return this.events.filter((e) => this.t - e.t < sec).length
  }

  context(world) {
    const best = this.memory.bestStable(world.plan.signature())
    const restoreTo = world.rules.restoreTo ?? (best ? { pose: best.plan.pose, configId: best.plan.configId, stability: best.stability } : null)
    return {
      plan: world.plan,
      house: world.house,
      body: world.body,
      occNow: world.occNow,
      protectRoute: world.protectRoute,
      focusRegion: this.lastEvent?.region ?? null,
      previousPose: this.previousPose,
      env: world.env,
      player: world.player,
      cell: world.cell,
      memory: this.memory,
      rules: world.rules,
      rng: this.rng,
      state: this.s,
      routeLen: world.routeLen,
      threat: world.protectDist != null ? clamp(1 - world.protectDist / 3) : 0,
      lastUsed: this.lastUsed,
      t: this.t,
      restoreTo,
    }
  }

  // ---------- OBSERVE and LEARN ----------

  // The transformation controller reports that the walls have come to rest.
  transformDone() {
    if (!this.currentPlan) return
    this.currentPlan.settledAt = this.t
    this.mode = 'OBSERVING'
  }

  observe(world, early = false) {
    const p = this.currentPlan
    if (!p || p.settledAt == null) return
    const window = p.major ? 7 : 4
    if (!early && this.t - p.settledAt < window) return
    const recent = this.events.filter((e) => e.t > p.settledAt).length
    const b = p.baseline
    let success
    let why
    switch (p.goal) {
      case 'INVESTIGATE':
        success = recent === 0
        why = success ? 'the disturbance stopped' : 'the disturbance went on'
        break
      case 'ADAPT':
        success = recent <= 1 || (world.routeLen ?? 0) > (b.routeLen ?? 0)
        why = success ? 'the touched part of him is left alone' : 'it was touched again'
        break
      case 'RECONFIGURE':
        success = recent <= b.collisions
        why = success ? 'his new way of lying is calmer' : 'disturbed as much as before'
        if (success) this.s.irritation = clamp(this.s.irritation - 0.2)
        break
      case 'DEFEND':
        success = world.protectDist == null || (b.protectDist ?? 0) <= world.protectDist
        why = success ? 'the player was kept away' : 'the player came closer'
        break
      case 'DREAM':
        success = recent <= b.collisions
        why = success ? 'the dream settled him' : 'he was disturbed again'
        break
      case 'RELOCATE_EXIT':
        success = recent <= b.collisions
        why = success ? 'the exit moved; he is left alone' : 'disturbed even so'
        break
      case 'RESTORE_ORDER':
        success = world.plan.pose === p.pose && (!p.configId || world.plan.configId === p.configId)
        why = success ? 'the old shape holds' : 'he could not return'
        break
      default:
        success = recent === 0
        why = ''
    }
    const unstable = !!world.lastRelocation && world.lastRelocation > p.startedAt
    if (p.instruction) {
      // what came of the suggestion: did he settle, did the player get closer to a way out
      p.instruction.outcome = { success: success && !unstable, closer: world.routeLen != null && b.routeLen != null ? world.routeLen < b.routeLen : null, disturbedAfter: recent }
    }
    this.memory.learn(p.goal, p.action, success && !unstable, unstable)
    this.lastActionOutcome = { goal: p.goal, action: p.action, success: success && !unstable, reason: unstable ? 'the player had to be moved: too violent' : why }
    this.memory.record(this.t, 'outcome', { goal: p.goal, action: p.action, success: success && !unstable })
    this.currentPlan = null
    this.mode = this.unbound ? 'UNBOUND' : this.s.arousal > 0.2 ? 'ALERT' : 'DORMANT'
  }

  note(goal, action, reason, steps) {
    this.decisionLog.push({ t: +this.t.toFixed(1), goal, action, reason, steps })
    if (this.decisionLog.length > 12) this.decisionLog.shift()
  }

  ritual() {
    this.mode = 'RITUAL'
    this.currentPlan = null
    this.s.arousal = 0
    this.s.irritation = 0
    this.note('RESTORE_ORDER', 'ritual', 'the circuit was walked; the first posture returns', [])
  }

  focusRegion() {
    return this.lastEvent?.region ?? null
  }

  inspect() {
    const m = this.memory
    return {
      mode: this.mode,
      unbound: this.unbound,
      goal: this.currentGoal,
      state: Object.fromEntries(Object.entries(this.s).map(([k, v]) => [k, +v.toFixed(2)])),
      utilities: Object.fromEntries(Object.entries(this.utilities).map(([k, v]) => [k, +v.toFixed(2)])),
      plan: this.currentPlan ? { goal: this.currentPlan.goal, action: this.currentPlan.action, pose: this.currentPlan.pose, steps: this.currentPlan.steps, reason: this.currentPlan.reason } : null,
      candidates: this.candidates,
      lastOutcome: this.lastActionOutcome,
      lastEvent: this.lastEvent,
      decisions: this.decisionLog.slice(-6),
      events: m.events.slice(-8),
      habits: m.topEdges(3).map(([e, v]) => `${e} ×${v.toFixed(1)}`),
      regions: Object.fromEntries(Object.entries(this.regionHeat).filter(([, v]) => v > 0.02).map(([k, v]) => [k, +v.toFixed(2)])),
      focus: this.focusRegion(),
      layouts: m.layouts.map((l) => ({ id: l.id, stability: +l.stability.toFixed(2), heldFor: Math.round(l.heldFor) })),
      goalRates: Object.fromEntries(GOALS.map((g) => [g, +m.rate(m.goals, g).toFixed(2)])),
      airLesson: +m.airLesson.toFixed(2),
      instructions: m.instructions.slice(-5).map((e) => ({ text: e.text, concepts: e.concepts, receptivity: e.receptivity, contrariness: e.contrariness, repeats: e.repeats, chosen: e.chosen, outcome: e.outcome })),
    }
  }
}
