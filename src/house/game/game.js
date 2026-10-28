// THE GAME — four separate systems, and the one chain that connects them:
//
//   PLAYER PHYSICS        the ball rolls, is pushed by the air, collides with walls that stay put
//   DISTURBANCE SYSTEM    a collision becomes an event: where, how hard, which grid cell, which
//                         region of his body; it lights that region and spreads
//   HIS MIND (agent)      the event raises his state; when the house is idle he decides: stay
//                         still, twitch, adjust a limb, roll, stretch, return to a stable pose
//   TRANSFORMATION        executes his decision: his body moves to the new posture and the walls
//                         bound to it glide to their new places. Nothing else ever moves a wall.
//
// The transformation controller:   IDLE → DISTURBED → DECIDING → TRANSFORMING → SETTLING → IDLE
// Disturbances that arrive while he is moving are queued and handled once the house is idle.
// HYPNOTIC INSTRUCTIONS: a spoken (or typed) instruction is classified into concepts and handed
// to his mind as a suggestion (instruct). After a moment of interpretation his planner decides
// with it as one input among the others; the controller then executes whatever he chose.
// HYPNOSIS ("You are a lamp stand"): the object is found and read as attributes; postures that
// embody it are composed (body/embody.js) and his planner chooses one (or none). He then takes it
// in three stages, "I AM A LAMP STAND" each time, the walls following his body at every stage.
// THREE DISTURBANCES: severe knocks, bursts of knocks, forceful or nagging instructions count;
// at the third he is irritated and his planner moves the exit with the rooms around it.
// No browser APIs here; scripts/house-sim-test.mjs plays it headlessly.

import { LAYOUTS } from '../world/layouts.js'
import { House, COLS, ROWS, RES, SHELL_T, wallEnds } from '../world/house.js'
import { Environment } from '../world/environment.js'
import { createPlayer, stepPlayer, collide, overlapping, PLAYER_RADIUS, MAX_SPEED } from '../world/physics.js'
import { Body, POSES, REGION_LABEL, SENSITIVITY, distToSegment } from '../body/body.js'
import { HouseAgent } from '../agent/agent.js'
import { AgentMemory } from '../agent/memory.js'
import { STAGES, LINES } from './stages.js'
import { createRng } from '../../sleeping/sim/rng.js'
import { classify } from '../voice/classify.js'
import { parseInstruction, article } from '../voice/objects.js'
import { comparePlans } from '../world/plan.js'
import { Dream } from './dream.js'
import { pickArchitect } from '../dream3d/architects.js'
import { predict } from '../agent/planner.js'
import { embodimentCandidates, stagePose, affectedRegions, forgetPoses } from '../body/embody.js'

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const P = ([x, y]) => ({ x, y })
// his sleep: below this he sleeps (and snores); a posture change from sleep wakes him
const SLEEP_BELOW = 0.22
const SLEEP_QUIET = 2.5 // seconds without a disturbance before he falls asleep again

// Where a point goes when the grid lines move from L0 to L1: it keeps its place within its bay,
// so a room that moves carries what is in it, and a room that shrinks draws it along.
function carryAlong(v, L0, L1) {
  const n = L0.length - 1
  if (v <= L0[0] || v >= L0[n]) return v
  let i = 0
  while (i < n - 1 && v >= L0[i + 1]) i++
  const u = (v - L0[i]) / (L0[i + 1] - L0[i])
  return L1[i] + u * (L1[i + 1] - L1[i])
}

// How much a knock disturbs him, before his tolerance and the region's sensitivity.
export function knockAmount(speed, kind, recent) {
  let a = 0.05 * speed ** 1.4 * (1 + 0.35 * Math.min(recent, 6))
  if (kind === 'rule') a *= 1.5
  return a
}

export class Game {
  constructor({ stage = 0, seed = Date.now() % 100000, persistMemory = false } = {}) {
    this.seed = seed
    this.rng = createRng(seed)
    this.events = []
    this.time = 0
    this.trails = {}
    this.ending = null
    this.seen = new Set()
    this.agent = new HouseAgent({ rng: () => this.rng.next(), memory: new AgentMemory({ persist: persistMemory }) })
    this.body = null
    this.startStage(stage)
  }

  emit(type, data = {}) {
    this.events.push({ ...data, type, time: this.time })
  }

  drain() {
    const e = this.events
    this.events = []
    return e
  }

  say(key, text) {
    this.emit('message', { key, text })
  }

  once(key, text = LINES[key]) {
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.say(key, text)
  }

  get stageDef() {
    return STAGES[this.stageIndex]
  }

  // ---------- stages ----------

  startStage(i) {
    const def = STAGES[i]
    this.stageIndex = i
    const L = LAYOUTS[def.layout]
    this.layout = L
    const place = { x: L.body.x, y: L.body.y, rot: L.body.rot, scale: L.body.scale }
    const pose = this.body && i < 2 ? this.body.pose : L.body.pose
    this.body = new Body({ pose, place, cols: COLS, rows: ROWS })
    // the plan is bound to him as he lies at the start; a posture carried over from the stage before
    // puts the lines where that posture holds them, in the organisation the house had reached
    const config = this.house && i < 2 ? this.house.configId : L.configs[0]
    this.house = new House(L, Body.framesOf(L.body.pose, place), { config })
    this.house.regionAt = (x, y) => this.body.region[Math.floor(y) * COLS + Math.floor(x)] ?? null
    const plan = this.house.planFor(this.body.restFrames(), config)
    this.house.X = plan.X
    this.house.Y = plan.Y
    this.house.derive()
    this.env = new Environment({ wind: L.wind, sun: L.sun })
    this.niches = (L.niches ?? []).map(([x, y, order]) => ({ x, y, order }))
    let start = P(L.start)
    const occ = this.house.rasterise(null, { doorsShut: false })
    if (!this.house.freeAt(occ, start)) start = this.house.nearestFree(occ, start) ?? start
    this.player = createPlayer(0, 0)
    this.player.x = start.x
    this.player.y = start.y
    this.start = { ...start }
    this.agent.setTemperament(def.temper)
    this.agent.mode = 'DORMANT'
    this.agent.currentPlan = null
    this.carry = null
    this.status = 'playing'
    this.shifts = 0
    this.spoiled = false
    this.recent = []
    this.trail = []
    this.trailTimer = 0
    this.nicheNext = 1
    this.cracks = 0
    this.crackMarks = []
    this.lastCrack = -1
    this.system = 'running' // running | restoring | restored | interrupted
    this.stillTime = 0
    this.holdTilt = null
    this.holding = false
    this.pulseTimer = 0
    this.dwell = 0
    this.dwellCell = null
    this.lastRelocation = null
    this.cacheTimer = 0
    this.envTimer = 0
    this.reachableDoors = null
    // the transformation controller, and the record of the chain for the diagnostic panel
    this.tx = { state: 'IDLE', since: 0, pending: false, after: null, major: false }
    // his sleep, for the snoring and the floating Zs: SLEEPING · DISTURBED · WAKING · TRANSFORMING · SETTLING
    this.sleep = { state: 'SLEEPING', since: this.time, awake: false }
    this.lastDisturbAt = -99
    this.carried = { x: 0, y: 0 }
    // the hypnotic instruction being interpreted, and the hidden count of significant disturbances
    this.hypno = null
    this.irk = { count: 0, last: -99, burstAt: -99, log: [] }
    this.relocatePending = null
    this.relocateRetryAt = 0
    this.trance = null // the three stages of an embodiment under hypnosis
    this.dream = null // his dream, when he has one (dream.js)
    this.lines = LINES
    this.chain = { collision: null, cell: null, region: null, regionLevel: 0, decision: null, requested: null, completed: null }
    this.setDoors()
    this.env.recompute(this.house)
    this.refreshCache()
    this.hintQueue =
      def.id === 'question'
        ? [
            [this.time + 3, 'sealed'],
            [this.time + 7, 'circuit'],
            [this.time + 12, 'oldestWall'],
          ]
        : []
    this.emit('stageStart', { stage: i, id: def.id })
  }

