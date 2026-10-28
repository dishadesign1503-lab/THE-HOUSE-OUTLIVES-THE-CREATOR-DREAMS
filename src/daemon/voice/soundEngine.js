// SOUNDS THE DAEMON PRODUCES (and the house around it).
// Everything is synthesised with the Web Audio API, so the prototype works with no audio files.
// Optional recordings can replace any layer or one-shot: put them in public/audio/ and list
// them in public/audio/manifest.json (see the README). Missing files are simply skipped.
//
// Two buses, each with its own volume and reverb:
//   ambience — the continuous house: layers below, crossfaded slowly
//   events   — one-shots: doors, chimes, coins, cues, the visitor's own sounds
//
// Ambience layers (0..1, set with setLayers):
//   continuous: hum, vent, wind, house, tension, mourning, resonance, city, water, cooking, distortion
//   scheduled:  footsteps, clinks, voices, laughter, children, birds, argument, sigh, crying,
//               fadingVoice, clock, drip, creak, pipes, doorsMoving, clicks, bells, mechanics
//   modifiers:  muffle (lowpass), interrupt (dropouts), instability (detune), ventRattle

const ZONE_PAN = { N: 0, NE: 0.55, E: 0.85, SE: 0.55, S: 0, SW: -0.55, W: -0.85, NW: -0.55, C: 0 }
const rand = (a, b) => a + Math.random() * (b - a)
const clamp01 = (v) => Math.max(0, Math.min(1, v ?? 0))

const CONTINUOUS_MAX = {
  hum: 0.2,
  vent: 0.11,
  wind: 0.18,
  house: 0.1,
  tension: 0.07,
  mourning: 0.06,
  resonance: 0.14,
  city: 0.08,
  water: 0.07,
  cooking: 0.05,
  distortion: 0.045,
}
const CONTINUOUS = Object.keys(CONTINUOUS_MAX)

// Scheduled layers: events per second at level 1, and the minimum gap after each event.
const SCHEDULED = {
  footsteps: [0.15, 1],
  clinks: [0.3, 0.3],
  voices: [0.14, 0.8],
  laughter: [0.08, 3],
  children: [0.07, 2.5],
  birds: [0.35, 0.4],
  argument: [0.22, 0.6],
  sigh: [0.05, 6],
  crying: [0.06, 2.5],
  fadingVoice: [0.03, 8],
  drip: [0.4, 0.3],
  creak: [0.08, 2],
  pipes: [0.06, 3],
  doorsMoving: [0.04, 6],
  clicks: [0.6, 0.1],
  bells: [0.025, 20],
}

// Minimum seconds between two plays of the same one-shot (no stacked duplicates).
const ONE_SHOT_GAP = { door: 2.5, chime: 1.2, stepsAway: 4, glitch: 0.8, thud: 1, pipes: 2, wake: 4, shutdown: 4, relay: 0.3, magnet: 0.04, lift: 0.08, breathe: 3, bells: 8, coin: 0.08, upgrade: 0.5, sigh: 3, laugh: 2 }

export class SoundEngine {
  constructor() {
    this.ctx = null
    this.volume = 0.5
    this.busVolume = { ambience: 0.75, events: 0.8 }
    this.muted = false
    this.stopped = false
    this.levels = {}
    this.samples = {}
    this.sampleLoops = {}
    this.busy = {}
    this.lastPlayed = {}
    this.clock = { next: 0, tock: false }
    this.mech = { a: 0, b: 0 }
  }

  get ready() {
    return !!this.ctx
  }

