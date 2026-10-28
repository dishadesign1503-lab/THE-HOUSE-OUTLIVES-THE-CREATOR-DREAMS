// WHAT THE HOUSE REMEMBERS (agent memory). Bounded: old things fade or are summarised.
//
//   events       the last 40 things that happened (collisions, decisions, outcomes)
//   heat         where the player spends time (decays)
//   edgeUse      which passages the player crosses (decays): the routes it exploits
//   bumps        where the player hits walls (decays)
//   layouts      up to 8 arrangements, with how stable each proved to be
//   strategies   per action type: tries, successes, times it caused instability
//   goals        per goal: tries and successes
//   air          collisions in draughty vs still places (what it learns about the wind)
//   instructions the last 24 hypnotic instructions: their words and concepts (never the audio),
//                his state when each came, what he chose, and how it turned out
// The learned part (strategies, goals, air) can be kept between visits in this browser.

const cellKey = (c, r) => `${c},${r}`
// the edge between two neighbouring cells: v:c,r = left edge of (c, r); h:c,r = top edge
export function edgeBetween(c, r, dc, dr) {
  if (dc === 1) return `v:${c + 1},${r}`
  if (dc === -1) return `v:${c},${r}`
  if (dr === 1) return `h:${c},${r + 1}`
  return `h:${c},${r}`
}

import { similarity } from '../voice/classify.js'

const EVENTS = 40
const INSTRUCTIONS = 24
const LAYOUTS = 8
const STORE = 'house-outlives:agent-memory'

export class AgentMemory {
  constructor({ persist = false } = {}) {
    this.persist = persist
    this.events = []
    this.heat = new Map()
    this.edgeUse = new Map()
    this.bumps = new Map()
    this.layouts = []
    this.strategies = {}
    this.goals = {}
    this.air = { draughty: 0, still: 0 }
    this.instructions = []
    this.exitApproaches = 0
    this.lastCell = null
    if (persist) this.load()
  }

  record(t, type, detail = {}) {
    this.events.push({ t, type, ...detail })
    if (this.events.length > EVENTS) this.events.shift()
  }

  // the player moved: heat, and which passage it used
  observePlayer(cell, dt) {
    const k = cellKey(cell.c, cell.r)
    this.heat.set(k, (this.heat.get(k) ?? 0) + dt)
    if (this.lastCell && (this.lastCell.c !== cell.c || this.lastCell.r !== cell.r)) {
      const dc = cell.c - this.lastCell.c
      const dr = cell.r - this.lastCell.r
      if (Math.abs(dc) + Math.abs(dr) === 1) {
        const e = edgeBetween(this.lastCell.c, this.lastCell.r, dc, dr)
        this.edgeUse.set(e, (this.edgeUse.get(e) ?? 0) + 1)
      }
    }
    this.lastCell = cell
  }

  bump(cell, amount, airy) {
    const k = cellKey(cell.c, cell.r)
    this.bumps.set(k, (this.bumps.get(k) ?? 0) + amount)
    if (airy) this.air.draughty += amount
    else this.air.still += amount
  }

  decay(dt) {
    const f = Math.exp(-dt / 90) // about a minute and a half to forget
    for (const m of [this.heat, this.edgeUse, this.bumps]) {
      for (const [k, v] of m) {
        const n = v * f
        if (n < 0.02) m.delete(k)
        else m.set(k, n)
      }
    }
    this.air.draughty *= Math.exp(-dt / 240)
    this.air.still *= Math.exp(-dt / 240)
  }

  // the passages the player relies on most, strongest first
  topEdges(n = 6) {
    return [...this.edgeUse].sort((a, b) => b[1] - a[1]).slice(0, n)
  }

  bumpsNear(cell, radius = 1.5) {
    let s = 0
    for (const [k, v] of this.bumps) {
      const [c, r] = k.split(',').map(Number)
      if (Math.hypot(c - cell.c, r - cell.r) <= radius) s += v
    }
    return s
  }

  // ---------- layouts ----------