  door(id) {
    return this.house.doors.find((d) => d.id === id)
  }

  setDoors() {
    const id = this.stageDef.id
    for (const d of this.house.doors) {
      let open
      if (id === 'obey') open = !this.spoiled
      else if (id === 'adapt') open = this.shifts >= this.stageDef.minShifts
      else if (d.id === 'sealed') open = true // the oldest wall seals it, not a door leaf
      else open = this.system === 'restored' && this.tx.state === 'IDLE'
      if (this.dream) open = false // the dream holds the house: only the anchor settles it
      if (d.open !== open) this.house.setDoorOpen(d.id, open)
    }
  }

  get doorOpen() {
    return this.house.doors.some((d) => d.open && (d.id !== 'sealed' || this.system === 'interrupted'))
  }

  playerCell() {
    return { c: Math.floor(this.player.x), r: Math.floor(this.player.y) }
  }

  exitDoors() {
    const id = this.stageDef.id
    if (id === 'question') {
      if (this.system === 'interrupted') return [this.door('sealed')]
      if (this.system === 'restored') return [this.door('old')]
      return []
    }
    return this.house.doors
  }

  rules() {
    const id = this.stageDef.id
    const ruleMissing = id === 'question' && this.system === 'interrupted'
    const sealedDoor = id === 'question' ? this.door('sealed') : null
    return {
      doors: this.exitDoors(),
      sealed: id === 'question' && this.system === 'running',
      sealedDoor: id === 'question' && this.system === 'running' ? sealedDoor : null,
      mustReach: id === 'question' && this.system === 'running' ? this.niches.filter((n) => n.order >= this.nicheNext) : null,
      protect: id === 'adapt' && !this.doorOpen ? this.nearestDoor() : id === 'question' ? sealedDoor : null,
      allowMajor: this.system === 'running' || this.system === 'interrupted',
      ruleMissing,
      relocate: this.relocatePending,
      restoreTo: ruleMissing ? { pose: this.layout.body.pose, configId: this.layout.configs[0], stability: 1 } : null,
    }
  }

  nearestDoor() {
    let best = null
    for (const d of this.house.doors) {
      const r = this.reachRoute?.get(d.id) ?? -1
      if (r >= 0 && (!best || r < best.r)) best = { d, r }
    }
    return best?.d ?? this.house.doors[0]
  }

  refreshCache() {
    this.occNow = this.house.rasterise(null, { doorsShut: false })
    this.distNow = this.house.distances(this.occNow, this.player)
    this.reachRoute = new Map(this.house.doors.map((d) => [d.id, this.house.routeTo(this.distNow, d)]))
  }

  world() {
    const p = this.player
    const cell = this.playerCell()
    const rules = this.rules()
    const routes = rules.doors.map((d) => this.house.routeTo(this.distNow, d)).filter((r) => r >= 0)
    const protect = rules.protect
    return {
      plan: { pose: this.body.pose, configId: this.house.configId, signature: () => `${this.body.pose}|${this.house.configId}` },
      house: this.house,
      body: this.body,
      moving: this.tx.state !== 'IDLE',
      env: this.env,
      player: { x: p.x, y: p.y, r: PLAYER_RADIUS },
      cell,
      rules,
      routeLen: routes.length ? Math.min(...routes) : null,
      protectDist: protect ? Math.abs(cell.c - Math.floor(protect.mid.x - protect.out.x * 0.5)) + Math.abs(cell.r - Math.floor(protect.mid.y - protect.out.y * 0.5)) : null,
      protectRoute: protect ? this.house.routeTo(this.distNow, protect) : null,
      occNow: this.occNow,
      dwell: this.dwell,
      lastRelocation: this.lastRelocation,
    }
  }

  // ---------- DISTURBANCE SYSTEM ----------

  // A disturbance at a point: grid cell → body region → his mind. Returns what it reached.
  disturb(x, y, amount, kind) {
    this.lastDisturbAt = this.time
    const c = Math.floor(x)
    const r = Math.floor(y)
    const { region } = this.body.strike(x, y, amount)
    const air = this.env.airAt(this.player.x, this.player.y)
    const airy = Math.hypot(air.x, air.y) > 0.25
    const applied = this.agent.perceive({ amount: amount * (SENSITIVITY[region] ?? 1), kind, at: { x, y }, cell: { c, r }, region, airy })
    this.chain.cell = `${c},${r}`
    this.chain.region = region
    this.chain.regionLevel = +(this.agent.regionHeat[region] ?? 0).toFixed(2)
    // the controller takes it from here
    if (this.tx.state === 'IDLE') this.setTx('DISTURBED')
    else this.tx.pending = true
    return { region, applied, airy }
  }

  noise(intensity) {
    if (this.status !== 'playing') return 0
    const { applied, region } = this.disturb(this.player.x, this.player.y, 0.06 + 0.2 * clamp(intensity), 'noise')
    this.emit('noise', { intensity, amount: applied, region })
    return applied
  }

  shake(intensity) {
    if (this.status !== 'playing' || this.holding) return 0
    const { applied } = this.disturb(this.player.x, this.player.y, 0.05 + 0.1 * clamp(intensity), 'shake')
    this.emit('shake', { intensity, amount: applied })
    return applied
  }

  knock(imp) {
    const t = this.time
    this.recent = this.recent.filter((x) => t - x < 4)
    const amount = this.status === 'playing' ? knockAmount(imp.speed, imp.kind, this.recent.length) : 0
    this.recent.push(t)
    const hit = amount ? this.disturb(imp.x, imp.y, amount, imp.kind === 'rule' ? 'rule' : 'wall') : { region: null, applied: 0 }
    const danger = hit.applied >= 0.1
    // significant disturbances: one severe knock, or a burst of knocks
    // (strikes on the oldest wall are their own reckoning: they crack it)
    if (imp.kind !== 'rule') {
      if (hit.applied >= 0.25) this.qualify('a severe knock')
      else if (this.recent.length >= 4 && t - this.irk.burstAt > 6) {
        this.irk.burstAt = t
        this.qualify('repeated knocks')
      }
    }
    if (imp.wall) imp.wall.struck = this.time
    this.chain.collision = { t: +t.toFixed(1), x: +imp.x.toFixed(2), y: +imp.y.toFixed(2), speed: +imp.speed.toFixed(2), wall: imp.wall?.id ?? null, amount: +hit.applied.toFixed(3) }
    this.emit('collision', { x: imp.x, y: imp.y, speed: imp.speed, kind: imp.kind, amount: hit.applied, danger, airy: hit.airy, region: hit.region })
    if (hit.applied > 0.03 && hit.region) this.once('firstKnock', LINES.firstKnock(REGION_LABEL[hit.region]))
    if (imp.kind === 'rule' && imp.speed > 1.5 && t - this.lastCrack > 0.5 && this.system === 'running') {
      this.lastCrack = t
      this.cracks++
      this.crackMarks.push({ x: imp.x, y: imp.y })
      this.say('crack', LINES.crack(this.cracks))
      this.emit('crack', { count: this.cracks, x: imp.x, y: imp.y })
      if (this.cracks >= 3) this.interrupt()
    }
  }