  // Must be called from a click or key press (browser autoplay rules).
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.stopped) await this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) throw new Error('Web Audio is not available in this browser.')
    const ctx = new AC()
    this.ctx = ctx

    this.master = ctx.createGain()
    this.master.gain.value = 0
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -16
    limiter.ratio.value = 10
    limiter.attack.value = 0.003
    limiter.release.value = 0.3
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.master.connect(limiter).connect(this.analyser).connect(ctx.destination)

    this.noise = this.noiseBuffer(3, 'white')
    this.brown = this.noiseBuffer(4, 'brown')
    const impulse = this.impulse(3.4, 2.4)

    // Ambience bus: input → dropout gate → muffling lowpass → volume → master
    this.buses = {}
    for (const name of ['ambience', 'events']) {
      const input = ctx.createGain()
      const reverb = ctx.createConvolver()
      reverb.buffer = impulse
      const wet = ctx.createGain()
      wet.gain.value = 0.55
      const out = ctx.createGain()
      out.gain.value = this.busVolume[name]
      input.connect(out)
      reverb.connect(wet).connect(out)
      this.buses[name] = { input, reverb, out }
    }
    this.gate = ctx.createGain()
    this.muffle = ctx.createBiquadFilter()
    this.muffle.type = 'lowpass'
    this.muffle.frequency.value = 18000
    this.buses.ambience.out.connect(this.gate).connect(this.muffle).connect(this.master)
    this.buses.events.out.connect(this.master)

    this.buildLayers()
    this.applyVolume(1.2)
    this.timer = setInterval(() => this.schedule(), 100)
    if (ctx.state === 'suspended') await ctx.resume()
    this.loadSamples()
  }

  // ---------- controls ----------

  setVolume(v) {
    this.volume = v
    this.applyVolume()
  }

  setBusVolume(bus, v) {
    this.busVolume[bus] = v
    if (this.ctx) this.buses[bus].out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15)
  }

  setMuted(m) {
    this.muted = m
    this.applyVolume()
  }

  applyVolume(tau = 0.15) {
    if (!this.ctx) return
    const g = this.muted || this.stopped ? 0 : this.volume
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, tau)
  }

  // Immediate silence, and the audio clock stops.
  stop() {
    this.stopped = true
    if (!this.ctx) return
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.setValueAtTime(0, this.ctx.currentTime)
    this.ctx.suspend()
  }

  async resume() {
    this.stopped = false
    if (!this.ctx) return this.init()
    await this.ctx.resume()
    this.applyVolume(0.8)
  }

  // Rough loudness of what is coming out of the speakers (0..1), used to stop the
  // microphone from mistaking the daemon's own sounds for visitors.
  outputLevel() {
    if (!this.ctx || this.stopped || this.muted) return 0
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += ((v - 128) / 128) ** 2
    return Math.sqrt(sum / data.length)
  }

  // New target mix. Changes fade over a couple of seconds, so states crossfade.
  setLayers(levels, fade = 1.8) {
    if (!this.ctx) return
    this.levels = levels
    const t = this.ctx.currentTime
    for (const name of CONTINUOUS) {
      const lv = clamp01(levels[name])
      const target = this.sampleLoops[name] ? 0 : lv * CONTINUOUS_MAX[name]
      this.layers[name].gain.setTargetAtTime(target, t, fade)
    }
    for (const [name, loop] of Object.entries(this.sampleLoops)) loop.gain.gain.setTargetAtTime(clamp01(levels[name]) * 0.6, t, fade)
    const inst = clamp01(levels.instability)
    this.humOsc[1].frequency.setTargetAtTime(110 + inst * 7, t, 2)
    this.humOsc[2].detune.setTargetAtTime(inst * 60, t, 2)
    this.ventRattle.gain.setTargetAtTime(clamp01(levels.ventRattle) * 0.6, t, 1)
    const m = clamp01(levels.muffle)
    this.muffle.frequency.setTargetAtTime(18000 * (1 - m) ** 3 + 450, t, 1.2)
  }

  // ---------- building blocks ----------

  noiseBuffer(seconds, colour) {
    const ctx = this.ctx
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      if (colour === 'brown') {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else d[i] = w
    }
    return buf
  }

  impulse(seconds, decay) {
    const ctx = this.ctx
    const len = ctx.sampleRate * seconds
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay
    }
    return buf
  }

  loopNoise(buffer) {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.start(0, Math.random() * buffer.duration)
    return src
  }

  lfo(freq, depth, param) {
    const o = this.ctx.createOscillator()
    o.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.value = depth
    o.connect(g).connect(param)
    o.start()
    return g
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }

  // A channel strip: gain → panner → bus (dry) + bus reverb.
  out(pan = 0, wet = 0.4, bus = 'events') {
    const ctx = this.ctx
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    const send = ctx.createGain()
    send.gain.value = wet
    g.connect(p)
    p.connect(this.buses[bus].input)
    p.connect(send).connect(this.buses[bus].reverb)
    return g
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.start()
    return o
  }

  buildLayers() {
    const ctx = this.ctx
    const L = {}
    for (const name of CONTINUOUS) {
      L[name] = ctx.createGain()
      L[name].gain.value = 0
    }
    this.layers = L
    const amb = (pan, wet) => this.out(pan, wet, 'ambience')

    // Electrical hum: mains-like fundamentals, darkened.
    const humFilter = this.filter('lowpass', 260)
    this.humOsc = [
      ['sine', 55, 0.7],
      ['sine', 110, 0.45],
      ['sawtooth', 165, 0.08],
    ].map(([type, f, g]) => {
      const o = this.osc(type, f)
      const gn = ctx.createGain()
      gn.gain.value = g
      o.connect(gn).connect(humFilter)
      return o
    })
    const humWobble = ctx.createGain()
    this.lfo(0.13, 0.15, humWobble.gain)
    humFilter.connect(humWobble).connect(L.hum)
    L.hum.connect(amb(0, 0.25))

    // Ventilation: band-passed noise that breathes; a rattle when the shafts are broken.
    const ventF = this.filter('bandpass', 340, 1.4)
    this.lfo(0.06, 140, ventF.frequency)
    const rattle = ctx.createGain()
    rattle.gain.value = 1
    this.ventRattle = this.lfo(7.5, 0, rattle.gain)
    this.loopNoise(this.noise).connect(ventF).connect(rattle).connect(L.vent)
    L.vent.connect(amb(-0.3, 0.5))

    // Wind: outdoors, or through an empty structure.
    const windLP = this.filter('lowpass', 520, 2)
    this.lfo(0.045, 320, windLP.frequency)
    const windAmp = ctx.createGain()
    windAmp.gain.value = 0.8
    this.lfo(0.08, 0.35, windAmp.gain)
    this.loopNoise(this.noise).connect(this.filter('highpass', 140)).connect(windLP).connect(windAmp).connect(L.wind)
    L.wind.connect(amb(0.35, 0.6))

    // Room tone: the low rumble of a house with things in it.
    this.loopNoise(this.brown).connect(this.filter('lowpass', 300)).connect(L.house)
    L.house.connect(amb(0, 0.3))

    // Tension: two close low tones beating against each other, swelling slowly.
    const tensF = this.filter('lowpass', 420)
    for (const f of [98, 103.5]) this.osc('sawtooth', f).connect(tensF)
    const tensAmp = ctx.createGain()
    tensAmp.gain.value = 0.7
    this.lfo(0.09, 0.3, tensAmp.gain)
    tensF.connect(tensAmp).connect(L.tension)
    L.tension.connect(amb(0, 0.5))

    // Mourning: a soft minor pad, far away.
    const mournF = this.filter('lowpass', 900)
    for (const f of [110, 130.8, 164.8, 220]) {
      const g = ctx.createGain()
      g.gain.value = 0.25
      this.lfo(rand(0.03, 0.07), 0.12, g.gain)
      this.osc('sine', f).connect(g).connect(mournF)
    }
    mournF.connect(L.mourning)
    L.mourning.connect(amb(0, 0.85))

    // Structural resonance: the building's low groan.
    const res = ctx.createGain()
    res.gain.value = 0.6
    this.lfo(0.05, 0.4, res.gain)
    this.osc('sine', 41).connect(res)
    this.loopNoise(this.brown).connect(this.filter('lowpass', 90)).connect(res)
    res.connect(L.resonance)
    L.resonance.connect(amb(0, 0.4))

    // The town outside: distant traffic and life.
    this.loopNoise(this.brown).connect(this.filter('bandpass', 380, 0.6)).connect(L.city)
    L.city.connect(amb(0.5, 0.6))

    // Running water (taps, basin) and cooking (a soft sizzle).
    const waterF = this.filter('bandpass', 1400, 0.8)
    this.lfo(3.1, 300, waterF.frequency)
    this.loopNoise(this.noise).connect(waterF).connect(L.water)
    L.water.connect(amb(-0.2, 0.45))
    const cookF = this.filter('highpass', 3000)
    const crackle = ctx.createGain()
    this.lfo(13, 0.5, crackle.gain)
    this.loopNoise(this.noise).connect(cookF).connect(crackle).connect(L.cooking)
    L.cooking.connect(amb(0.2, 0.3))

    // Distortion: a buzzing, broken version of the hum, gated irregularly by the scheduler.
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / curve.length) * 2 - 1) * 6)
    shaper.curve = curve
    this.distGate = ctx.createGain()
    this.distGate.gain.value = 0
    this.osc('square', 82).connect(shaper).connect(this.filter('bandpass', 900)).connect(this.distGate).connect(L.distortion)
    L.distortion.connect(amb(0, 0.3))
  }

  // ---------- primitive sounds ----------

  burst(t, { dur = 0.05, type = 'bandpass', freq = 1000, q = 1, gain = 0.3, pan = 0, wet = 0.3, attack = 0.002, bus = 'events' }) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(this.filter(type, freq, q)).connect(g).connect(this.out(pan, wet, bus))
    src.start(t, Math.random() * 2)
    src.stop(t + dur + 0.05)
  }

  tone(t, { freq = 440, to, dur = 0.3, type = 'sine', gain = 0.2, pan = 0, wet = 0.3, attack = 0.005, vibrato = 0, rate = 5.5, bus = 'events' }) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
    if (vibrato) {
      const v = ctx.createOscillator()
      v.frequency.value = rate
      const vg = ctx.createGain()
      vg.gain.value = vibrato
      v.connect(vg).connect(o.frequency)
      v.start(t)
      v.stop(t + dur + 0.05)
    }
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.out(pan, wet, bus))
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  footstep(t, gain, pan, wet = 0.35, bus = 'ambience') {
    this.burst(t, { dur: 0.09, type: 'lowpass', freq: 220, q: 0.7, gain: gain * 1.2, pan, wet, bus })
    this.tone(t, { freq: 75, to: 48, dur: 0.1, gain: gain * 0.9, pan, wet, bus })
    this.burst(t + 0.01, { dur: 0.03, freq: 2400, q: 1.5, gain: gain * 0.15, pan, wet, bus })
  }

  steps(t, { count = 6, interval = 0.52, gain = 0.25, fade = 0, pan = 0, panTo = pan, wetTo = 0.4, bus = 'ambience' }) {
    for (let i = 0; i < count; i++) {
      const k = count > 1 ? i / (count - 1) : 0
      this.footstep(t + i * interval + rand(-0.03, 0.03), gain * (1 - fade * k), pan + (panTo - pan) * k, 0.3 + (wetTo - 0.3) * k, bus)
    }
    return count * interval
  }

  // A voice-like murmur: a buzzing source through two formants, muffled as if through a wall.
  // It has the rhythm and pitch of speech but no words.
  syllable(t, { f0, dur, gain, pan, wet = 0.5, muffle = 1400, formants, bus = 'ambience' }) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f0, t)
    o.frequency.linearRampToValueAtTime(f0 * rand(0.85, 1.15), t + dur)
    const mix = ctx.createGain()
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(gain, t + Math.min(0.035, dur / 3))
    env.gain.setValueAtTime(gain, t + dur * 0.6)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const bands = formants ?? [
      [rand(400, 850), rand(400, 850)],
      [rand(950, 1900), rand(950, 1900)],
    ]
    for (const [a, b] of bands) {
      const f = this.filter('bandpass', a, 6)
      f.frequency.linearRampToValueAtTime(b, t + dur)
      o.connect(f).connect(mix)
    }
    mix.connect(env).connect(this.filter('lowpass', muffle)).connect(this.out(pan, wet, bus))
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  phrase(t, { base = 120, count = 5, gain = 0.1, pan = 0, pace = 1, rise = 0, muffle = 1300, wet = 0.5, fade = 0, bus = 'ambience' }) {
    let at = t
    for (let i = 0; i < count; i++) {
      const dur = rand(0.11, 0.26) / pace
      const contour = 1 + rise * (i / count) - 0.08 * (i === count - 1 ? 1 : 0)
      const g = gain * rand(0.7, 1) * (1 - fade * (i / count))
      this.syllable(at, { f0: base * contour * rand(0.94, 1.06), dur, gain: g, pan, muffle: muffle * (1 - fade * 0.6 * (i / count)), wet, bus })
      at += dur + rand(0.03, 0.12) / pace
    }
    return at - t
  }

  laugh(t, { base = 230, gain = 0.06, pan = 0, wet = 0.55, bus = 'ambience' }) {
    const n = Math.floor(rand(4, 7))
    for (let i = 0; i < n; i++) {
      const at = t + i * rand(0.13, 0.17)
      this.syllable(at, { f0: base * (1 - i * 0.035), dur: 0.09, gain: gain * (1 - i * 0.1), pan, wet, muffle: 2200, formants: [[750, 720], [1250, 1180]], bus })
      this.burst(at, { dur: 0.08, freq: 1600, q: 0.8, gain: gain * 0.25, pan, wet, bus })
    }
    return n * 0.16
  }

  bird(t, pan) {
    const n = Math.floor(rand(2, 6))
    const trill = Math.random() < 0.3
    let at = t
    for (let i = 0; i < n; i++) {
      const up = Math.random() < 0.6
      const f = rand(2600, 3600)
      const dur = rand(0.05, 0.12)
      this.tone(at, { freq: up ? f : f * 1.35, to: up ? f * 1.35 : f, dur, gain: rand(0.012, 0.025), pan, wet: 0.45, vibrato: trill ? 250 : 0, rate: 28, bus: 'ambience' })
      at += dur + rand(0.04, 0.11)
    }
    return at - t
  }

  sob(t, { gain = 0.045, pan = 0 }) {
    const f = rand(380, 470)
    for (let i = 0; i < 3; i++) {
      const at = t + i * rand(0.32, 0.42)
      this.tone(at, { freq: f * (1 - i * 0.04), to: f * 0.72, dur: 0.55, type: 'triangle', gain, pan, wet: 0.8, attack: 0.06, vibrato: 9, bus: 'ambience' })
      this.burst(at, { dur: 0.25, freq: 1800, q: 0.6, gain: gain * 0.4, pan, wet: 0.8, attack: 0.05, bus: 'ambience' })
    }
    this.burst(t + 1.4, { dur: 0.9, type: 'highpass', freq: 2200, q: 0.5, gain: gain * 0.35, pan, wet: 0.8, attack: 0.5, bus: 'ambience' })
    return 2.4
  }

  sigh(t, { gain = 0.05, pan = 0, bus = 'ambience' }) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.filter('bandpass', 1300, 0.9)
    f.frequency.setValueAtTime(1500, t)
    f.frequency.exponentialRampToValueAtTime(600, t + 1.1)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
    src.connect(f).connect(g).connect(this.out(pan, 0.4, bus))
    src.start(t)
    src.stop(t + 1.3)
    this.tone(t + 0.1, { freq: 150, to: 95, dur: 0.9, type: 'triangle', gain: gain * 0.25, pan, wet: 0.4, attack: 0.2, bus })
    return 1.3
  }

  creak(t, { dur = rand(0.8, 1.6), gain = 0.03, pan = 0, bus = 'ambience' }) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const base = rand(50, 90)
    const curve = new Float32Array(24).map(() => base * rand(0.85, 1.25))
    o.frequency.setValueCurveAtTime(curve, t, dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(this.filter('bandpass', rand(650, 900), 6)).connect(this.filter('highpass', 300)).connect(g).connect(this.out(pan, 0.5, bus))
    o.start(t)
    o.stop(t + dur + 0.05)
    return dur
  }

  drip(t, pan) {
    const f = rand(700, 1100)
    this.tone(t, { freq: f, to: f * 2.1, dur: 0.06, gain: rand(0.025, 0.045), pan, wet: 0.85, bus: 'ambience' })
    return 0.1
  }

  tick(t, high, gain = 0.04, bus = 'ambience') {
    this.burst(t, { dur: 0.015, type: 'highpass', freq: 2500, gain, wet: 0.6, bus })
    this.tone(t, { freq: high ? 1900 : 1500, dur: 0.03, gain: gain * 0.5, wet: 0.6, bus })
  }

  bell(t, { f = rand(196, 262), gain = 0.03, pan = 0.4 }) {
    for (const [ratio, decay, g] of [[0.5, 6, 0.6], [1, 5, 1], [1.183, 4, 0.5], [1.506, 3.5, 0.4], [2, 3, 0.35], [2.514, 2.5, 0.2], [2.662, 2, 0.15]]) {
      this.tone(t, { freq: f * ratio, dur: decay, gain: gain * g, pan, wet: 0.75, attack: 0.004, bus: 'ambience' })
    }
  }

  // ---------- one-shots (events bus) ----------

  play(name, { zone, pan, delay = 0, x, force = false, size } = {}) {
    if (!this.ctx || this.stopped || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    if (!force && now - (this.lastPlayed[name] ?? -99) < (ONE_SHOT_GAP[name] ?? 0)) return
    this.lastPlayed[name] = now
    const t = now + 0.02 + delay
    const p = pan ?? (x !== undefined ? x : ZONE_PAN[zone] ?? rand(-0.4, 0.4))
    if (this.samples[name]) return this.playSample(name, t, p)
    switch (name) {
      case 'magnet':
        this.burst(t, { dur: 0.025, freq: 3600, q: 3, gain: 0.3, pan: p, wet: 0.15 })
        this.tone(t, { freq: 1650, dur: 0.09, gain: 0.05, pan: p, wet: 0.2 })
        this.tone(t, { freq: 130, to: 90, dur: 0.07, gain: 0.22, pan: p, wet: 0.1 })
        break
      case 'lift':
        this.burst(t, { dur: 0.06, freq: 1400, q: 1, gain: 0.05, pan: p, wet: 0.1 })
        break
      case 'relay':
        for (let i = 0; i < 3; i++) this.burst(t + i * rand(0.06, 0.2), { dur: 0.012, type: 'highpass', freq: 3000, gain: 0.1, pan: p, wet: 0.3 })
        break
      case 'door':
        this.burst(t, { dur: 0.35, type: 'lowpass', freq: 420, q: 0.8, gain: 0.4, pan: p, wet: 0.7 })
        this.tone(t, { freq: 62, to: 38, dur: 0.4, gain: 0.38, pan: p, wet: 0.6 })
        for (let i = 0; i < 4; i++) this.burst(t + 0.05 + i * rand(0.03, 0.07), { dur: 0.02, freq: 1800, q: 2, gain: 0.05, pan: p, wet: 0.5 })
        break
      case 'chime':
        this.tone(t, { freq: 523, dur: 2.8, gain: 0.045, pan: p, wet: 0.7, attack: 0.01 })
        this.tone(t, { freq: 1318, dur: 1.6, gain: 0.018, pan: p, wet: 0.7, attack: 0.01 })
        this.tone(t + 0.02, { freq: 784.6, dur: 2.2, gain: 0.022, pan: p, wet: 0.7, attack: 0.01 })
        break
      case 'glitch': {
        let at = t
        for (let i = 0; i < 10; i++) {
          this.tone(at, { freq: rand(180, 2400), dur: rand(0.02, 0.07), type: 'square', gain: 0.03, pan: rand(-0.8, 0.8), wet: 0.2, attack: 0.001 })
          at += rand(0.03, 0.12)
        }
        this.layers.hum.gain.setTargetAtTime(0, t, 0.02)
        break
      }
      case 'thud':
        this.tone(t, { freq: 70, to: 44, dur: 0.5, gain: 0.35, pan: p, wet: 0.5 })
        this.burst(t, { dur: 0.2, type: 'lowpass', freq: 200, gain: 0.25, pan: p, wet: 0.5 })
        break
      case 'pipes':
        for (let i = 0; i < 5; i++) {
          const at = t + i * rand(0.15, 0.5)
          this.tone(at, { freq: rand(130, 170), dur: 0.35, type: 'triangle', gain: 0.07, pan: p, wet: 0.6 })
          this.tone(at, { freq: rand(290, 330), dur: 0.2, gain: 0.025, pan: p, wet: 0.6 })
        }
        break
      case 'wake':
        this.tone(t, { freq: 38, to: 110, dur: 3.2, type: 'sawtooth', gain: 0.025, wet: 0.5, attack: 1.5 })
        this.play('relay', { delay: delay + 0.6, force: true })
        break
      case 'shutdown':
        this.tone(t, { freq: 110, to: 32, dur: 5, type: 'sawtooth', gain: 0.025, wet: 0.6, attack: 0.3 })
        for (let i = 0; i < 4; i++) this.burst(t + 0.8 + i * (0.6 + i * 0.4), { dur: 0.014, type: 'highpass', freq: 2600, gain: 0.08, wet: 0.5 })
        break
      case 'stepsAway': {
        this.steps(t, { count: 8, interval: 0.55, gain: 0.26, fade: 0.9, pan: p, panTo: p + (p >= 0 ? 0.5 : -0.5), wetTo: 0.95, bus: 'events' })
        break
      }
      case 'breathe': {
        const src = this.ctx.createBufferSource()
        src.buffer = this.noise
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.08, t + 1.5)
        g.gain.linearRampToValueAtTime(0, t + 3.5)
        src.connect(this.filter('bandpass', 420, 1)).connect(g).connect(this.out(0, 0.6))
        src.start(t)
        src.stop(t + 3.6)
        break
      }
      case 'bells':
        for (let i = 0; i < 3; i++) this.bell(t + i * 2.2, { f: 220, gain: 0.035, pan: 0.5 })
        break
      case 'laugh':
        this.laugh(t, { base: 240, gain: 0.07, pan: p, bus: 'events' })
        break
      case 'sigh':
        this.sigh(t, { gain: 0.06, pan: p, bus: 'events' })
        break
      case 'coin': {
        // A soft reward: two or three small bells, never loud.
        const big = size === 'big'
        const notes = big ? [1568, 1976, 2349, 3136] : [1976, 2637]
        notes.forEach((f, i) => this.tone(t + i * 0.07, { freq: f, dur: 0.9, gain: 0.03, pan: p, wet: 0.5, attack: 0.003 }))
        this.burst(t, { dur: 0.6, type: 'highpass', freq: 7000, gain: 0.012, pan: p, wet: 0.6, attack: 0.05 })
        break
      }
      case 'upgrade':
        ;[293.7, 370, 440, 587.3].forEach((f, i) => this.tone(t + i * 0.09, { freq: f, dur: 1.6, type: 'triangle', gain: 0.035, wet: 0.6, attack: 0.01 }))
        break
      default:
        break
    }
  }

  // Vastu Purusha cues. Pitch follows the body region (head high, feet low); the timbre
  // follows the status: a soft rising pair (aligned), a single wavering tone (needs review),
  // a brief low beating tone (conflicting).
  vastuCue({ tone, pitch, part, pan = 0 }) {
    if (!this.ctx || this.stopped || this.ctx.state !== 'running') return
    if (this.samples[`vastu-${tone}`]) return this.playSample(`vastu-${tone}`, this.ctx.currentTime + 0.02, pan)
    const t = this.ctx.currentTime + 0.02
    if (tone === 'confirm') {
      this.tone(t, { freq: pitch, dur: 0.9, gain: 0.045, pan, wet: 0.5, attack: 0.01 })
      this.tone(t + 0.13, { freq: pitch * 1.5, dur: 1.2, gain: 0.035, pan, wet: 0.55, attack: 0.01 })
      if (part === 'torso') this.tone(t + 0.26, { freq: pitch * 2, dur: 1.2, gain: 0.02, pan, wet: 0.6 })
    } else if (tone === 'review') {
      this.tone(t, { freq: pitch, dur: 0.7, type: 'triangle', gain: 0.035, pan, wet: 0.45, attack: 0.04, vibrato: pitch * 0.012 })
    } else {
      const low = pitch / 4
      this.tone(t, { freq: low, to: low * 0.85, dur: 0.45, type: 'sawtooth', gain: 0.045, pan, wet: 0.3, attack: 0.01 })
      this.tone(t, { freq: low * 1.06, to: low * 0.9, dur: 0.45, gain: 0.11, pan, wet: 0.3, attack: 0.01 })
      if (part === 'head') this.burst(t + 0.02, { dur: 0.18, freq: 2600, q: 3, gain: 0.04, pan, wet: 0.2 })
    }
  }

  // A quiet impression of the sound a visitor would have made (simulated input, own footsteps).
  playInput(kind) {
    if (!this.ctx || this.stopped || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime + 0.02
    switch (kind) {
      case 'tap':
        for (let i = 0; i < 2; i++) this.burst(t + i * 0.18, { dur: 0.04, freq: 900, q: 2, gain: 0.22, wet: 0.2 })
        break
      case 'clap':
        this.burst(t, { dur: 0.08, freq: 1700, q: 0.8, gain: 0.35, wet: 0.5 })
        break
      case 'hum':
        this.tone(t, { freq: 131, dur: 1.4, type: 'triangle', gain: 0.05, wet: 0.3, attack: 0.2, vibrato: 1.5 })
        break
      case 'whisper':
        this.burst(t, { dur: 1.1, freq: 3200, q: 0.9, gain: 0.04, wet: 0.3, attack: 0.3 })
        break
      case 'voice':
        this.phrase(t, { base: 170, count: 4, gain: 0.07, muffle: 2600, bus: 'events' })
        break
      case 'rhythm':
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.45, { dur: 0.04, freq: 800, q: 2, gain: 0.22, wet: 0.2 })
        break
      case 'step':
        this.footstep(t, 0.12, rand(-0.1, 0.1), 0.25, 'events')
        break
      default:
        break
    }
  }

  // ---------- scheduled ambience ----------

  schedule() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || this.stopped) return
    const lv = this.levels
    const now = ctx.currentTime
    const t = now + 0.05
    const ready = (name) => {
      const level = clamp01(lv[name])
      if (level < 0.02 || this.sampleLoops[name] || now < (this.busy[name] ?? 0)) return false
      return Math.random() < level * SCHEDULED[name][0] * 0.1
    }
    const done = (name, dur) => {
      this.busy[name] = now + dur + SCHEDULED[name][1]
    }

    if ((lv.hum ?? 0) > 0 && this.layers.hum.gain.value < 0.001 && !this.sampleLoops.hum) {
      this.layers.hum.gain.setTargetAtTime(clamp01(lv.hum) * CONTINUOUS_MAX.hum, t, 0.3) // recover from a glitch dropout
    }

    // household
    if (ready('footsteps')) {
      const pan = rand(-0.8, 0.8)
      const hurried = clamp01(lv.argument) > 0.3
      done('footsteps', this.steps(t, { count: Math.floor(rand(3, 7)), interval: hurried ? rand(0.32, 0.4) : rand(0.48, 0.6), gain: hurried ? 0.2 : 0.14, pan, panTo: pan + rand(-0.4, 0.4), fade: 0.3 }))
    }
    if (ready('clinks')) {
      const f = rand(2100, 3300)
      const pan = rand(-0.7, 0.7)
      this.tone(t, { freq: f, dur: 0.35, gain: 0.016, pan, wet: 0.5, bus: 'ambience' })
      this.tone(t, { freq: f * 2.71, dur: 0.18, gain: 0.005, pan, wet: 0.5, bus: 'ambience' })
      done('clinks', 0.3)
    }
    if (ready('voices')) done('voices', this.phrase(t, { base: rand(105, 210), count: Math.floor(rand(3, 8)), gain: 0.05, pan: rand(-0.7, 0.7), muffle: 1100 }))
    if (ready('laughter')) done('laughter', this.laugh(t, { base: rand(200, 280), gain: 0.045, pan: rand(-0.6, 0.6) }))
    if (ready('children')) {
      const pan = rand(-0.8, 0.8)
      let d = this.phrase(t, { base: rand(300, 380), count: Math.floor(rand(2, 5)), gain: 0.03, pan, pace: 1.5, rise: 0.35, muffle: 2400, wet: 0.7 })
      if (Math.random() < 0.4) d += this.laugh(t + d + 0.1, { base: rand(330, 400), gain: 0.03, pan, wet: 0.7 })
      done('children', d)
    }
    if (ready('birds')) done('birds', this.bird(t, rand(-0.9, 0.9)))

    // conflict
    if (ready('argument')) {
      const pan = rand(-0.5, 0.5)
      const a = this.phrase(t, { base: rand(150, 190), count: Math.floor(rand(5, 10)), gain: 0.1, pan: pan - 0.25, pace: 1.6, rise: 0.25, muffle: 1600 })
      const b = this.phrase(t + a - rand(0.1, 0.4), { base: rand(210, 260), count: Math.floor(rand(4, 9)), gain: 0.11, pan: pan + 0.25, pace: 1.8, rise: 0.3, muffle: 1700 })
      if (clamp01(lv.argument) > 0.55 && Math.random() < 0.25) this.play('door', { pan, delay: a + b + 1.2 })
      done('argument', a + b)
    }
    if (ready('sigh')) done('sigh', this.sigh(t, { pan: rand(-0.5, 0.5) }))

    // loss
    if (ready('crying')) done('crying', this.sob(t, { pan: rand(-0.6, 0.6) }))
    if (ready('fadingVoice')) done('fadingVoice', this.phrase(t, { base: rand(140, 190), count: 7, gain: 0.05, pan: rand(-0.7, 0.7), muffle: 1200, wet: 0.85, fade: 0.9 }))
    // the clock: steady, until confusion bends its rhythm
    const clockLv = clamp01(lv.clock)
    if (clockLv > 0.05) {
      if (this.clock.next < now) this.clock.next = now + 0.1
      while (this.clock.next < now + 0.2) {
        this.tick(this.clock.next, this.clock.tock, 0.035 * clockLv)
        this.clock.tock = !this.clock.tock
        this.clock.next += 1 + (clamp01(lv.instability) > 0.4 ? rand(-0.35, 0.35) * clamp01(lv.instability) : 0)
      }
    }

    // abandoned building
    if (ready('drip')) done('drip', this.drip(t, rand(-0.8, 0.8)))
    if (ready('creak')) done('creak', this.creak(t, { pan: rand(-0.8, 0.8) }))
    if (ready('doorsMoving')) {
      const pan = rand(-0.8, 0.8)
      const d = this.creak(t, { dur: rand(1.8, 2.6), gain: 0.035, pan })
      this.burst(t + d, { dur: 0.03, freq: 1200, q: 2, gain: 0.06, pan, wet: 0.6, bus: 'ambience' })
      done('doorsMoving', d)
    }
    if (ready('pipes')) {
      const pan = rand(-0.7, 0.7)
      for (let i = 0; i < 4; i++) this.tone(t + i * rand(0.15, 0.45), { freq: rand(130, 170), dur: 0.3, type: 'triangle', gain: 0.05, pan, wet: 0.6, bus: 'ambience' })
      done('pipes', 1.6)
    }
    if (ready('clicks')) {
      this.burst(t, { dur: 0.012, type: 'highpass', freq: rand(2000, 4500), gain: 0.06, pan: rand(-0.9, 0.9), wet: 0.4, bus: 'ambience' })
      done('clicks', 0.05)
    }
    if (ready('bells')) {
      this.bell(t, { gain: 0.025 })
      this.bell(t + 2.4, { gain: 0.022 })
      done('bells', 5)
    }

    // confusion: two machines in rhythms that never agree
    const mechLv = clamp01(lv.mechanics)
    if (mechLv > 0.05) {
      if (this.mech.a < now) this.mech.a = now + 0.1
      if (this.mech.b < now) this.mech.b = now + 0.15
      while (this.mech.a < now + 0.2) {
        this.burst(this.mech.a, { dur: 0.02, freq: 700, q: 4, gain: 0.05 * mechLv, pan: -0.5, wet: 0.3, bus: 'ambience' })
        this.mech.a += 0.6
      }
      while (this.mech.b < now + 0.2) {
        this.burst(this.mech.b, { dur: 0.015, type: 'highpass', freq: 3200, gain: 0.045 * mechLv, pan: 0.5, wet: 0.3, bus: 'ambience' })
        this.mech.b += 0.43
      }
    }
    // brief interruptions of the whole ambience
    const interrupt = clamp01(lv.interrupt)
    if (interrupt > 0.05 && Math.random() < interrupt * 0.04) {
      const d = rand(0.12, 0.4)
      this.gate.gain.setTargetAtTime(0.05, t, 0.01)
      this.gate.gain.setTargetAtTime(1, t + d, 0.03)
    }
    // stutter the distortion layer
    const dist = clamp01(lv.distortion)
    this.distGate.gain.setValueAtTime(dist > 0.02 && Math.random() < 0.35 + dist * 0.4 ? rand(0.4, 1) : 0, t)
  }

  // ---------- optional recordings ----------

  async loadSamples() {
    let manifest
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/manifest.json`)
      if (!res.ok) return
      manifest = await res.json()
    } catch {
      return
    }
    const load = async (file) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${file}`)
        if (!res.ok || !(res.headers.get('content-type') || '').startsWith('audio')) return null
        return await this.ctx.decodeAudioData(await res.arrayBuffer())
      } catch {
        return null
      }
    }
    for (const [name, file] of Object.entries(manifest.oneshots ?? {})) {
      const buf = await load(file)
      if (buf) this.samples[name] = buf
    }
    for (const [name, file] of Object.entries(manifest.loops ?? {})) {
      const buf = await load(file)
      if (!buf) continue
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      src.connect(gain).connect(this.out(0, 0.4, 'ambience'))
      src.start()
      this.sampleLoops[name] = { src, gain }
    }
    this.setLayers(this.levels)
  }

  playSample(name, t, pan) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.samples[name]
    const g = this.ctx.createGain()
    g.gain.value = 0.7
    src.connect(g).connect(this.out(pan, 0.4))
    src.start(t)
  }
}
