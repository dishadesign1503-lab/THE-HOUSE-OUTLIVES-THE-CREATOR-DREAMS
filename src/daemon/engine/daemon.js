// THE DAEMON. A small, persistent, stateful mind that only hears.
//
// It receives two kinds of input, both of them sounds:
//   hear(perception)      — taps, hums, claps, voices… from the microphone or the simulated buttons
//   considerLayout(rooms) — the clack of magnetic blocks; in the fiction each block has its own
//                           resonance, so the daemon "hears" which room landed where.
// It never receives an image of the board.
//
// It produces events (log lines, chosen actions, one-shot sounds) for anyone listening,
// and a view() snapshot that the interface and the sound engine turn into light and sound.
// Nothing in here knows about React, SVG or Web Audio, so a physical table could drive it as is.

import { analyse, diff, ZONE_NAMES, ZONE_ADJECTIVE } from './layout.js'
import { interpret } from './interpretations.js'
import { LINES, fill, pick } from './narration.js'
import { ROOM_TYPES } from './rooms.js'

export const DEFAULT_CONFIG = {
  silenceThreshold: 40, // seconds without meaningful sound before the house starts to fade
  memorySize: 12, // how many arrangements it remembers
  features: {}, // house upgrades that change how it behaves (see progress/upgrades.js)
  layoutOptions: {}, // passed to analyse(): corridors, neglected zones, open wings, basin
}

const MOODS = ['coherent', 'tense', 'loss', 'unstable']
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const nowS = () => performance.now() / 1000

// How much each kind of heard sound counts as "activity".
const HEARD_ENERGY = { footsteps: 0.03, tap: 0.06, clap: 0.1, hum: 0.08, whisper: 0.045, voice: 0.08, rhythm: 0.13, magnet: 0.05 }

function freshState() {
  return {
    started: false,
    activity: 0.04,
    stability: 0.5,
    confusion: 0.1,
    attachment: 0.15,
    mood: { coherent: 0, tense: 0, loss: 0, unstable: 0, forgotten: 1 },
    moodTarget: { coherent: 0, tense: 0, loss: 0, unstable: 0 },
    memory: { layouts: [], events: [], abandonments: 0, tensions: [] },
    lastHeard: null,
    currentInterpretation: { mood: 'forgotten', text: 'The house has been empty for a long time.', fired: [], roomMoods: {} },
    currentAction: { type: 'DORMANT', at: 0, rooms: [] },
    lastLayout: null,
    lastAnalysis: null,
    timeSinceActivity: 0,
    silenceStage: 3, // 0 awake · 1 quiet · 2 shutting down · 3 dormant
    dormant: true,
    wakeEnergy: 0,
    changeTimes: [],
    roomMarks: {}, // id → { mark: 'disturbed' | 'fading' | 'resisted' | 'warm' | 'woken', until }
    phantom: null, // a link the daemon temporarily mis-hears
    pulse: 0, // increments on every reaction, for visual ripples
    spoken: [],
    lastSpokeAt: -99,
    lastHeardLogAt: {},
  }
}