  // ---------- TRANSFORMATION CONTROLLER ----------

  setTx(state) {
    this.tx.state = state
    this.tx.since = this.time
    this.txHistory = [...(this.txHistory ?? []).slice(-30), state]
  }

  controller(dt) {
    const tx = this.tx
    switch (tx.state) {
      case 'IDLE':
        if (this.relocatePending && this.time >= this.relocateRetryAt && this.status === 'playing') {
          this.setTx('DISTURBED')
        } else if (this.hypno?.phase === 'interpreting' && this.time >= this.hypno.decideAt) {
          this.setTx('DECIDING')
          if (this.hypno.object) this.emit('hypno', { phase: 'deciding' })
          this.decideNow(false, { instruction: true })
        } else if (tx.pending) {
          tx.pending = false
          this.setTx('DISTURBED')
        } else if (this.status === 'playing' && this.agent.idleWish(dt)) {
          this.setTx('DECIDING')
          this.decideNow(true)
        }
        break
      case 'DREAM':
        // the dream moves the house itself (dream.js); knocks wait until it is over
        break
      case 'DECIDING':
        // he has chosen a shape: a breath, then the first "I am …"
        if (this.trance && this.trance.k === 0 && this.time >= this.trance.startAt) this.tranceStage(1)
        break
      case 'DISTURBED':
        // a short moment, so that a burst of knocks is decided on together
        if (this.time - tx.since > 0.25) {
          this.setTx('DECIDING')
          this.decideNow(false)
        }
        break
      case 'TRANSFORMING': {
        const X0 = this.house.X.slice()
        const Y0 = this.house.Y.slice()
        this.house.update(dt, null)
        this.carryPlayer(X0, Y0)
        this.envTimer -= dt
        if (this.envTimer <= 0) {
          this.envTimer = 1
          this.env.recompute(this.house)
        }
        if (!this.house.transforming && !this.body.moving) {
          if (this.trance && this.trance.k > 0 && this.trance.k < 3) this.tranceStage(this.trance.k + 1)
          else if (tx.after) {
            // the second half of a twitch: back to where he was
            const next = tx.after
            tx.after = null
            this.house.begin(next.target, { duration: next.duration, focus: next.focus, label: 'twitch, back' })
          } else this.setTx('SETTLING')
        }
        break
      }
      case 'SETTLING':
        if (this.time - tx.since > 0.5) {
          this.settled()
          this.setTx('IDLE')
        }
        break
      default:
        break
    }
    this.holding = (tx.state === 'TRANSFORMING' || tx.state === 'SETTLING') && tx.major
  }

  decideNow(idle, { instruction = false } = {}) {
    // settled into the ritual, he no longer answers
    if (this.agent.mode === 'RITUAL') {
      if (instruction) this.hypnoReact('still')
      this.setTx('IDLE')
      return
    }
    // knocks that arrived while he was about to decide are part of this decision
    this.tx.pending = false
    // a waiting instruction joins this decision once its moment of interpretation has passed
    if (!instruction && this.hypno?.phase === 'interpreting' && this.time >= this.hypno.decideAt) instruction = true
    const relocating = !!this.relocatePending && !instruction
    if (relocating) this.agent.forced = 'RELOCATE_EXIT'
    const decision = this.agent.decide(this.world(), { idle, instruction })
    this.chain.decision = {
      t: +this.time.toFixed(1),
      goal: decision.goal,
      action: decision.choice ? (decision.choice.pose ? `${decision.choice.action} → ${POSES[decision.choice.pose]?.label}` : decision.choice.action) : 'stay still',
      reason: decision.choice?.reason ?? 'not enough to move him',
      idle,
    }
    this.emit('decision', this.chain.decision)
    if (instruction && this.chain.hypnosis && !this.chain.hypnosis.decision) {
      const h = this.chain.hypnosis
      const c = decision.choice
      h.decision = decision.type === 'act' ? { goal: decision.goal, action: c.action, pose: c.pose ? POSES[c.pose]?.label : null, reason: c.reason } : { goal: decision.goal, action: 'stay still', pose: null, reason: 'no shape he could take here' }
      h.candidates = (decision.candidates ?? []).map((x) => ({ pose: POSES[x.pose]?.label ?? x.action, rooms: x.configId, score: +x.score.toFixed(2), fit: x.compat != null ? +x.compat.toFixed(2) : null, invalid: x.invalid ?? null }))
      if (decision.type === 'act' && c.action === 'embody') {
        h.targetPose = POSES[c.pose].label
        h.intensity = c.intensity
        h.config = c.configId
        h.regions = affectedRegions(this.body.pose, c.pose)
        h.decision.reason = `${h.object}: ${Object.entries(h.attributes).filter(([, v]) => v >= 0.3).map(([k]) => k).join(', ')} → ${POSES[c.pose].label}; fit ${c.compat?.toFixed(2)}, degree ${Math.round(c.intensity * 100)}% (his receptivity ${h.receptivity}), ${c.configId === this.house.configId ? 'same rooms' : `rooms → ${this.house.cfgs.get(c.configId).label}`} (affinity ${c.affinity?.toFixed(2)})`
        // keep only the posture he chose; the others were only candidates
        forgetPoses(new Set([this.body.pose, c.pose, ...this.agent.memory.instructions.map((e) => e.chosen?.pose).filter(Boolean)]))
        this.trance = { before: { cfg: this.house.cfg, X: this.house.X.slice(), Y: this.house.Y.slice() }, bodyPlan: !!c.bodyPlan, k: 0, startAt: this.time + 0.8, from: this.body.pose, target: c.pose, configId: c.configId, object: h.object, major: !!c.major, seq: (this.trance?.seq ?? 0) + 1, walls: [], lines: 0 }
        this.tx.major = false
        this.relocatePending = relocating ? this.relocatePending : this.relocatePending
        return
      }
      h.result = { done: false, why: decision.type === 'act' ? 'he answered otherwise' : 'he could not take that shape here' }
    }
    if (instruction) {
      // the spirals react to his choice (they never announce it beforehand)
      const compat = decision.type === 'act' ? decision.choice.compat : null
      const kind = decision.type !== 'act' ? 'still' : compat == null ? 'reinterpret' : compat > 0.2 ? 'follow' : compat < -0.2 ? 'contrary' : 'reinterpret'
      if (this.chain.instruction) this.chain.instruction.response = kind
      this.hypnoReact(kind)
    }
    if (relocating && decision.choice?.action !== 'relocate') this.relocateRetryAt = this.time + 3 // no feasible move yet: he tries again
    if (decision.type === 'impossible') {
      this.emit('agentFailed', { goal: decision.goal, reason: decision.choice.reason })
      if (this.stageDef.id === 'question' && this.system === 'interrupted') this.once('cannotRestore')
      this.setTx('IDLE')
      return
    }
    if (decision.type !== 'act') {
      this.setTx('IDLE')
      return
    }
    const c = decision.choice
    if (c.action === 'twitch') this.twitch(c.region)
    else this.repose(c.pose, { major: !!c.major, action: c.action, goal: decision.goal, configId: c.configId, exits: c.exits })
    if (c.action === 'relocate') {
      this.relocatePending = null
      this.irk.count = 0
      this.emit('exitMoving', { id: c.exits.find((e) => e.id === this.chain.relocating)?.id ?? null })
      this.say('exitMoving', LINES.exitMoving)
    }
  }

