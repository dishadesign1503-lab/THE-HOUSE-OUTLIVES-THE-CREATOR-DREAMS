// HE DREAMS — begun by his own mind (agent.dreamWish), never by the player.
//
//   warning    "Ohh no... He's dreaming!" — the fog rises, the dream cloud gathers at his head
//   active     the house is unstable: in dream cycles he takes dream postures and the rooms pass
//              through other organisations (each step chosen and checked by his planner: a valid
//              plan, nothing coming down on the player, the anchor still reachable); on top,
//              interior walls come loose and drift, tilt and lift, whole rooms' walls together
//              or single segments on their own. The exits are shut. A green ANCHOR is set on a
//              floor tile the player can reach; it stays on its tile as the rooms move.
//   settling   the player has stepped onto the anchor: the loose walls glide back, the last
//              plan settles (he decides how much of the dream the house keeps), the fog clears,
//              the cloud fades.
// Every movement goes through the house's own transformation and the player is carried and
// eased out of anything closing in, never teleported.

import { Body, POSES } from '../body/body.js'
import { predict } from '../agent/planner.js'
import { comparePlans } from '../world/plan.js'

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k))
const hash = (str, seed) => {
  let h = seed % 1000003
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 1000003
  return h / 1000003
}
const WARNING = 1.8
const CYCLE = 4.2
const ANCHOR_HALF = 0.3 // the anchor tile: 0.6 × 0.6 cells

export class Dream {
  constructor(game) {
    this.g = game
    const h = game.house
    this.seed = Math.floor(game.agent.rng() * 1e6)
    this.phase = 'warning'
    this.t = 0
    this.fog = 0
    this.cloud = 0
    this.cycles = []
    this.visited = [h.configId]
    this.nextCycle = WARNING + 0.4
    this.floatTarget = 0
    this.reachCheck = 0
    this.envTimer = 0
    this.before = { cfg: h.cfg, X: h.X.slice(), Y: h.Y.slice(), pose: game.body.pose }
    h.float = { k: 0, t: 0, of: (p) => this.floatOf(p) }
    this.anchor = this.chooseAnchor()
    game.chain.dream = { t: +game.time.toFixed(1), pressure: 'his own', anchor: this.anchor ? `${this.anchor.room} (bay ${this.anchor.i},${this.anchor.j})` : null, cycles: [], phase: this.phase, result: null }
  }

  // which walls come loose (decided by the wall's own key, so a wall keeps its fate): about two
  // in five interior walls; most of those drift with the other walls of their room (a coherent
  // group), the rest on their own, turning further
  floatOf(p) {
    const h = hash(p.key, this.seed)
    if (h > 0.42) return null
    // the walls right around the anchor stay put, so the way onto it is not taken away
    const a = this.anchor && this.anchorPos()
    if (a && Math.hypot((p.a.x + p.b.x) / 2 - a.x, (p.a.y + p.b.y) / 2 - a.y) < 1.2) return null
    const room = p.rooms.find(Boolean) ?? '_'
    const g = hash(room, this.seed + 7)
    const group = h < 0.26
    return group
      ? { amp: 0.32 + 0.22 * g, rot: 0.1 + 0.08 * g, wx: 0.45 + 0.25 * g, wy: 0.38 + 0.2 * g, wr: 0.3, phase: g * 6.283 }
      : { amp: 0.28 + 0.3 * (h / 0.42), rot: 0.28 + 0.3 * (h / 0.42), wx: 0.5 + h, wy: 0.42 + 0.6 * h, wr: 0.35 + 0.5 * h, phase: h * 40 }
  }

  // the anchor's place: the centre of its bay, wherever the bay's lines are now
  anchorPos() {
    const { X, Y } = this.g.house
    const a = this.anchor
    return a ? { x: (X[a.i] + X[a.i + 1]) / 2, y: (Y[a.j] + Y[a.j + 1]) / 2 } : null
  }

