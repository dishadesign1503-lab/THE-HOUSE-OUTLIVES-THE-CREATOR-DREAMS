// SOUND (audio manager). Everything is synthesised with the Web Audio API, no files to load.
//
//   wind       filtered noise: the draught where the circle is, over a faint outside wind
//   room       a very low, quiet drone: the house itself, rising as it gets restless
//   knock      a dry thump at each collision, pitched by how hard it was
//   heartbeat  two soft low beats while the house is restless
//   wake       a rising growl as the house begins to reorganise
//   detach, clack, land: walls lifting, striking each other in the air, coming down
//   niche, crack, door, ending
//   snoring    a recording: he snores while he sleeps (see setSleep)
//   his voice  two recorded demon lines (public/audio/demon): "I don't forgive" and "Die"
//   waking     largepredatorsnarl.mp3 (public/audio/wake): one rising snarl, once each time he wakes
//   reaction   unreal-tumbling-buckets.mp3 (public/audio/wake): a short excerpt of the clatter when
//              a hard knock disturbs him (never more often than every 2.5 s)
//   shadow     beneath his spoken words: a low growl and a breath on each word, in a long reverb,
//              panned to where his head lies — his voice seems to rise from under the house
//   dream      a slow, dark drone while he dreams
//   hush       a quiet whispering hiss under the opening warning, after Start
// Every file's state is kept in assets (loaded, or why not), shown in the inspector.
// Audio starts only after a tap (autoplay rules) and can be muted at any time.