  // ---------- HYPNOTIC INSTRUCTIONS ----------

  // An instruction, spoken (and recognised on this device) or typed. Only its words are used.
  instruct(text, { source = 'typed', loudness = 0 } = {}) {
    if (this.status !== 'playing' || !String(text).trim()) return null
    const c = classify(text)
    // a raised voice makes an instruction forceful; it cannot make it mean anything
    const forceful = clamp(c.forceful + (loudness > 0.5 ? (loudness - 0.5) * 1.2 : 0))
    const landed = this.agent.perceiveInstruction({ text: c.text, concepts: c.concepts, forceful })
    if (forceful >= 0.3) this.lastDisturbAt = this.time
    this.chain.instruction = { t: +this.time.toFixed(1), text: c.text, concepts: c.concepts, source, receptivity: +landed.receptivity.toFixed(2), contrariness: +landed.contrariness.toFixed(2), repeats: landed.repeats, response: null }
    this.emit('instruction', { text: c.text, concepts: c.concepts, source, forceful })
    if (landed.ignored) {
      this.hypnoReact('still')
      return { ...c, ...landed }
    }
    this.hypno = { phase: 'interpreting', since: this.time, decideAt: this.time + 1.6 }
    this.emit('hypno', { phase: 'interpreting' })
    if (landed.disruptive) this.qualify(forceful >= 0.6 ? 'a forceful instruction' : 'a repeated instruction')
    return { ...c, ...landed }
  }

  hypnoReact(kind) {
    this.hypno = { phase: 'reacting', kind, since: this.time }
    this.emit('hypno', { phase: 'reacting', kind })
  }

  // ---------- HYPNOSIS: "YOU ARE A …" ----------

  // The words of a hypnotic instruction (recognised on this device, or typed). Returns the parsed
  // instruction; { ok: false, error } if it does not say "You are …" with an object he can picture.
  hypnotize(text, { source = 'typed', loudness = 0 } = {}) {
    const parsed = parseInstruction(text)
    if (!parsed.ok) {
      this.chain.hypnosis = { t: +this.time.toFixed(1), sentence: parsed.sentence, source, error: parsed.error }
      return parsed
    }
    if (this.status !== 'playing') return { ...parsed, ok: false, error: 'The game is not running.' }
    if (this.trance || this.hypno?.phase === 'interpreting') return { ...parsed, ok: false, error: 'He is still under the last suggestion.' }
    if (this.dream) return { ...parsed, ok: false, error: 'He is dreaming. Reach the ANCHOR first.' }
    const forceful = clamp(classify(text).forceful + (loudness > 0.5 ? (loudness - 0.5) * 1.2 : 0))
    const landed = this.agent.perceiveInstruction({ text: parsed.sentence, object: parsed.object, concepts: parsed.concepts, forceful })
    this.chain.hypnosis = {
      t: +this.time.toFixed(1),
      sentence: parsed.sentence,
      object: parsed.object,
      source,
      attributes: Object.fromEntries(Object.entries(parsed.attributes).map(([k, v]) => [k, +v.toFixed(2)])),
      read: parsed.source,
      currentPose: POSES[this.body.pose]?.label ?? this.body.pose,
      receptivity: +landed.receptivity.toFixed(2),
      contrariness: +landed.contrariness.toFixed(2),
      repeats: landed.repeats,
      decision: null,
      stage: 0,
    }
    this.emit('instruction', { text: parsed.sentence, concepts: parsed.concepts, source, object: parsed.object, forceful })
    if (landed.ignored) {
      this.chain.hypnosis.result = { done: false, why: 'settled in the ritual, he no longer listens' }
      this.hypnoReact('still')
      return { ...parsed, ...landed }
    }
    // the postures that would embody it, from where he lies now; his planner will choose
    const variants = embodimentCandidates(parsed.object, parsed.attributes, this.body.pose, this.body.place)
    this.agent.suggestion.embody = { object: parsed.object, attributes: parsed.attributes, variants }
    this.hypno = { phase: 'interpreting', since: this.time, decideAt: this.time + 1.4, object: parsed.object }
    this.emit('hypno', { phase: 'interpreting' })
    if (landed.disruptive) this.qualify(forceful >= 0.6 ? 'a forceful instruction' : 'a repeated instruction')
    return { ...parsed, ...landed }
  }

  // One stage of the embodiment: a third of the way, then two thirds, then the whole shape. Each
  // moves his body and, through the plan, the walls bound to it.
  tranceStage(k) {
    const tr = this.trance
    const pose = k === 3 ? tr.target : stagePose(`trance:${tr.seq}:${k}`, tr.from, tr.target, k / 3).id
    // 1st: his body begins to move and the grid lines bound to it follow; 2nd: the house is drawn
    // from his body at two thirds of the way (the outline begins to take the object's shape);
    // 3rd: drawn from the whole posture, and settles. Each drawn around where the player is now.
    let configId = this.house.configId
    if (k >= 2) {
      const ctx = this.agent.context(this.world())
      const frames = Body.framesOf(pose, this.body.place)
      const options = []
      if (tr.bodyPlan) options.push(this.house.bodyConfig(`body:${tr.object.replace(/\s+/g, '-')}:${tr.seq}:${k}`, frames, { player: this.player }))
      options.push(tr.configId, this.house.configId)
      // the first that is a valid plan in which the player can still reach a way out (a wall
      // arriving beside the player eases it into its own bay); never an unchecked one
      const usable = options.filter(Boolean)
      configId = usable.find((id) => predict(ctx, pose, id, { push: true }).ok) ?? usable.find((id) => this.house.validatePlan(this.house.planFor(frames, id)).ok) ?? this.house.configId
    }
    const dur = 2.6
    this.body.to(pose, dur)
    const target = this.house.planFor(Body.framesOf(pose, this.body.place), configId)
    const s = this.house.begin(target, { duration: dur, focus: this.focus(), label: `${POSES[pose].label}` })
    tr.k = k
    tr.walls.push(s.moved)
    tr.lines += s.lines
    this.tx.kind = 'posture'
    this.tx.moved = s.moved
    this.tx.major = false // he is entranced: the player is not asked to freeze
    this.tx.dream = this.agent.s.irritation < 0.5
    this.tx.after = null
    if (k === 1) {
      this.shifts++ // a change of posture like any other (stage II counts them)
      if (tr.major && this.stageDef.id === 'obey' && this.system === 'running') {
        this.spoiled = true
        this.say('spoiled', LINES.spoiled)
      }
    }
    const words = `I AM ${article(tr.object)} ${tr.object.toUpperCase()}.`
    const h = this.chain.hypnosis
    if (h) {
      h.stage = k
      h.stages = [...(h.stages ?? []), { k, pose: POSES[pose].label, walls: s.moved, lines: s.lines, rooms: configId }]
    }
    this.chain.requested = { t: +this.time.toFixed(1), kind: 'hypnosis', label: `${words} (${k}/3) · ${POSES[pose].label}`, walls: s.moved, lines: s.lines, topology: s.topology }
    this.chain.completed = null
    this.setTx('TRANSFORMING')
    this.emit('trance', { k, words, object: tr.object, pose, walls: s.moved })
    this.emit('hypno', { phase: `say${k}` })
  }