  // Choose the anchor: a floor tile at the centre of a bay the player can reach; far enough to be
  // a journey, in a room the player has spent little time in (what the dream reaches for).
  chooseAnchor() {
    const g = this.g
    const h = g.house
    const occ = h.rasterise(null, { doorsShut: false })
    const dist = h.distances(occ, g.player)
    const options = []
    for (let j = 0; j < h.cfg.bay.length; j++) {
      for (let i = 0; i < h.cfg.bay[j].length; i++) {
        const room = h.cfg.bay[j][i]
        if (!room) continue
        const c = { x: (h.X[i] + h.X[i + 1]) / 2, y: (h.Y[j] + h.Y[j + 1]) / 2 }
        if (!h.freeAt(occ, c)) continue
        const d = h.distAt(dist, c)
        if (d < 0) continue
        const route = d / 4
        if (route < 2.5) continue
        const heat = g.agent.memory.heat.get(`${Math.floor(c.x)},${Math.floor(c.y)}`) ?? 0
        options.push({ i, j, room: h.cfg.rooms[room]?.name ?? room, route, score: -Math.abs(route - 8) * 0.25 - Math.min(heat, 5) * 0.2 + g.agent.rng() * 0.6 })
      }
    }
    options.sort((a, b) => b.score - a.score)
    return options[0] ?? null
  }

  // the player's circle overlapping the anchor tile (not merely near it)
  onAnchor() {
    const a = this.anchorPos()
    if (!a) return false
    const p = this.g.player
    const dx = Math.max(Math.abs(p.x - a.x) - ANCHOR_HALF, 0)
    const dy = Math.max(Math.abs(p.y - a.y) - ANCHOR_HALF, 0)
    return Math.hypot(dx, dy) < p.r
  }

  // One step of the dream: he chooses a dream posture and an organisation of the rooms.
  cycle() {
    const g = this.g
    const h = g.house
    const ag = g.agent
    const ctx = ag.context(g.world())
    const poses = Object.keys(POSES).filter((p) => !POSES[p].embodied && !POSES[p].stage && p !== g.body.pose)
    const configs = [...h.cfgs.keys()]
    const suggested = new Set(ag.memory.instructions.map((e) => e.chosen?.configId).filter(Boolean))
    const tried = []
    for (let n = 0; n < 16; n++) {
      const pose = poses[Math.floor(ag.rng() * poses.length)]
      const configId = configs[Math.floor(ag.rng() * configs.length)]
      if (tried.some((c) => c.pose === pose && c.configId === configId)) continue
      const p = predict(ctx, pose, configId)
      let score = p.ok ? 0 : -9
      // the anchor must stay reachable in the dreamt plan
      if (p.ok && this.anchor) {
        const plan = p.plan
        const a = { x: (plan.X[this.anchor.i] + plan.X[this.anchor.i + 1]) / 2, y: (plan.Y[this.anchor.j] + plan.Y[this.anchor.j + 1]) / 2 }
        if (h.distAt(h.distances(h.rasterise(plan, { doorsShut: false }), g.player), a) < 0) score = -9
      }
      if (score > -9) {
        // dream logic: what he has not yet passed through, what was suggested to him, what never
        // settled; and dramatic rather than small
        const L = ag.memory.layoutOf({ signature: () => `${pose}|${configId}` })
        score += (this.visited.includes(configId) ? 0 : 1) + (this.visited.slice(-2).includes(configId) ? -1 : 0) + (suggested.has(configId) ? 0.4 : 0) + (L ? 0.3 * (1 - L.stability) : 0.15) + 0.2 * Math.min(p.moved, 3) + ag.rng() * 0.3
      }
      tried.push({ pose, configId, plan: p.plan, score, why: p.why })
    }
    tried.sort((a, b) => b.score - a.score)
    const c = tried[0]
    if (!c || c.score <= -9) {
      this.nextCycle = this.t + 1.5
      return
    }
    g.body.to(c.pose, CYCLE)
    const s = h.begin(c.plan, { duration: CYCLE, focus: { x: g.player.x, y: g.player.y }, label: `dream: ${POSES[c.pose].label}` })
    g.tx.kind = 'posture'
    g.tx.dream = true
    g.tx.moved = s.moved
    this.visited.push(c.configId)
    this.cycles.push({ pose: POSES[c.pose].label, rooms: h.cfgs.get(c.configId).label, walls: s.moved })
    g.chain.dream.cycles = this.cycles.slice(-6)
    this.nextCycle = this.t + CYCLE + 0.9
    g.emit('dreamCycle', { pose: c.pose, configId: c.configId, walls: s.moved })
  }

  reached() {
    this.phase = 'settling'
    this.reachedAt = this.t
    this.floatTarget = 0
    this.g.chain.dream.phase = 'settling'
    this.g.emit('anchorReached', { at: this.anchorPos() })
    this.g.say('dreamAnchor', this.g.lines.dreamAnchor)
  }