  rememberLayout(plan, t) {
    const sig = plan.signature()
    let L = this.layouts.find((l) => l.sig === sig)
    if (!L) {
      L = { sig, plan, stability: 0.3, heldFor: 0, bumps: 0, since: t, id: this.layouts.length ? Math.max(...this.layouts.map((l) => l.id)) + 1 : 1 }
      this.layouts.push(L)
      if (this.layouts.length > LAYOUTS) {
        // forget the least stable one (never the current one)
        this.layouts.sort((a, b) => b.stability - a.stability)
        this.layouts = this.layouts.filter((l) => l === L || this.layouts.indexOf(l) < LAYOUTS - 1)
      }
    }
    L.since = t
    return L
  }

  layoutOf(plan) {
    const sig = plan.signature()
    return this.layouts.find((l) => l.sig === sig) ?? null
  }

  bestStable(exceptSig) {
    return this.layouts.filter((l) => l.sig !== exceptSig).sort((a, b) => b.stability - a.stability)[0] ?? null
  }

  // ---------- hypnotic instructions (this visit only) ----------

  rememberInstruction(entry) {
    this.instructions.push(entry)
    if (this.instructions.length > INSTRUCTIONS) this.instructions.shift()
    return entry
  }

  // earlier instructions like this one (by concepts, or the very same words)
  similarInstructions(ins, since = -Infinity) {
    return this.instructions.filter((e) => e !== ins && e.t >= since && (e.text === ins.text || similarity(e.concepts, ins.concepts) > 0.8))
  }

  // how often instructions like this one already led him to this posture
  echo(concepts, pose) {
    return this.instructions.filter((e) => e.chosen?.pose === pose && similarity(e.concepts, concepts) > 0.75).length
  }

  // how often he already answered this object with this degree, side and organisation
  echoShape(object, intensity, mirror, configId) {
    // plans drawn from his body are new each time: there the answer is the posture (degree, side)
    const sameRooms = (c) => c === configId || (String(c).startsWith('body:') && String(configId).startsWith('body:'))
    return this.instructions.filter((e) => e.object === object && e.chosen && e.chosen.intensity === intensity && e.chosen.mirror === mirror && sameRooms(e.chosen.configId)).length
  }

  // how instructions with these concepts tended to turn out for him (0..1, 0.5 unknown)
  instructionRate(concepts) {
    const past = this.instructions.filter((e) => e.outcome && similarity(e.concepts, concepts) > 0.6)
    if (!past.length) return 0.5
    return (past.filter((e) => e.outcome.success).length + 1) / (past.length + 2)
  }

  // ---------- learning ----------

  rate(table, key) {
    const s = table[key]
    if (!s || !s.tries) return 0.5
    return (s.success + 1) / (s.tries + 2) // with a gentle prior
  }

  learn(goal, action, success, unstable = false) {
    const g = (this.goals[goal] ??= { tries: 0, success: 0 })
    g.tries++
    if (success) g.success++
    const s = (this.strategies[action] ??= { tries: 0, success: 0, unstable: 0 })
    s.tries++
    if (success) s.success++
    if (unstable) s.unstable++
    this.save()
  }

  // does it seem that draughts make the player bump into walls?
  get airLesson() {
    const total = this.air.draughty + this.air.still
    return total > 0.3 ? this.air.draughty / total : 0.5
  }

  // ---------- between visits ----------

  save() {
    if (!this.persist) return
    try {
      localStorage.setItem(STORE, JSON.stringify({ strategies: this.strategies, goals: this.goals, air: this.air }))
    } catch {
      // storage blocked: memory stays for this visit only
    }
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) ?? 'null')
      if (d) {
        this.strategies = d.strategies ?? {}
        this.goals = d.goals ?? {}
        this.air = d.air ?? this.air
      }
    } catch {
      // nothing remembered
    }
  }

  static forget() {
    try {
      localStorage.removeItem(STORE)
    } catch {
      // nothing to forget
    }
  }
}