  finishTrance() {
    const tr = this.trance
    this.trance = null
    for (let k = 1; k <= 2; k++) delete POSES[`trance:${tr.seq}:${k}`]
    const h = this.chain.hypnosis
    const valid = this.house.validatePlan({ X: this.house.X, Y: this.house.Y, configId: this.house.configId }).ok
    const routes = this.exitDoors().map((d) => this.reachRoute.get(d.id)).filter((r) => r >= 0)
    const change = comparePlans(tr.before.cfg, tr.before.X, tr.before.Y, this.house.cfg, this.house.X, this.house.Y)
    if (h) h.result = { done: true, change, pose: POSES[this.body.pose]?.label, rooms: this.house.configId, wallsMoved: tr.walls, linesMoved: tr.lines, validPlan: valid, routeToExit: routes.length ? +Math.min(...routes).toFixed(1) : null }
    this.hypno = { phase: 'fading', since: this.time }
    this.emit('hypno', { phase: 'fading' })
    this.emit('tranceDone', { object: tr.object, pose: this.body.pose })
    // the door that shut while he moved (stage I) opens again now that he has settled, as after
    // any change of posture (the stages of a hypnosis do not ask the player to freeze, so the
    // ordinary "major change settled" path does not run for them)
    if (this.spoiled && this.stageDef.id === 'obey') {
      this.spoiled = false
      this.say('returned', LINES.returned)
    }
  }

  // ---------- THREE DISTURBANCES ----------

  qualify(kind) {
    if (this.status !== 'playing' || this.relocatePending || this.agent.mode === 'RITUAL') return
    if (this.time - this.irk.last < 1.5) return // one burst counts once
    this.irk.last = this.time
    this.irk.count++
    this.irk.log = [...this.irk.log.slice(-8), { t: +this.time.toFixed(1), kind }]
    this.emit('irk', { count: this.irk.count, kind })
    if (this.irk.count >= 3) this.irritated()
  }

  // Which exit he moves: the one the player is making for.
  relocateTarget() {
    const id = this.stageDef.id
    if (id === 'obey') return 'north'
    if (id === 'adapt') return this.nearestDoor()?.id ?? null
    if (this.system === 'interrupted') return 'sealed'
    if (this.system === 'restored') return null
    return 'old'
  }

  irritated() {
    const id = this.relocateTarget()
    this.irk.count = 0
    if (!id) return
    this.agent.s.irritation = Math.max(this.agent.s.irritation, 0.8)
    this.agent.s.arousal = Math.max(this.agent.s.arousal, 0.7)
    this.relocatePending = id
    this.chain.relocating = id
    this.relocateRetryAt = this.time
    this.emit('irritated', { exit: id })
    this.say('irritated', LINES.irritated)
    if (this.hypno) {
      // the trance breaks off
      this.hypno = { phase: 'broken', since: this.time }
      this.emit('hypno', { phase: 'broken' })
      this.agent.suggestion = null
    }
    if (this.tx.state !== 'IDLE') this.tx.pending = true
  }

  // Where the change starts: the place of the last disturbance (lines nearer it move first).
  focus() {
    const at = this.agent.lastEvent?.at
    return at ? { x: at.x, y: at.y } : { x: this.player.x, y: this.player.y }
  }

  // A local flinch: only the part of him that was touched moves, so only the grid lines bound to
  // it shift (the rooms over it grow or shrink a little), then they come back.
  twitch(region) {
    const deg = (this.rng.next() < 0.5 ? -1 : 1) * 16
    const focus = this.focus()
    let out = this.house.planFor(this.body.twitchFrames(region, deg))
    if (!this.house.validatePlan(out).ok) out = this.house.planFor(this.body.twitchFrames(region, -deg))
    const back = { X: this.house.X.slice(), Y: this.house.Y.slice(), configId: this.house.configId }
    const s = this.house.validatePlan(out).ok ? this.house.begin(out, { duration: 0.8, focus, label: `${region} twitches` }) : { moved: 0 }
    this.tx.after = s.moved ? { target: back, duration: 1.0, focus } : null
    this.tx.kind = 'twitch'
    this.tx.dream = false
    this.tx.moved = s.moved
    this.tx.major = false
    this.body.flinch(region, deg)
    this.chain.requested = { t: +this.time.toFixed(1), kind: 'twitch', label: `his ${REGION_LABEL[region] ?? region} twitches`, walls: s.moved }
    this.chain.completed = null
    this.setTx('TRANSFORMING')
    this.emit('twitch', { region, walls: s.moved })
  }

  // A change of posture: his body and the walls bound to it move together.
  // The plan follows: its lines move to where the new posture holds them and, for a large change,
  // the rooms pass to another organisation (configId).
  repose(pose, { major = false, action = 'repose', goal = '', configId = this.house.configId, exits = null } = {}) {
    const from = this.body.pose
    const fromConfig = this.house.configId
    const dur = major ? 5.5 : 3.4
    this.body.to(pose, dur)
    const target = this.house.planFor(Body.framesOf(pose, this.body.place), configId, exits)
    // answering a suggestion calmly, he turns in his sleep without waking
    this.tx.dream = goal === 'DREAM' && this.agent.s.irritation < 0.5
    const s = this.house.begin(target, { duration: dur, focus: this.focus(), label: POSES[pose].label })
    this.tx.moved = s.moved
    this.tx.kind = 'posture'
    this.tx.major = major
    this.tx.after = null
    this.holdTilt = null
    // every change of posture counts (stage II opens its doors after two)
    this.shifts++
    if (major) {
      this.say('reform', LINES.reform)
      if (this.stageDef.id === 'obey' && this.system === 'running') {
        this.spoiled = true
        this.say('spoiled', LINES.spoiled)
      }
    } else this.once('firstStir')
    if (action === 'block') this.once('firstBlock')
    const rooms = configId !== fromConfig ? ` · ${this.house.cfgs.get(configId).label}` : ''
    this.chain.requested = { t: +this.time.toFixed(1), kind: major ? 'posture change' : 'limb adjustment', label: POSES[pose].label + rooms, walls: s.moved, lines: s.lines, topology: s.topology }
    this.chain.completed = null
    this.setTx('TRANSFORMING')
    this.emit('transform', { major, action, goal, pose, from, configId, fromConfig, label: POSES[pose].label, walls: s.moved, lines: s.lines, topology: s.topology })
  }