  // what the house keeps of the dream: his decision, between the last dreamt plan and the plan
  // before the dream (both must be valid, with the exits reachable from where the player is)
  final() {
    const g = this.g
    const h = g.house
    const ag = g.agent
    const ctx = ag.context(g.world())
    const mem = (pose, configId) => ag.memory.layoutOf({ signature: () => `${pose}|${configId}` })?.stability ?? 0.3
    const options = [
      { kept: true, pose: g.body.pose, configId: h.configId, u: 0.35 + 0.5 * ag.s.curiosity + 0.15 * Math.min(this.cycles.length, 4) / 4 - 0.5 * ag.s.irritation + 0.3 * mem(g.body.pose, h.configId) },
      { kept: false, pose: this.before.pose, configId: this.before.cfg.id, u: 0.45 + 0.4 * mem(this.before.pose, this.before.cfg.id) },
    ]
    for (const o of options) {
      const p = predict(ctx, o.pose, o.configId)
      o.ok = p.ok
      o.plan = p.plan
      if (!p.ok) o.u = -9
    }
    options.sort((a, b) => b.u - a.u)
    const c = options[0]
    this.kept = c.kept
    if (c.u > -9) {
      g.body.to(c.pose, 3.5)
      h.begin(c.plan, { duration: 3.5, focus: { x: g.player.x, y: g.player.y }, label: c.kept ? 'the dream stays' : 'back as before' })
      g.tx.kind = 'posture'
      g.tx.dream = true
    }
    this.finalStarted = true
  }

  end() {
    const g = this.g
    const h = g.house
    h.float = null
    h.derive()
    const change = comparePlans(this.before.cfg, this.before.X, this.before.Y, h.cfg, h.X, h.Y)
    g.chain.dream.phase = 'over'
    g.chain.dream.result = { kept: this.kept, rooms: h.cfg.label, pose: POSES[g.body.pose]?.label, change, validPlan: h.validatePlan({ X: h.X, Y: h.Y, configId: h.configId }).ok }
    g.emit('dreamEnd', { kept: this.kept })
    g.say(this.kept ? 'dreamKept' : 'dreamReturned', this.kept ? g.lines.dreamKept : g.lines.dreamReturned)
    this.phase = 'over'
  }

  update(dt) {
    const g = this.g
    const h = g.house
    this.t += dt
    if (this.phase === 'warning') {
      this.fog = Math.min(0.6, this.fog + dt * 0.4)
      this.cloud = Math.min(1, this.cloud + dt * 0.7)
      if (this.t >= WARNING) {
        this.phase = 'active'
        this.floatTarget = 1
        g.chain.dream.phase = 'active'
      }
    } else if (this.phase === 'active') {
      this.fog = 0.55 + 0.22 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.13 + 1)
      this.cloud = Math.min(1, this.cloud + dt)
      if (!h.transforming && this.t >= this.nextCycle) this.cycle()
      // the anchor must stay within reach: if loose walls block every way, they calm down
      this.reachCheck -= dt
      if (this.reachCheck <= 0 && this.anchor) {
        this.reachCheck = 0.6
        const occ = h.rasterise(null, { doorsShut: false })
        this.reachable = h.distAt(h.distances(occ, g.player), this.anchorPos()) >= 0
        // a way blocked: the loose walls settle until it opens again
        this.floatTarget = this.reachable ? 1 : 0
      }
      if (this.onAnchor()) this.reached()
    } else if (this.phase === 'settling') {
      this.fog = Math.max(0, this.fog - dt * 0.18)
      this.cloud = Math.max(0, this.cloud - dt * 0.25)
      if (!this.finalStarted && h.float.k < 0.02 && !h.transforming) this.final()
      if (this.finalStarted && !h.transforming && this.fog <= 0.01) this.end()
    }
    // the loose walls come loose (or settle back) gradually
    h.float && (h.float.k += (this.floatTarget - h.float.k) * Math.min(1, dt * (this.floatTarget ? 0.5 : 1.4)))
    // the house moves: the player is carried by the rooms and eased out of anything closing in
    const X0 = h.X.slice()
    const Y0 = h.Y.slice()
    const done = h.update(dt, null) === 'done'
    if (h.transforming || done) g.carryPlayer(X0, Y0)
    else g.nudgePlayer()
    this.envTimer -= dt
    if (this.envTimer <= 0) {
      this.envTimer = 1.5
      g.env.recompute(h)
    }
  }
}

export { ANCHOR_HALF, ease }