const SNORE_VOLUME = 0.32 // restrained: under the wind and the knocks

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.volume = 0.7
  }

  get ready() {
    return !!this.ctx
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.volume
    this.master.connect(ctx.destination)
    // a shared buffer of white noise
    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    // breath: looping noise → bandpass → gain driven every frame
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    this.breathFilter = ctx.createBiquadFilter()
    this.breathFilter.type = 'bandpass'
    this.breathFilter.frequency.value = 520
    this.breathFilter.Q.value = 0.8
    this.breathGain = ctx.createGain()
    this.breathGain.gain.value = 0
    src.connect(this.breathFilter).connect(this.breathGain).connect(this.master)
    src.start()
    // room drone
    this.room = ctx.createGain()
    this.room.gain.value = 0.035
    for (const f of [41.2, 61.7, 82.6]) {
      const o = ctx.createOscillator()
      o.frequency.value = f
      o.detune.value = Math.random() * 8 - 4
      o.connect(this.room)
      o.start()
    }
    this.room.connect(this.master)
    // his snoring: a recording, looped with crossfades, its level set by his sleep
    this.snoreGain = ctx.createGain()
    this.snoreGain.gain.value = 0
    this.snoreGain.connect(this.master)
    this.loadSnore()
    this.loadVoices()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  // ---------- his snoring (public/audio/funny-snoring-sound-effect.mp3) ----------

  async loadSnore() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/funny-snoring-sound-effect.mp3`)
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer())
      // trim the silence an mp3 carries at its ends, so the loop has no gap
      const d = buf.getChannelData(0)
      let a = 0
      let b = d.length - 1
      while (a < b && Math.abs(d[a]) < 0.004) a++
      while (b > a && Math.abs(d[b]) < 0.004) b--
      this.snore = { buf, start: a / buf.sampleRate, dur: (b - a) / buf.sampleRate }
      this.assets ??= {}
      this.assets['snoring'] = { path: 'audio/funny-snoring-sound-effect.mp3', ok: true, seconds: +buf.duration.toFixed(2) }
      this.snoreNext = this.ctx.currentTime + 0.1
      this.setSleep(this.sleepState ?? 'SLEEPING')
    } catch (e) {
      this.snore = null // no file: no snoring, everything else still sounds
      this.assets ??= {}
      this.assets['snoring'] = { path: 'audio/funny-snoring-sound-effect.mp3', ok: false, error: String(e?.message ?? e) }
      console.warn(`[audio] snoring: could not load audio/funny-snoring-sound-effect.mp3 (${e?.message ?? e}); the game goes on without it`)
    }
  }

  // ---------- his voice (public/audio/demon) ----------

  // Load one supplied recording; its state (or the reason it failed) is kept in this.assets.
  async loadSample(name, path) {
    this.assets ??= {}
    this.samples ??= {}
    const url = `${import.meta.env.BASE_URL}${path}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.samples[name] = await this.ctx.decodeAudioData(await res.arrayBuffer())
      this.assets[name] = { path, ok: true, seconds: +this.samples[name].duration.toFixed(2) }
    } catch (e) {
      this.assets[name] = { path, ok: false, error: String(e?.message ?? e) }
      console.warn(`[audio] ${name}: could not load ${url} (${e?.message ?? e}); the game goes on without it`)
    }
    return this.samples[name] ?? null
  }

  async loadVoices() {
    this.voices = {}
    this.voices.forgive = await this.loadSample('voice: I don’t forgive', 'audio/demon/phatphrogstudio-demon-voice-i-donx27t-forgive-520949.mp3')
    this.voices.die = await this.loadSample('voice: die', 'audio/demon/phatphrogstudio-demon-voice-die-488316.mp3')
    await this.loadSample('wake: snarl', 'audio/wake/largepredatorsnarl.mp3')
    await this.loadSample('knock: tumbling buckets', 'audio/wake/unreal-tumbling-buckets.mp3')
  }

  // He wakes: the snarl, once (the synthesised growl only if the file is missing).
  wakeUp() {
    const buf = this.samples?.['wake: snarl']
    if (!buf) return this.wake()
    if ((this.ctx?.currentTime ?? 0) - (this.lastWakeAt ?? -9) < 3) return false
    this.lastWakeAt = this.ctx.currentTime
    return this.playSample(buf, { gain: 0.75 })
  }

  // A hard knock disturbs him: a short piece of the clatter, from a different moment each time,
  // faded out; never more often than every 2.5 seconds, so a wall pressed into does not repeat it.
  reaction(level = 1) {
    const buf = this.samples?.['knock: tumbling buckets']
    if (!buf || !this.ctx) return false
    if (this.ctx.currentTime - (this.lastReactionAt ?? -9) < 2.5) return false
    this.lastReactionAt = this.ctx.currentTime
    const dur = 1.4
    const offset = Math.random() * Math.max(0, buf.duration - dur - 0.1)
    return this.playSample(buf, { gain: 0.35 + 0.35 * Math.min(1, level), offset, dur, fade: 0.5 })
  }

  playSample(buf, { gain = 0.8, offset = 0, dur = null, fade = 0, pan = 0, wet = 0 } = {}) {
    if (!this.ctx || !buf) return false
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    const length = dur ?? buf.duration - offset
    if (fade) {
      g.gain.setValueAtTime(gain, t + Math.max(0, length - fade))
      g.gain.linearRampToValueAtTime(0.0001, t + length)
    }
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pn) pn.pan.value = pan
    src.connect(g)
    const out = pn ? (g.connect(pn), pn) : g
    out.connect(this.master)
    if (wet) {
      const w = ctx.createGain()
      w.gain.value = wet
      out.connect(w).connect(this.reverbIn())
    }
    src.start(t, offset, length + 0.05)
    return true
  }

  // ---------- the space beneath the house: one long reverb ----------

  reverbIn() {
    if (this.reverb) return this.reverb
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * 3.2)
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6
    }
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = ir
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2400
    this.reverb.connect(tone).connect(this.master)
    return this.reverb
  }

  // ---------- his shadow voice, beneath the spoken words ----------

  // The utterance begins: a low bed under the whole sentence, panned to his head (-1..1).
  shadowBegin(pan = 0) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // never snoring over his own words
    this.snoreGain?.gain.cancelScheduledValues(t)
    this.snoreGain?.gain.setTargetAtTime(0, t, 0.08)
    this.shadowEnd()
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.3)
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pn) pn.pan.value = pan
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 260
    const oscs = [43.65, 65.4].map((f) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(lp)
      o.start(t)
      return o
    })
    lp.connect(g)
    const out = pn ? (g.connect(pn), pn) : g
    out.connect(this.master)
    const w = ctx.createGain()
    w.gain.value = 0.9
    out.connect(w).connect(this.reverbIn())
    this.shadow = { g, oscs, pan }
  }

  // One spoken word: a growl swelling under it and a breath, into the reverb.
  shadowWord(seconds = 0.45) {
    if (!this.ctx) return
    const pan = this.shadow?.pan ?? 0
    const t = this.ctx.currentTime
    if (this.shadow) {
      this.shadow.g.gain.cancelScheduledValues(t)
      this.shadow.g.gain.setTargetAtTime(0.16, t, 0.04)
      this.shadow.g.gain.setTargetAtTime(0.08, t + seconds * 0.7, 0.12)
    }
    const ctx = this.ctx
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 420
    f.Q.value = 1.4
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pn) pn.pan.value = pan
    s.connect(f).connect(g)
    const out = pn ? (g.connect(pn), pn) : g
    out.connect(this.reverbIn())
    out.connect(this.master)
    s.start(t, Math.random())
    s.stop(t + seconds + 0.05)
  }

  shadowEnd() {
    const sh = this.shadow
    if (!sh || !this.ctx) return
    const t = this.ctx.currentTime
    sh.g.gain.cancelScheduledValues(t)
    sh.g.gain.setTargetAtTime(0.0001, t, 0.4)
    for (const o of sh.oscs) o.stop(t + 2)
    this.shadow = null
  }

  // ---------- his dream: a slow, dark drone ----------

  dreamStart() {
    if (!this.ctx || this.dreamPad) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.07, t + 2.5)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500
    lp.Q.value = 4
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const depth = ctx.createGain()
    depth.gain.value = 320
    lfo.connect(depth).connect(lp.frequency)
    lfo.start(t)
    const oscs = [55, 82.4, 110.6, 164.4].map((f, i) => {
      const o = ctx.createOscillator()
      o.type = i % 2 ? 'triangle' : 'sawtooth'
      o.frequency.value = f
      o.detune.value = (i - 1.5) * 7
      o.connect(lp)
      o.start(t)
      return o
    })
    lp.connect(g)
    g.connect(this.master)
    const w = ctx.createGain()
    w.gain.value = 0.8
    g.connect(w).connect(this.reverbIn())
    this.dreamPad = { g, oscs: [...oscs, lfo] }
  }

  dreamStop() {
    const d = this.dreamPad
    if (!d || !this.ctx) return
    const t = this.ctx.currentTime
    d.g.gain.cancelScheduledValues(t)
    d.g.gain.setTargetAtTime(0.0001, t, 1.2)
    for (const o of d.oscs) o.stop(t + 5)
    this.dreamPad = null
  }

  // ---------- the opening warning: a quiet "shhhh", air through a crack ----------

  hushStart() {
    if (!this.ctx || this.hush) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    s.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1600
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 3200
    bp.Q.value = 0.7
    // the hiss drifts in pitch and swells and ebbs, like a breath far off
    const drift = ctx.createOscillator()
    drift.frequency.value = 0.11
    const driftDepth = ctx.createGain()
    driftDepth.gain.value = 900
    drift.connect(driftDepth).connect(bp.frequency)
    const swell = ctx.createGain()
    swell.gain.value = 0.6
    const ebb = ctx.createOscillator()
    ebb.frequency.value = 0.23
    const ebbDepth = ctx.createGain()
    ebbDepth.gain.value = 0.4
    ebb.connect(ebbDepth).connect(swell.gain)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 1.8)
    s.connect(hp).connect(bp).connect(swell).connect(g)
    g.connect(this.master)
    const w = ctx.createGain()
    w.gain.value = 0.6
    g.connect(w).connect(this.reverbIn())
    s.start(t, Math.random())
    drift.start(t)
    ebb.start(t)
    this.hush = { g, srcs: [s, drift, ebb] }
  }

  hushStop(fade = 1.2) {
    const h = this.hush
    if (!h || !this.ctx) return
    const t = this.ctx.currentTime
    h.g.gain.cancelScheduledValues(t)
    h.g.gain.setTargetAtTime(0.0001, t, fade / 3)
    for (const o of h.srcs) o.stop(t + fade * 2)
    this.hush = null
  }

  // One of his lines, once (a line already sounding is cut off rather than overlapped).
  voice(name, gain = 0.85) {
    const buf = this.voices?.[name]
    if (!buf || !this.ctx) return false
    if (this.ctx.currentTime - (this.lastVoiceAt ?? -9) < 1.5 && this.lastVoice === name) return false
    this.lastVoiceAt = this.ctx.currentTime
    try {
      this.voiceSrc?.stop()
    } catch {
      // already ended
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.master)
    // a little of it into the space beneath the house
    const w = this.ctx.createGain()
    w.gain.value = 0.35
    g.connect(w).connect(this.reverbIn())
    src.start()
    this.voiceSrc = src
    this.lastVoice = name
    return true
  }

  // Keep the loop going: each pass starts a little before the last ends, crossfaded.
  tickSnore() {
    const sn = this.snore
    if (!sn || !this.ctx) return
    const ctx = this.ctx
    const fade = Math.min(0.6, sn.dur * 0.15)
    while (this.snoreNext < ctx.currentTime + 0.25) {
      const t = Math.max(this.snoreNext, ctx.currentTime)
      const src = ctx.createBufferSource()
      src.buffer = sn.buf
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(1, t + fade)
      g.gain.setValueAtTime(1, t + sn.dur - fade)
      g.gain.linearRampToValueAtTime(0.0001, t + sn.dur)
      src.connect(g).connect(this.snoreGain)
      src.start(t, sn.start, sn.dur)
      this.snoreNext = t + sn.dur - fade
    }
  }

  // His sleep state → how loud the snoring is. Asleep: restrained; stirring: low; waking or moving:
  // gone (faded, never cut); settling: coming back softly; asleep again: back to full.
  setSleep(state) {
    this.sleepState = state
    if (!this.ctx || !this.snoreGain) return
    // (dreaming: only a trace under the dream's own drone; never over his spoken words, which come
    // while he is TRANSFORMING)
    const level = { SLEEPING: 1, DISTURBED: 0.3, WAKING: 0, TRANSFORMING: 0, SETTLING: 0.12, DREAMING: 0.08 }[state] ?? 0
    const fadeTime = state === 'SLEEPING' ? 1.6 : state === 'WAKING' ? 0.25 : 0.6
    this.snoreGain.gain.setTargetAtTime(level * SNORE_VOLUME, this.ctx.currentTime, fadeTime / 3)
  }

  setMuted(m) {
    this.muted = m
    this.applyLevel()
  }

  // While the player speaks an instruction the house goes quiet, so the microphone hears the voice.
  setRecording(on) {
    this.recording = on
    this.applyLevel()
  }

  applyLevel() {
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.recording ? this.volume * 0.15 : this.volume, this.ctx.currentTime, 0.05)
  }

  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {})
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {})
  }

  close() {
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {})
    this.ctx = null
  }

  // Called every frame: breath -1..1 and how disturbed he is (0..1).
  // Called every frame: the house's restlessness, the draught at the circle, the outside wind.
  setAtmosphere({ arousal = 0, air = 0, wind = 0, moving = 0 }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23)
    this.breathGain.gain.setTargetAtTime(0.008 + wind * 0.012 * gust + Math.min(1, air) * 0.07, t, 0.15)
    this.breathFilter.frequency.setTargetAtTime(300 + Math.min(1, air) * 900 + gust * 120, t, 0.2)
    this.room.gain.setTargetAtTime(0.03 + arousal * 0.05 + Math.min(1, moving / 10) * 0.05, t, 0.3)
    this.tickSnore()
  }

  detach() {
    const now = this.ctx?.currentTime ?? 0
    if (now - (this.lastDetach ?? 0) < 0.08) return
    this.lastDetach = now
    this.burst(0.25, { freq: 160 + Math.random() * 80, q: 3, gain: 0.05, sweep: 1.4 })
  }

  clack(impulse = 1) {
    const k = Math.min(1, impulse / 3)
    this.tone(220 + Math.random() * 60, 0.12, { type: 'triangle', gain: 0.08 + k * 0.12, slide: 0.6 })
    this.burst(0.06, { freq: 2600, q: 0.6, gain: 0.05 + k * 0.08 })
  }

  land() {
    const now = this.ctx?.currentTime ?? 0
    if (now - (this.lastLand ?? 0) < 0.06) return
    this.lastLand = now
    this.tone(70 + Math.random() * 25, 0.25, { gain: 0.1, slide: 0.6 })
  }

  // ---------- one-shots ----------

  tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  burst(dur, { freq = 1200, q = 1, gain = 0.15, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f).connect(g).connect(this.master)
    s.start(t, Math.random())
    s.stop(t + dur + 0.05)
  }

  knock(speed, kind) {
    const k = Math.min(1, speed / 4)
    if (kind === 'body') {
      this.tone(90, 0.35, { gain: 0.25 + k * 0.2, slide: 0.6 })
      this.burst(0.25, { freq: 300, gain: 0.08, type: 'lowpass' })
      return
    }
    this.tone(kind === 'rule' ? 70 : 140 + k * 60, 0.12 + k * 0.1, { gain: 0.08 + k * 0.25, slide: 0.5 })
    this.burst(0.05 + k * 0.05, { freq: 2400 - k * 800, q: 0.7, gain: 0.04 + k * 0.1 })
  }

  heartbeat(level) {
    this.tone(55, 0.18, { gain: 0.12 + level * 0.12, slide: 0.7 })
    this.tone(50, 0.2, { gain: 0.09 + level * 0.1, slide: 0.7, delay: 0.17 })
  }

  search() {
    this.tone(220, 1.6, { type: 'triangle', gain: 0.035, attack: 0.4, slide: 0.94 })
    this.tone(233, 1.6, { type: 'triangle', gain: 0.03, attack: 0.4, slide: 0.94 })
  }

  wake() {
    this.tone(48, 2.2, { type: 'sawtooth', gain: 0.12, attack: 0.5, slide: 2.2 })
    this.burst(2.2, { freq: 180, q: 3, gain: 0.12, sweep: 3, type: 'bandpass' })
    this.tone(36, 2.5, { gain: 0.2, attack: 0.3 })
  }

  grumble() {
    this.burst(0.8, { freq: 140, q: 4, gain: 0.12, sweep: 1.6 })
    this.tone(70, 0.7, { type: 'sawtooth', gain: 0.05, slide: 0.8 })
  }

  shift(count = 6) {
    this.burst(1.6, { freq: 90, q: 2, gain: 0.14, sweep: 2.5, type: 'bandpass' })
    const n = Math.min(8, Math.max(2, count))
    for (let i = 0; i < n; i++) this.tone(60 + Math.random() * 30, 0.3, { gain: 0.12, slide: 0.6, delay: 0.7 + i * (1 / n) })
  }

  stretch() {
    this.burst(1.2, { freq: 260, q: 1.5, gain: 0.05, sweep: 0.6 })
  }

  niche(order) {
    this.tone([392, 440, 494, 523][order - 1] ?? 440, 1.8, { gain: 0.09, attack: 0.01 })
    this.tone(([392, 440, 494, 523][order - 1] ?? 440) * 2.01, 1.2, { gain: 0.03 })
  }

  crack() {
    this.burst(0.18, { freq: 3200, q: 0.5, gain: 0.3, type: 'highpass' })
    this.tone(45, 0.6, { gain: 0.3, slide: 0.5 })
  }

  door() {
    for (const [i, f] of [523.3, 659.3, 784].entries()) this.tone(f, 2.6, { gain: 0.06, attack: 0.04, delay: i * 0.12 })
  }

  restored() {
    for (const [i, f] of [261.6, 329.6, 392, 523.3].entries()) this.tone(f, 3.5, { gain: 0.05, attack: 0.3, delay: i * 0.25 })
  }

  interrupted() {
    this.burst(1.4, { freq: 120, q: 1, gain: 0.25, type: 'lowpass', sweep: 0.3 })
    this.tone(30, 3, { gain: 0.25, slide: 0.8 })
    if (this.room) this.room.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5)
  }

  test() {
    this.tone(440, 0.4, { gain: 0.1 })
  }
}