  // THE PLAYER IN THE MOVING HOUSE. The player keeps its position and velocity; the room it is in
  // carries it (its place within its bay is kept as the grid lines move), and a wall that closes in
  // pushes it out. The displacement comes from the plan's geometry each frame, never added to the
  // velocity, so nothing accumulates. Only if it were still squeezed (it cannot be in a valid plan)
  // is it set at the nearest free spot close by.
  carryPlayer(X0, Y0) {
    if (this.carry || this.status !== 'playing') return
    const p = this.player
    const x = carryAlong(p.x, X0, this.house.X)
    const y = carryAlong(p.y, Y0, this.house.Y)
    this.carried = { x: x - p.x, y: y - p.y }
    p.x = x
    p.y = y
    const segs = this.house.segments()
    // a wall closing in pushes the player out, a little each frame (a doorway shutting on it
    // shoves it aside over a few frames instead of all at once)
    const q = { ...p, contactUntil: {} }
    collide(q, segs, [], this.time)
    const dx = q.x - p.x
    const dy = q.y - p.y
    const d = Math.hypot(dx, dy)
    const k = d > 0.12 ? 0.12 / d : 1
    p.x += dx * k
    p.y += dy * k
    if (d <= 0.12 && overlapping(p, segs, 0.04)) {
      const free = this.house.nearestFree(this.house.rasterise(null, { doorsShut: true }), p)
      if (free && free.d < 1.2) {
        // glide there (at most a tenth of a cell a frame), never jump
        const k = Math.min(1, 0.1 / Math.max(free.d, 1e-6))
        p.x += (free.x - p.x) * k
        p.y += (free.y - p.y) * k
      }
    }
  }

  // Eased out of a wall that has drifted onto the player (a little each frame, never a jump).
  nudgePlayer() {
    if (this.carry || this.status !== 'playing') return
    const p = this.player
    const q = { ...p, contactUntil: {} }
    collide(q, this.house.segments(), [], this.time)
    const dx = q.x - p.x
    const dy = q.y - p.y
    const d = Math.hypot(dx, dy)
    const k = d > 0.1 ? 0.1 / d : 1
    p.x += dx * k
    p.y += dy * k
  }

  // ---------- HIS DREAM (begun by his mind alone) ----------

  startDream() {
    this.dream = new Dream(this)
    this.setTx('DREAM')
    this.emit('dream', { phase: 'start', anchor: this.dream.anchor })
    this.say('dream', LINES.dream)
  }

  // The 3D dream (dream3d/): the plan as it stands when he falls into the dream, for the
  // architect he dreams he is to rebuild. The exits are shut: the dream holds the house.
  dreamPlan() {
    const h = this.house
    const d = this.dream
    const walls = h.walls.map((w) => ({ id: w.id, kind: w.kind, thick: w.thick, rooms: w.rooms, ...wallEnds(w) }))
    for (const e of h.doors) walls.push({ id: `door:${e.id}`, kind: 'door', thick: SHELL_T, rooms: [], a: e.a, b: e.b })
    const anchor = d.anchor ? { ...d.anchorPos(), room: d.anchor.room } : null
    this.chain.dream.architect = pickArchitect(d.seed).name
    return { seed: d.seed, X: h.X.slice(), Y: h.Y.slice(), bays: h.bays(), walls, anchor, player: { x: this.player.x, y: this.player.y } }
  }

  // The anchor found in the 3D dream: he wakes with the player on it in the plan, and the
  // dream settles as it always does (dream.js reached → settling → over).
  anchorFound() {
    const d = this.dream
    if (!d || (d.phase !== 'warning' && d.phase !== 'active')) return
    const a = d.anchorPos()
    if (a) {
      this.player.x = a.x
      this.player.y = a.y
      this.player.vx = this.player.vy = 0
    }
    d.reached()
  }

  // developer tool only (inspector, ?debug): let a dream begin now
  debugDream() {
    if (this.dream || this.tx.state !== 'IDLE' || this.trance || this.status !== 'playing') return false
    this.startDream()
    return true
  }

  // His sleep, read from his actual state: the transformation controller and his arousal.
  // Changes are sent as events (once each), for the snoring and the Zs.
  updateSleep() {
    const tx = this.tx.state
    const A = this.agent.s.arousal
    const sl = this.sleep
    const posture = tx === 'TRANSFORMING' && this.tx.kind !== 'twitch'
    let next
    if (tx === 'DREAM') next = 'DREAMING'
    else if (sl.state === 'WAKING' && this.time - sl.since < 1.6) next = 'WAKING'
    else if (posture) next = 'TRANSFORMING'
    else if (tx === 'SETTLING' && this.tx.kind !== 'twitch') next = 'SETTLING'
    else if (tx === 'IDLE' && (this.agent.mode === 'RITUAL' || (A < SLEEP_BELOW && this.time - this.lastDisturbAt > SLEEP_QUIET))) next = 'SLEEPING'
    else if (sl.state === 'SLEEPING' && !posture && A < SLEEP_BELOW && tx !== 'DECIDING') next = 'SLEEPING' // a light touch does not break his sleep
    else next = sl.state === 'SETTLING' && tx === 'IDLE' ? 'SETTLING' : 'DISTURBED'
    // sufficiently disturbed, and beginning to change how he lies: he wakes (once, until he sleeps again)
    if (!sl.awake && ((posture && !this.tx.dream) || A > 0.5)) {
      sl.awake = true
      next = 'WAKING'
      this.emit('wake', { region: this.chain.region })
    }
    if (next === 'SLEEPING') sl.awake = false
    if (next !== sl.state) {
      this.emit('sleep', { state: next, from: sl.state })
      sl.state = next
      sl.since = this.time
    }
  }

  // He and the house have come to rest.
  // The niches of the circuit (stage III) belong to the house: when a plan leaves one outside, or
  // inside a wall, it moves to the nearest free place inside the house (it glides there), keeping
  // its number and the order of the circuit.
  placeNiches() {
    if (!this.niches.length) return
    const occ = this.house.rasterise(null, { doorsShut: false })
    const dist = this.house.distances(occ, this.player)
    const W = COLS * RES
    for (const n of this.niches) {
      n.home ??= { x: n.x, y: n.y }
      const at = { x: n.tx ?? n.x, y: n.ty ?? n.y }
      if (this.house.inside(at.x, at.y) && this.house.distAt(dist, at) >= 0) continue
      // the nearest place to where it was built that is free, inside, and reachable by the player
      let best = null
      for (let k = 0; k < dist.length; k++) {
        if (dist[k] < 0) continue
        const x = ((k % W) + 0.5) / RES
        const y = (Math.floor(k / W) + 0.5) / RES
        if (!this.house.inside(x, y)) continue
        const d = Math.hypot(x - n.home.x, y - n.home.y)
        if (!best || d < best.d) best = { x, y, d }
      }
      if (best) {
        n.tx = best.x
        n.ty = best.y
      }
    }
  }