export class Daemon {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.listeners = new Set()
    this.s = freshState()
  }

  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(event) {
    for (const fn of this.listeners) fn(event)
  }

  reset() {
    this.s = freshState()
    this.emit({ type: 'reset' })
  }

  start() {
    if (this.s.started) return
    this.s.started = true
    this.s.timeSinceActivity = 0
    this.log('The house has been empty for a long time. I am still running.', 'system')
  }

  // ---------- speaking ----------

  log(text, kind = 'daemon', force = false) {
    const t = nowS()
    if (!force && text === this.s.spoken[this.s.spoken.length - 1]) return
    this.s.spoken = [...this.s.spoken.slice(-10), text]
    this.s.lastSpokeAt = t
    const entry = { id: `${t.toFixed(3)}-${Math.random().toString(36).slice(2, 6)}`, t, text, kind }
    this.s.memory.events = [...this.s.memory.events.slice(-40), entry]
    this.emit({ type: 'log', entry })
  }

  // For the app: narrate an event from narration.js (restorations, neglect, upgrades).
  narrate(key, ctx = {}, kind) {
    return LINES[key] ? this.say(LINES[key], ctx, kind) : this.log(key, kind ?? 'system')
  }

  say(options, ctx, kind) {
    const line = fill(pick(options, this.s.spoken), ctx)
    this.log(line, kind)
    return line
  }

  sound(name, opts = {}) {
    this.emit({ type: 'sound', name, ...opts })
  }

  // ---------- perception: sounds ----------

  hear(p) {
    const s = this.s
    if (!s.started) return
    const t = nowS()
    s.lastHeard = { ...p, at: t }
    this.emit({ type: 'heard', perception: s.lastHeard })

    if (p.kind === 'silence') {
      s.timeSinceActivity = Math.max(s.timeSinceActivity, this.config.silenceThreshold * 0.98)
      this.say(LINES.heard.silence, {}, 'heard')
      return
    }

    const energy = (HEARD_ENERGY[p.kind] ?? 0.05) * (0.5 + clamp(p.intensity ?? 0.5))
    if (s.dormant) {
      // A dormant house needs more than one small sound before it stirs.
      s.wakeEnergy += energy
      if (s.wakeEnergy > 0.11) this.wake()
      return
    }
    this.markActive()
    s.activity = clamp(s.activity + energy * (1 - s.activity * 0.5))

    switch (p.kind) {
      case 'hum':
        s.stability = clamp(s.stability + 0.04)
        s.confusion = clamp(s.confusion - 0.03)
        break
      case 'rhythm':
        s.stability = clamp(s.stability + 0.06)
        s.confusion = clamp(s.confusion - 0.06)
        s.attachment = clamp(s.attachment + 0.03)
        break
      case 'clap':
        s.confusion = clamp(s.confusion + 0.07)
        s.stability = clamp(s.stability - 0.03)
        if (s.mood.tense > 0.35) this.sound('door', { delay: 0.4 })
        else this.sound('relay')
        break
      case 'whisper':
        s.attachment = clamp(s.attachment + 0.02)
        break
      default:
        break
    }

    // Speak about what was heard, but not after every sound.
    const last = s.lastHeardLogAt[p.kind] ?? -99
    if (t - last > 9 && t - s.lastSpokeAt > 3 && LINES.heard[p.kind]) {
      s.lastHeardLogAt[p.kind] = t
      this.say(LINES.heard[p.kind], {}, 'heard')
    }
  }

  markActive() {
    const s = this.s
    if (s.silenceStage === 1 || s.silenceStage === 2) {
      this.say(LINES.RETURN_FROM_QUIET, {})
    }
    s.timeSinceActivity = 0
    s.silenceStage = 0
  }

  wake() {
    const s = this.s
    const times = s.memory.abandonments
    // Each time it has been left, it comes back a little more slowly and a little more confused.
    const warmth = 1 / (1 + times * 0.5)
    s.dormant = false
    s.wakeEnergy = 0
    s.silenceStage = 0
    s.timeSinceActivity = 0
    s.activity = clamp(s.activity + 0.18 + 0.14 * warmth)
    s.confusion = clamp(s.confusion + 0.08 + times * 0.06)
    s.mood.forgotten = Math.min(s.mood.forgotten, 0.7)
    s.currentAction = { type: 'WAKE', at: nowS(), rooms: [] }
    s.pulse++
    this.say(LINES.WAKE[Math.min(times, LINES.WAKE.length - 1)], {})
    this.sound('wake')
    this.emit({ type: 'action', action: s.currentAction })
    // If it already knows the house it is lying in, it re-reads it once awake.
    if (s.lastLayout) this.reconsider()
  }

  // ---------- perception: the board ----------

  considerLayout(rooms) {
    const s = this.s
    const prevRooms = s.lastLayout ?? []
    const d = diff(prevRooms, rooms)
    if (s.lastAnalysis && !d.any) return
    s.lastLayout = rooms.map((r) => ({ ...r }))
    if (!s.started) {
      s.lastAnalysis = analyse(rooms, this.config.layoutOptions)
      return
    }
    const t = nowS()
    s.changeTimes = [...s.changeTimes.filter((x) => t - x < 25), t]

    if (s.dormant) {
      // A block landing is a sound too.
      s.wakeEnergy += 0.06 + 0.04 * d.magnitude
      if (s.wakeEnergy > 0.11) this.wake()
      else s.lastAnalysis = analyse(rooms, this.config.layoutOptions)
      return
    }
    this.markActive()
    this.decide(rooms, d)
  }

  // Re-read the current layout without counting it as a change (after waking).
  reconsider() {
    const rooms = this.s.lastLayout ?? []
    this.decide(rooms, { added: [], removed: [], moved: [], magnitude: 0, any: false }, true)
  }

  // ---------- the decision engine ----------

  decide(rooms, d, quietly = false) {
    const s = this.s
    const t = nowS()
    const a = analyse(rooms, this.config.layoutOptions)
    const prevAnalysis = s.lastAnalysis
    s.lastAnalysis = a
    const { fired } = interpret(a)

    // Attention: it listens hardest where it just heard a block land or lift.
    const changedIds = new Set([...d.added, ...d.moved].map((r) => r.id))
    const pull = { coherent: 0, tense: 0, loss: 0, unstable: 0 }
    const near = { coherent: 0, tense: 0, loss: 0, unstable: 0 }
    for (const f of fired) {
      const salient = f.rooms.some((id) => changedIds.has(id)) || (d.removed.length && f.mood === 'loss' && !f.rooms.length)
      if (salient) {
        f.strength *= 1.8
        near[f.mood] += f.strength
      }
      pull[f.mood] += f.strength
    }
    fired.sort((x, y) => y.strength - x.strength)

    // Memory colours perception: recent tension makes it quicker to hear tension again.
    s.memory.tensions = s.memory.tensions.filter((x) => t - x < 120)
    const bias = 1 + 0.15 * s.memory.tensions.length
    pull.tense *= bias
    near.tense *= bias
    // Jali screens soften what it hears of arguments.
    const features = this.config.features ?? {}
    if (features.jali) {
      pull.tense *= 0.75
      near.tense *= 0.75
    }
    pull.unstable += s.confusion * 0.3
    const total = MOODS.reduce((sum, m) => sum + pull[m], 0) + 1e-6
    const nearTotal = MOODS.reduce((sum, m) => sum + near[m], 0)
    // Judged mostly by what just changed, partly by the whole house.
    const share = Object.fromEntries(
      MOODS.map((m) => [m, nearTotal > 0 ? 0.65 * (near[m] / nearTotal) + 0.35 * (pull[m] / total) : pull[m] / total]),
    )
    const dominant = MOODS.reduce((x, y) => (share[y] > share[x] ? y : x))

    const recentChanges = s.changeTimes.length
    const remembered = s.memory.layouts.find((m) => m.sig === a.signature)
    const priorAttachment = s.attachment

    // Update the inner variables.
    s.activity = clamp(s.activity + 0.08 + 0.08 * d.magnitude)
    // Repaired pipes make the house easier to follow.
    const confusionGain = (d.magnitude * 0.22 + Math.max(0, recentChanges - 3) * 0.06 + share.unstable * 0.12) * (features.pipes ? 0.75 : 1)
    s.confusion = clamp(s.confusion + confusionGain - (remembered ? 0.12 : 0))
    s.attachment = clamp(s.attachment * (1 - 0.55 * d.magnitude) + (remembered ? 0.12 : 0))
    const coherence = share.coherent - share.tense * 0.8 - share.unstable - share.loss * 0.6
    s.stability = clamp(s.stability + coherence * 0.18 - s.confusion * 0.06)

    // Each room's dominant mood, for subtle outlines on the board.
    const roomMoods = {}
    for (const f of fired) for (const id of f.rooms) if (!roomMoods[id]) roomMoods[id] = f.mood

    // Candidate actions and how much the daemon wants each one right now.
    const w = []
    const hasChange = d.moved.length + d.removed.length > 0
    w.push(['SETTLE', share.coherent * (1 - s.confusion) * (0.5 + s.stability)])
    w.push(['MARK_DISTURBED', share.tense * (0.7 + (1 - s.stability) * 0.6)])
    w.push(['MOURN', share.loss * (0.6 + s.attachment * 0.6)])
    w.push(['BECOME_CONFUSED', s.confusion ** 2 * 1.4 + share.unstable * 0.8 + (recentChanges >= 4 ? 0.35 : 0)])
    // It holds on harder to rooms someone has gilded.
    const gildedMoved = d.moved.some((r) => r.gilded) ? 0.6 : 0
    if (hasChange && prevAnalysis && prevAnalysis.rooms.length) w.push(['RESIST', priorAttachment * d.magnitude * 1.8 + gildedMoved])
    // Actions that only exist once the house has been upgraded.
    if (features.ventilation) w.push(['BREATHE', s.confusion * 0.9 + share.unstable * 0.4])
    if (features.city) w.push(['OPEN_WINDOWS', share.tense * 0.6])
    // Recognition is strong at first, then wears off if the same house keeps coming back.
    if (remembered && !quietly) w.push(['RECALL', 0.55 + Math.min(remembered.times, 2) * 0.1 - Math.max(0, remembered.times - 2) * 0.15])
    if (d.added.length) w.push(['ACTIVATE_SYSTEM', 0.25 + (1 - s.activity) * 0.5])
    if (d.removed.length && !d.added.length) w.push(['REMOVED', 0.3])
    w.push(['LISTEN', 0.12])
    if (!rooms.length) w.length = 0

    // A confused daemon chooses more erratically.
    const temperature = 0.18 + s.confusion * 0.6
    const action = rooms.length ? weightedChoice(w, temperature) : 'EMPTY'

    const ctxFor = (roomId, zone) => {
      const r = roomId ? a.byId.get(roomId) : null
      const z = zone ?? r?.zone ?? 'C'
      return { room: r ? ROOM_TYPES[r.type].label.toLowerCase() : 'room', zone: ZONE_NAMES[z], adj: ZONE_ADJECTIVE[z] }
    }
    const top = (mood) => fired.find((f) => f.mood === mood)
    const mark = (ids, kind, secs) => {
      for (const id of ids) s.roomMarks[id] = { mark: kind, until: t + secs }
    }
    let text = ''
    let targets = []
    let target = { ...share }
    const changed = [...d.added, ...d.moved]
    const focus = changed[changed.length - 1]

    switch (action) {
      case 'BREATHE': {
        s.confusion = clamp(s.confusion - 0.15)
        s.stability = clamp(s.stability + 0.05)
        target.unstable *= 0.5
        text = this.say(LINES.BREATHE, {})
        this.sound('breathe')
        break
      }
      case 'OPEN_WINDOWS': {
        target.tense *= 0.6
        target.coherent += 0.2
        text = this.say(LINES.OPEN_WINDOWS, {})
        this.sound('bells')
        break
      }
      case 'SETTLE': {
        const f = top('coherent')
        targets = fired.filter((x) => x.mood === 'coherent').flatMap((x) => x.rooms)
        mark(targets, 'warm', 12)
        s.stability = clamp(s.stability + 0.08)
        s.attachment = clamp(s.attachment + 0.08)
        target.coherent += 0.3
        text = f ? this.say(f.lines, ctxFor(f.rooms[0], f.zone)) : this.say(LINES.SETTLE, {})
        this.sound('chime')
        break
      }
      case 'MARK_DISTURBED': {
        const f = top('tense') ?? fired[0]
        targets = f?.rooms ?? []
        mark(targets, 'disturbed', 22)
        s.stability = clamp(s.stability - 0.08)
        s.memory.tensions.push(t)
        target.tense += 0.35
        text = f ? this.say(f.lines, ctxFor(f.rooms[0], f.zone)) : this.say(LINES.LISTEN, ctxFor(focus?.id))
        this.sound('door', { delay: 1.2, zone: f?.zone })
        break
      }
      case 'MOURN': {
        const f = top('loss') ?? fired[0]
        targets = fired.filter((x) => x.mood === 'loss').flatMap((x) => x.rooms)
        mark(targets, 'fading', 40)
        target.loss += 0.35
        text = f ? this.say(f.lines, ctxFor(f.rooms[0], f.zone)) : this.say(LINES.LISTEN, ctxFor(focus?.id))
        this.sound('stepsAway', { zone: f?.zone })
        break
      }
      case 'BECOME_CONFUSED': {
        targets = changed.map((r) => r.id)
        mark(targets, 'disturbed', 10)
        s.confusion = clamp(s.confusion + 0.08)
        target.unstable += 0.4
        text = this.say(LINES.BECOME_CONFUSED, ctxFor(focus?.id))
        this.sound('glitch')
        this.makePhantom(a, t)
        break
      }
      case 'RESIST': {
        // It refuses the change: keeps sounding like the house it remembers.
        const movedRoom = d.moved[0] ?? d.removed[0]
        const was = movedRoom && prevAnalysis?.byId.get(movedRoom.id)?.zone
        targets = d.moved.map((r) => r.id)
        mark(targets, 'resisted', 18)
        target = blend(s.moodTarget, share, 0.75)
        s.stability = clamp(s.stability - 0.05)
        s.confusion = clamp(s.confusion + 0.05)
        text = this.say(LINES.RESIST, { ...ctxFor(movedRoom?.id), was: was ? ZONE_NAMES[was] : undefined })
        this.sound('thud')
        break
      }
      case 'RECALL': {
        remembered.times++
        if (remembered.verdict === 'tense' || remembered.verdict === 'loss' || remembered.verdict === 'unstable') {
          target[remembered.verdict] += 0.5
          s.stability = clamp(s.stability - 0.06)
          if (remembered.verdict === 'tense') s.memory.tensions.push(t)
          text = this.say(LINES.RECALL_BAD, {})
          this.sound(remembered.verdict === 'tense' ? 'door' : 'stepsAway', { delay: 1 })
        } else {
          target.coherent += 0.4
          s.stability = clamp(s.stability + 0.12)
          s.confusion = clamp(s.confusion - 0.1)
          text = this.say(LINES.RECALL_GOOD, {})
          this.sound('chime')
        }
        break
      }
      case 'ACTIVATE_SYSTEM': {
        const r = d.added[d.added.length - 1]
        targets = d.added.map((x) => x.id)
        mark(targets, 'woken', 8)
        s.activity = clamp(s.activity + 0.1)
        text = this.say(LINES.ACTIVATE_SYSTEM, ctxFor(r.id))
        this.sound('pipes', { zone: a.byId.get(r.id)?.zone })
        break
      }
      case 'REMOVED': {
        const r = d.removed[0]
        const zone = prevAnalysis?.byId.get(r.id)?.zone
        text = this.say(LINES.REMOVED, { ...ctxFor(null, zone), room: ROOM_TYPES[r.type].label.toLowerCase() })
        target.loss += 0.15
        this.sound('stepsAway', { zone })
        break
      }
      case 'EMPTY': {
        target = { coherent: 0, tense: 0, loss: 0.6, unstable: 0 }
        text = this.say(LINES.EMPTY, {})
        break
      }
      default: {
        text = this.say(LINES.LISTEN, ctxFor(focus?.id))
        targets = focus ? [focus.id] : []
      }
    }

    s.moodTarget = normalise(target)
    const verdict = action === 'BECOME_CONFUSED' ? 'unstable' : dominant
    // A remembered layout keeps its old verdict when recalled, and takes the new one otherwise.
    if (remembered) {
      if (action !== 'RECALL') remembered.verdict = verdict
    } else {
      s.memory.layouts = [...s.memory.layouts.slice(-(this.config.memorySize - 1)), { sig: a.signature, verdict, times: 1, at: t }]
    }
    s.currentInterpretation = { mood: dominant, text, fired, roomMoods }
    s.currentAction = { type: action, at: t, rooms: targets }
    s.pulse++
    this.emit({ type: 'action', action: s.currentAction })
  }

  makePhantom(a, t) {
    if (a.rooms.length < 2) return
    if (Math.random() < 0.5 && a.pairs.length) {
      const p = a.pairs[Math.floor(Math.random() * a.pairs.length)]
      this.s.phantom = { kind: 'hidden', a: p.a, b: p.b, until: t + 4 + Math.random() * 3 }
    } else {
      const i = Math.floor(Math.random() * a.rooms.length)
      let j = Math.floor(Math.random() * a.rooms.length)
      if (j === i) j = (j + 1) % a.rooms.length
      this.s.phantom = { kind: 'ghost', a: a.rooms[i].id, b: a.rooms[j].id, until: t + 4 + Math.random() * 3 }
    }
  }

  // ---------- time ----------

  tick(dt) {
    const s = this.s
    if (!s.started) return
    const t = nowS()
    const T = this.config.silenceThreshold
    s.timeSinceActivity += dt

    // Silence: quiet → shutting down → dormant.
    if (!s.dormant) {
      if (s.silenceStage < 1 && s.timeSinceActivity > T * 0.5) {
        s.silenceStage = 1
        this.say(LINES.QUIET, {})
      }
      if (s.silenceStage < 2 && s.timeSinceActivity > T) {
        s.silenceStage = 2
        this.say(LINES.FADING, {})
        this.sound('shutdown')
        s.pulse++
      }
      if (s.silenceStage >= 2) {
        // An attached daemon holds on a little longer.
        // Restored ventilation keeps the house breathing longer.
        const rate = ((0.7 + (1 - s.attachment) * 0.6) / (T * 1.1)) * (this.config.features?.ventilation ? 0.7 : 1)
        s.activity = clamp(s.activity - dt * rate)
        if (s.activity < 0.05) {
          s.dormant = true
          s.silenceStage = 3
          s.wakeEnergy = 0
          s.memory.abandonments++
          s.currentAction = { type: 'DORMANT', at: t, rooms: [] }
          this.say(LINES.DORMANT, {})
          this.emit({ type: 'action', action: s.currentAction })
        }
      } else if (s.activity > 0.55) {
        s.activity -= (s.activity - 0.55) * dt * 0.03
      }
    }

    // Slow drift of the inner variables.
    s.confusion = clamp(s.confusion - dt * 0.008)
    if (s.silenceStage === 0 && t - (s.changeTimes[s.changeTimes.length - 1] ?? 0) > 12) {
      s.attachment = clamp(s.attachment + dt * 0.005 * s.activity)
    }

    // Moods drift toward their targets; silence pulls everything toward "forgotten".
    const silence = s.dormant ? 1 : clamp((s.timeSinceActivity - T * 0.5) / (T * 1.2))
    const k = Math.min(1, dt * 0.5)
    for (const m of MOODS) s.mood[m] += (s.moodTarget[m] * (1 - silence * 0.8) - s.mood[m]) * k
    s.mood.forgotten += (silence - s.mood.forgotten) * Math.min(1, dt * 0.3)

    // Occasional mis-hearing when confused.
    if (s.confusion > 0.5 && !s.phantom && s.lastAnalysis && Math.random() < dt * 0.12 * s.confusion) {
      this.makePhantom(s.lastAnalysis, t)
    }
    if (s.phantom && s.phantom.until < t) s.phantom = null
    for (const [id, m] of Object.entries(s.roomMarks)) if (m.until < t) delete s.roomMarks[id]
  }

  // ---------- what the outside world may see ----------

  view() {
    const s = this.s
    const m = s.mood
    let phase = 'LISTENING'
    if (!s.started) phase = 'ABANDONED'
    else if (s.dormant) phase = 'DORMANT'
    else if (s.silenceStage === 2) phase = 'SHUTTING DOWN'
    else if (s.silenceStage === 1) phase = 'GROWING QUIET'
    else if (s.confusion > 0.6 || m.unstable > 0.45) phase = 'UNSTABLE'
    else {
      const top = MOODS.reduce((x, y) => (m[y] > m[x] ? y : x))
      if (m[top] > 0.3) phase = { coherent: 'SETTLED', tense: 'UNEASY', loss: 'GRIEVING', unstable: 'UNSTABLE' }[top]
    }
    // The fictional outcome it currently believes in.
    let outcome = 'listening'
    if (!s.started || s.dormant || s.silenceStage >= 1) outcome = 'abandonment'
    else if (phase === 'UNSTABLE') outcome = 'confusion'
    else if (phase === 'SETTLED') outcome = 'harmony'
    else if (phase === 'UNEASY') outcome = 'tension'
    else if (phase === 'GRIEVING') outcome = 'isolation'
    return {
      started: s.started,
      phase,
      outcome,
      recentTensions: s.memory.tensions.length,
      activity: s.activity,
      stability: s.stability,
      confusion: s.confusion,
      attachment: s.attachment,
      mood: { ...m },
      dormant: s.dormant,
      silenceStage: s.silenceStage,
      timeSinceActivity: s.timeSinceActivity,
      silenceThreshold: this.config.silenceThreshold,
      interpretation: s.currentInterpretation,
      action: s.currentAction,
      roomMarks: { ...s.roomMarks },
      phantom: s.phantom,
      pulse: s.pulse,
      lastHeard: s.lastHeard,
      memoryCount: s.memory.layouts.length,
      abandonments: s.memory.abandonments,
    }
  }
}

function weightedChoice(weights, temperature) {
  const valid = weights.filter(([, v]) => v > 0)
  if (!valid.length) return 'LISTEN'
  const max = Math.max(...valid.map(([, v]) => v))
  const exps = valid.map(([k, v]) => [k, Math.exp((v - max) / temperature)])
  const sum = exps.reduce((acc, [, v]) => acc + v, 0)
  let r = Math.random() * sum
  for (const [k, v] of exps) {
    r -= v
    if (r <= 0) return k
  }
  return exps[exps.length - 1][0]
}

function blend(a, b, keepA) {
  return Object.fromEntries(MOODS.map((m) => [m, (a[m] ?? 0) * keepA + (b[m] ?? 0) * (1 - keepA)]))
}

function normalise(target) {
  const total = MOODS.reduce((sum, m) => sum + Math.max(0, target[m] ?? 0), 0) || 1
  return Object.fromEntries(MOODS.map((m) => [m, Math.max(0, target[m] ?? 0) / total]))
}
