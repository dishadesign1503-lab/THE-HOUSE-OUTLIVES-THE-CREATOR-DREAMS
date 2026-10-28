// WHAT THE VISITOR HEARS — the house's sounds, synthesised with the earlier project's SoundEngine
// (src/daemon/voice/soundEngine.js). Every sound here mirrors a sound source in the simulation,
// panned by the room it comes from, so the ears and his head turns tell the same story.

import { SoundEngine } from '../../daemon/voice/soundEngine.js'
import { ROOM, SIZE, roomPoint, restLattice } from '../house/plan.js'

const REST = restLattice()
const rand = (a, b) => a + Math.random() * (b - a)

export class HouseAudio {
  constructor() {
    this.engine = new SoundEngine()
    this.seen = new Set()
    this.pulses = {}
    this.loops = {}
    this.nextNote = 0
    this.breathPhase = 0
    this.radio = null
  }

  get ready() {
    return this.engine.ready
  }

  async start() {
    await this.engine.init()
    this.engine.setVolume(0.6)
  }

  setMuted(m) {
    this.engine.setMuted(m)
  }

  panOf(s) {
    if (s.outside) return -0.4
    const p = roomPoint(ROOM[s.room], REST, s.u ?? 0.5, s.v ?? 0.5)
    return ((p.x / SIZE) * 2 - 1) * 0.85
  }

  // Called a few times a second with the current world.
  sync(world) {
    const E = this.engine
    if (!E.ready || E.stopped || E.ctx.state !== 'running') return
    const env = world.env
    const t = E.ctx.currentTime + 0.02
    const live = new Set()
    for (const s of env.sounds) {
      live.add(s.id)
      const pan = this.panOf(s)
      if (!this.seen.has(s.id)) {
        this.seen.add(s.id)
        this.oneShot(s, t, pan)
      }
      if (s.pattern === 'ring' || s.pattern === 'chime') {
        if (s.lastPulse !== this.pulses[s.id] && s.lastPulse >= 0) {
          this.pulses[s.id] = s.lastPulse
          if (s.pattern === 'ring') this.ring(t, pan)
          else this.chime(t, pan, s.level)
        }
      }
      if (s.kind === 'radio' || s.kind === 'hum') this.loop(s, pan)
    }
    for (const [id, node] of Object.entries(this.loops)) {
      if (!live.has(id)) {
        node.gain.gain.setTargetAtTime(0, t, 0.15)
        setTimeout(() => node.stop(), 800)
        delete this.loops[id]
      }
    }
    if (this.radio && t > this.nextNote) {
      const notes = [220, 247, 262, 294, 330, 392]
      E.tone(t, { freq: notes[Math.floor(Math.random() * notes.length)], dur: 0.9, type: 'triangle', gain: 0.03, pan: this.radio.pan, wet: 0.4, attack: 0.03 })
      this.nextNote = t + rand(0.35, 0.8)
    }
    // Vibrations from machines and thunder are felt as thuds.
    for (const e of world.fx) {
      if (this.seen.has(e.id)) continue
      this.seen.add(e.id)
      if (e.type === 'vibration' && e.subtype === 'machine') {
        E.tone(t, { freq: 52, to: 38, dur: 0.35, gain: 0.16 * e.intensity, pan: this.panOfRoom(e.room), wet: 0.3 })
        E.burst(t, { dur: 0.12, type: 'lowpass', freq: 160, gain: 0.12 * e.intensity, pan: this.panOfRoom(e.room), wet: 0.3 })
      }
    }
    // The house's air: wind follows the airflow, the storm adds its weight.
    let air = 0
    for (const r of Object.values(env.rooms)) air += r.air.mag
    E.setLayers(
      {
        house: 0.5,
        hum: 0.15,
        wind: Math.min(1, air * 0.5 + (env.outside.storm ? 0.7 : 0.1)),
        resonance: world.story.phase === 'ending' && world.story.ending?.kind === 'restored' ? 0.5 : 0,
        muffle: 0.15,
      },
      1.5,
    )
    // His breath, barely audible.
    const b = world.body.breath.phase
    if (Math.floor(b / (Math.PI * 2)) !== Math.floor(this.breathPhase / (Math.PI * 2))) {
      E.burst(t, { dur: 1.6, type: 'bandpass', freq: 520, q: 0.8, gain: 0.012 + world.mind.irritation * 0.01, pan: 0.2, wet: 0.5, attack: 0.7 })
    }
    this.breathPhase = b
  }

  panOfRoom(roomId) {
    return this.panOf({ room: roomId })
  }