  settled() {
    this.env.recompute(this.house)
    this.refreshCache()
    this.placeNiches()
    if (this.trance) this.finishTrance()
    else if (this.hypno?.phase === 'reacting') {
      this.hypno = { phase: 'fading', since: this.time }
      this.emit('hypno', { phase: 'fading' })
    }
    this.agent.transformDone()
    this.chain.completed = { t: +this.time.toFixed(1), pose: this.body.pose, config: this.house.configId }
    this.emit('settled', { pose: this.body.pose })
    const before = this.reachableDoors
    this.reachableDoors = this.house.doors.filter((d) => this.reachRoute.get(d.id) >= 0).map((d) => d.id).join()
    if (this.stageDef.id === 'adapt' && before && before !== this.reachableDoors) this.say('doorsChanged', LINES.doorsChanged)
    // never left cut off: if no way out remains from where the player is, the floor carries them
    const exits = this.exitDoors()
    if (exits.length && !this.carry && this.status === 'playing' && !exits.some((d) => this.reachRoute.get(d.id) >= 0)) {
      this.relocate(this.house.nearestFree(this.occNow, this.player, exits[0]))
    }
    if (this.tx.major) {
      this.tx.major = false
      this.say('reformDone', LINES.reformDone)
      if (this.spoiled && this.stageDef.id === 'obey') {
        // the door was shut while he moved; it opens again where the house now puts it
        this.spoiled = false
        this.say('returned', LINES.returned)
      }
    }
  }

  interrupt() {
    this.system = 'interrupted'
    this.house.breakRule()
    this.agent.s.arousal = 1
    this.env.recompute(this.house)
    this.refreshCache()
    this.emit('interrupted')
    // at once he tries to lie as the oldest wall required: it cannot be done
    this.agent.forced = 'RESTORE_ORDER'
    const d = this.agent.decide(this.world())
    this.chain.decision = { t: +this.time.toFixed(1), goal: d.goal, action: d.choice?.action ?? 'stay still', reason: d.choice?.reason ?? '', idle: false }
    if (d.type === 'impossible') {
      this.emit('agentFailed', { goal: d.goal, reason: d.choice.reason })
      this.once('cannotRestore')
    }
    this.say('interrupted', LINES.interrupted)
  }

  // ---------- debug ----------

  debugCollision() {
    const p = this.player
    this.knock({ x: p.x, y: p.y - PLAYER_RADIUS, speed: 3, kind: 'interior' })
  }

  debugEvaluate() {
    if (this.tx.state === 'IDLE') this.setTx('DISTURBED')
  }

  debugTransform() {
    if (this.tx.state !== 'IDLE' || this.agent.mode === 'RITUAL') return false
    this.agent.s.arousal = 1
    this.agent.forced = 'RECONFIGURE'
    this.setTx('DISTURBED')
    return true
  }

  debugReset() {
    if (this.tx.state !== 'IDLE') return false
    this.repose(this.layout.body.pose, { major: false, action: 'reset', configId: this.layout.configs[0] })
    return true
  }

  // ---------- the frame ----------

  relocate(p) {
    if (!p) return
    const q = this.player
    this.carry = { fromX: q.x, fromY: q.y, toX: p.x, toY: p.y, t: 0, dur: 1.6, fade: true }
    q.vx = q.vy = 0
    this.lastRelocation = this.agent.t
    this.emit('relocated', { x: p.x, y: p.y })
  }

  update(dt, input = {}) {
    if (this.status === 'ending') {
      this.body.update(dt)
      this.house.update(dt, null)
      return
    }
    this.time += dt
    const tilt = input.tilt ?? { x: 0, y: 0 }
    const p = this.player

    if (this.hintQueue.length && this.time > this.hintQueue[0][0]) {
      const [, key] = this.hintQueue.shift()
      if (this.system === 'running') this.say(key, LINES[key])
    }
    const cell = this.playerCell()
    if (this.dwellCell && this.dwellCell.c === cell.c && this.dwellCell.r === cell.r) this.dwell += dt
    else {
      this.dwell = 0
      this.dwellCell = cell
    }
    this.cacheTimer -= dt
    if (this.cacheTimer <= 0) {
      this.cacheTimer = 0.5
      this.refreshCache()
    }

    // HIS MIND keeps its state; the controller asks it to decide and executes what it chooses
    this.agent.update(dt, this.world())
    this.body.restless = clamp(this.agent.s.arousal)
    this.body.breath.rate = 0.12 + this.agent.s.arousal * 0.18
    this.body.update(dt)
    const frameStart = { x: p.x, y: p.y, moving: this.tx.state === 'TRANSFORMING' || this.tx.state === 'DREAM' }
    this.controller(dt)
    // he may begin to dream: his own decision, only while he sleeps and nothing else is under way
    // (while the player has the HYPNOTIZE popup open and is speaking to him, he does not drift
    // into a dream: the hypnosis is under way)
    const quiet = this.tx.state === 'IDLE' && !this.trance && !this.hypno && !this.listening && !this.relocatePending && this.status === 'playing' && this.system !== 'restored' && this.system !== 'restoring'
    if (!this.dream && this.agent.dreamWish(dt, { state: this.sleep.state, busy: !quiet })) this.startDream()
    if (this.dream) {
      this.dream.update(dt)
      if (this.dream.phase === 'over') {
        this.dream = null
        this.setTx('SETTLING')
      }
    }
    this.updateSleep()
    if (this.hypno && this.hypno.phase !== 'interpreting' && this.tx.state === 'IDLE' && this.time - this.hypno.since > (this.hypno.phase === 'reacting' ? 2 : 1.4)) {
      if (this.hypno.phase === 'reacting') this.emit('hypno', { phase: 'fading' })
      this.hypno = this.hypno.phase === 'reacting' ? { phase: 'fading', since: this.time } : null
    }
    this.setDoors()

    // PLAYER PHYSICS (walls are never moved here)
    if (this.carry) {
      const c = this.carry
      c.t += dt / c.dur
      const k = c.t < 0.5 ? 2 * c.t * c.t : 1 - (-2 * c.t + 2) ** 2 / 2
      p.x = c.fromX + (c.toX - c.fromX) * Math.min(1, k)
      p.y = c.fromY + (c.toY - c.fromY) * Math.min(1, k)
      if (c.t >= 1) this.carry = null
    } else if (this.status === 'playing') {
      // while he changes how he lies the player keeps moving, but he feels every new lean
      if (this.holding) {
        if (!this.holdTilt) this.holdTilt = { ...tilt }
        const dTilt = Math.hypot(tilt.x - this.holdTilt.x, tilt.y - this.holdTilt.y)
        const mv = Math.max(clamp((dTilt - 0.25) * 2.5), clamp(input.motion ?? 0))
        if (mv > 0) {
          this.agent.s.arousal = clamp(this.agent.s.arousal + mv * 0.25 * dt)
          this.emit('frozenMove', { amount: mv })
          if (mv > 0.3) this.once('movedInReform')
        }
      } else this.holdTilt = null
      const air = this.env.airAt(p.x, p.y)
      const light = this.env.lightAt(p.x, p.y)
      let segs = this.house.segments()
      // a wall closing in on the player during a transformation pushes it out gradually
      // (carryPlayer); the rolling step does not snap it out all at once
      const moving = this.tx.state === 'TRANSFORMING'
      if (moving) segs = segs.filter((sg) => distToSegment(p, sg.a, sg.b) > PLAYER_RADIUS + sg.r - 0.12)
      const impacts = stepPlayer(p, tilt, dt, segs, { sensitivity: input.sensitivity ?? 1, time: this.time, air, light })
      if (impacts.length) {
        impacts.sort((a, b) => b.speed - a.speed)
        const imp = impacts[0]
        const seg = segs.find((s) => s.key === imp.key) ?? {}
        this.knock({ ...imp, kind: seg.kind ?? 'interior', wall: seg.wall })
      }
      if (Math.hypot(air.x, air.y) > 0.25) this.once('draught')
      if (light > 0.4 && Math.hypot(p.vx, p.vy) > 0.5) this.once('slippery')
      this.checkGoals(dt, tilt)
      this.checkSafety()
    }

    // while walls move, the player is carried, pushed and rolls, but never moves further in one
    // frame than it could roll plus a small push: squeezed, it is eased out over several frames
    if ((frameStart.moving || this.tx.state === 'TRANSFORMING' || this.tx.state === 'DREAM') && !this.carry) {
      const mx = p.x - frameStart.x
      const my = p.y - frameStart.y
      const md = Math.hypot(mx, my)
      const cap = MAX_SPEED * dt + 0.08
      if (md > cap) {
        p.x = frameStart.x + (mx * cap) / md
        p.y = frameStart.y + (my * cap) / md
      }
    }

    const ar = this.agent.s.arousal
    if (ar > 0.4 && !this.holding && this.agent.mode !== 'RITUAL') {
      this.pulseTimer -= dt
      if (this.pulseTimer <= 0) {
        const k = clamp((ar - 0.4) / 0.5)
        this.pulseTimer = 2.8 - 1.9 * k
        this.emit('pulse', { level: k, critical: ar > 0.85 })
        if (k > 0.2) this.once('uneasy')
      }
    } else this.pulseTimer = 0.6

    for (const n of this.niches) {
      if (n.tx == null) continue
      n.x += (n.tx - n.x) * Math.min(1, dt * 2)
      n.y += (n.ty - n.y) * Math.min(1, dt * 2)
    }

    this.trailTimer -= dt
    if (this.trailTimer <= 0 && !this.carry) {
      this.trailTimer = 0.12
      const last = this.trail[this.trail.length - 1]
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.08) this.trail.push({ x: p.x, y: p.y })
    }
  }

  checkSafety() {
    if (this.carry || this.status !== 'playing' || this.tx.state === 'TRANSFORMING') return
    const p = this.player
    const out = !this.house.inside(p.x, p.y) && !this.house.doors.some((d) => d.open && Math.hypot(p.x - d.mid.x, p.y - d.mid.y) < 0.8)
    if (out || overlapping(p, this.house.segments(), 0.08)) {
      const occ = this.house.rasterise(null, { doorsShut: false })
      this.relocate(this.house.nearestFree(occ, p, this.exitDoors()[0]))
    }
  }

  near(pt, r = 0.42) {
    return pt && Math.hypot(this.player.x - pt.x, this.player.y - pt.y) < r
  }

  throughDoor() {
    const p = this.player
    for (const d of this.house.doors) {
      if (!d.open) continue
      if (d.id === 'sealed' && this.system !== 'interrupted') continue
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
      const t = ((p.x - d.a.x) * (d.b.x - d.a.x) + (p.y - d.a.y) * (d.b.y - d.a.y)) / (len * len)
      const out = (p.x - d.mid.x) * d.out.x + (p.y - d.mid.y) * d.out.y
      if (t > 0 && t < 1 && out > 0.05) return d
    }
    return null
  }

  checkGoals(dt, tilt) {
    const def = this.stageDef
    if (def.id === 'adapt' && !this.doorOpen && this.house.doors.some((d) => this.near({ x: d.mid.x - d.out.x * 0.5, y: d.mid.y - d.out.y * 0.5 }, 0.7))) this.once('doorShut')
    if (def.id === 'question') this.checkQuestion(dt, tilt)
    if (this.throughDoor()) {
      if (def.id === 'question') this.finish(this.system === 'restored' ? 'preserve' : 'interrupt')
      else this.completeStage()
    }
  }

  checkQuestion(dt, tilt) {
    if (this.system === 'running') {
      for (const n of this.niches) {
        if (!this.near(n, 0.4)) continue
        if (n.order === this.nicheNext) {
          this.nicheNext++
          this.emit('niche', { order: n.order })
          this.say('niche', LINES.niche(n.order))
          if (n.order === 4) {
            this.system = 'restoring'
            this.stillTime = 0
            this.say('stillness', LINES.stillness)
          }
        } else if (n.order > this.nicheNext) this.once(`wrong${n.order}`, LINES.nicheWrong)
      }
    } else if (this.system === 'restoring') {
      const still = Math.hypot(tilt.x, tilt.y) < 0.05 && Math.hypot(this.player.vx, this.player.vy) < 0.15 && this.tx.state === 'IDLE'
      this.stillTime = still ? this.stillTime + dt : 0
      this.emit('stillness', { progress: clamp(this.stillTime / 4) })
      if (this.stillTime >= 4) this.restore()
    }
  }

  restore() {
    this.system = 'restored'
    this.agent.ritual()
    this.repose(this.layout.body.pose, { major: true, action: 'restore', goal: 'RESTORE_ORDER', configId: this.layout.configs[0] })
    this.shifts--
    this.emit('restored')
    this.say('restored', LINES.restored)
  }

  completeStage() {
    this.status = 'complete'
    this.trails[this.stageDef.id] = this.trail.slice()
    this.emit('stageComplete', { stage: this.stageIndex, id: this.stageDef.id, text: this.stageDef.done })
  }

  finish(kind) {
    this.status = 'ending'
    this.ending = kind
    this.trails.question = this.trail.slice()
    this.emit('ending', { kind })
  }

  replayRoute() {
    const d = this.door('old') ?? this.house.doors[0]
    const occ = this.house.rasterise(null, { doorsShut: false })
    const pts = this.house.path(occ, this.start, { x: d.mid.x + d.out.x * 0.2, y: d.mid.y + d.out.y * 0.2 }) ?? []
    return [this.start, ...pts]
  }

  snapshot() {
    const p = this.player
    const routes = this.exitDoors().map((d) => this.house.routeTo(this.distNow, d)).filter((r) => r >= 0)
    const reg = this.body.region[Math.floor(p.y) * COLS + Math.floor(p.x)]
    return {
      stage: this.stageDef.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      cell: `${Math.floor(p.x)},${Math.floor(p.y)}`,
      region: reg ?? '—',
      pose: this.body.pose,
      air: this.env.airAt(p.x, p.y),
      light: this.env.lightAt(p.x, p.y),
      route: routes.length ? +Math.min(...routes).toFixed(1) : null,
      shifts: this.shifts,
      niche: this.nicheNext,
      cracks: this.cracks,
      system: this.system,
      doorOpen: this.doorOpen,
      tx: this.tx.state,
      sleep: this.sleep.state,
      dream: this.dream ? { phase: this.dream.phase, t: +this.dream.t.toFixed(1), fog: +this.dream.fog.toFixed(2), anchor: this.dream.anchor?.room ?? null, cycles: this.dream.cycles.length, loose: +(this.house.float?.k ?? 0).toFixed(2) } : null,
      dreamPressure: +(this.agent.dreamPressure ?? 0).toFixed(2),
      irk: this.irk.count,
      relocating: this.relocatePending,
      hypno: this.hypno?.phase ?? null,
      chain: this.chain,
      config: this.house.configId,
      moving: this.house.transforming ? (this.tx.moved ?? 0) : 0,
    }
  }
}

export { COLS, ROWS }