  loop(s, pan) {
    if (this.loops[s.id]) return
    const E = this.engine
    const ctx = E.ctx
    const g = ctx.createGain()
    g.gain.value = 0
    const out = E.out(pan, 0.35)
    g.connect(out)
    const nodes = []
    if (s.kind === 'radio') {
      const src = E.loopNoise(E.noise)
      src.connect(E.filter('bandpass', 1800, 0.7)).connect(g)
      nodes.push(src)
      g.gain.setTargetAtTime(0.02, ctx.currentTime, 0.3)
      this.radio = { pan }
    } else {
      const disruptive = s.level > 0.1
      const f = s.machine === 'extractor' ? 95 : s.machine === 'fridge' ? 58 : s.machine === 'pump' ? 72 : 64
      const o = E.osc('sawtooth', f)
      const lp = E.filter('lowpass', disruptive ? 420 : 240)
      o.connect(lp).connect(g)
      nodes.push(o)
      if (disruptive) E.lfo(1.7, 0.4, g.gain)
      g.gain.setTargetAtTime(disruptive ? 0.05 : 0.018, ctx.currentTime, 0.4)
    }
    this.loops[s.id] = {
      gain: g,
      stop: () => {
        for (const n of nodes) n.stop()
        if (s.kind === 'radio') this.radio = null
      },
    }
  }

  ring(t, pan) {
    const E = this.engine
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.8
      for (let k = 0; k < 14; k++) {
        E.tone(at + k * 0.05, { freq: 440, dur: 0.045, gain: 0.05, pan, wet: 0.35, attack: 0.002 })
        E.tone(at + k * 0.05, { freq: 480, dur: 0.045, gain: 0.04, pan, wet: 0.35, attack: 0.002 })
      }
    }
  }

  chime(t, pan, level) {
    const E = this.engine
    for (let i = 0; i < 3; i++) E.tone(t + i * 0.32, { freq: 1568, dur: 0.5, gain: 0.03 + level * 0.03, pan, wet: 0.55, attack: 0.003 })
  }

  oneShot(s, t, pan) {
    const E = this.engine
    switch (s.kind) {
      case 'knock':
        for (let i = 0; i < 3; i++) {
          E.burst(t + i * 0.32, { dur: 0.12, type: 'lowpass', freq: 380, gain: 0.5, pan, wet: 0.45 })
          E.tone(t + i * 0.32, { freq: 110, to: 70, dur: 0.15, gain: 0.3, pan, wet: 0.4 })
        }
        break
      case 'creak':
        E.creak(t, { dur: 1.1, gain: 0.05, pan, bus: 'events' })
        break
      case 'bang':
        E.play('door', { pan, force: true })
        break
      case 'scrape':
        E.burst(t, { dur: 1.3, type: 'bandpass', freq: 240, q: 1.4, gain: 0.25, pan, wet: 0.35, attack: 0.15 })
        E.tone(t + 1.1, { freq: 60, to: 40, dur: 0.4, gain: 0.3, pan, wet: 0.4 })
        break
      case 'clunk':
        E.play('thud', { pan, force: true })
        E.play('relay', { pan, force: true })
        break
      case 'rummage':
        for (let i = 0; i < 7; i++) E.burst(t + i * rand(0.12, 0.25), { dur: 0.08, type: 'bandpass', freq: rand(600, 2200), q: 1.5, gain: 0.12, pan, wet: 0.3 })
        break
      case 'latch':
        E.burst(t, { dur: 0.05, freq: 2600, q: 3, gain: 0.15, pan, wet: 0.2 })
        E.burst(t + 0.08, { dur: 0.04, freq: 1500, q: 3, gain: 0.1, pan, wet: 0.2 })
        break
      case 'pipes':
        for (let i = 0; i < 3; i++) E.burst(t + i * rand(0.2, 0.4), { dur: 0.03, freq: 900, q: 4, gain: 0.08, pan, wet: 0.5 })
        break
      case 'ignite':
        E.burst(t, { dur: 0.6, type: 'highpass', freq: 1200, gain: 0.08, pan, wet: 0.2, attack: 0.05 })
        break
      case 'match':
        E.burst(t, { dur: 0.3, freq: 3000, q: 1, gain: 0.08, pan, wet: 0.2 })
        break
      case 'receiver':
        E.burst(t, { dur: 0.06, type: 'lowpass', freq: 700, gain: 0.2, pan, wet: 0.2 })
        break
      case 'rustle':
        E.burst(t, { dur: 0.7, type: 'bandpass', freq: 3500, q: 0.6, gain: 0.05, pan, wet: 0.2, attack: 0.2 })
        break
      case 'thunder':
        E.tone(t, { freq: 48, to: 30, dur: 3.2, type: 'sawtooth', gain: 0.06, pan: -0.3, wet: 0.8, attack: 0.3 })
        E.burst(t, { dur: 3, type: 'lowpass', freq: 140, gain: 0.35, pan: -0.3, wet: 0.8, attack: 0.25 })
        break
      default:
        break
    }
  }
}
