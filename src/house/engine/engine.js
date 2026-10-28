// THE GAME ENGINE — the frame loop and everything around the simulation.
//
// Each frame: read the sensors (or keys, or the touch fallback) → advance the game → turn its
// events into vibration, sound, ripples and interface messages → draw.
// It pauses itself when the page is hidden, and cleans up every listener when it is destroyed.

import { Game } from '../game/game.js'
import { Renderer } from '../render/renderer.js'
import { keyDirection } from '../sensors/tilt.js'

export class GameEngine {
  constructor({ canvas, services, settings, stage = 0, onUi }) {
    this.canvas = canvas
    this.s = services // { sensors, tilt, haptics, audio, mic }
    this.settings = settings
    this.onUi = onUi
    this.renderer = new Renderer(canvas)
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    this.renderer.reducedMotion = this.reducedMotion
    this.s.haptics.minimal = this.reducedMotion
    this.fx = { ripples: [], hapticAt: -9, movedAt: -9, stillness: 0, ghost: null, hidePlayer: false }
    this.time = 0
    this.paused = false
    this.log = [] // recent collisions, for the debug panel
    this.hudTimer = 0
    this.fps = 60
    this.newGame(stage)
    this.bind()
    // debug mode only: a handle for the browser console and automated tests
    if (settings.debug) window.__houseEngine = this
    this.last = performance.now()
    this.raf = requestAnimationFrame((t) => this.frame(t))
  }

  newGame(stage, carry = null) {
    this.game = new Game({ stage, persistMemory: this.settings.agentMemory !== false })
    if (carry) {
      this.game.trails = carry.trails
      this.game.stage0Route = carry.stage0Route
    }
    this.fx.ghost = null
    this.fx.hidePlayer = false
    this.endingTimer = null
  }

  nextStage() {
    const g = this.game
    g.startStage(g.stageIndex + 1)
  }

  restartStage() {
    const g = this.game
    const keep = { trails: g.trails, stage0Route: g.stage0Route }
    this.newGame(g.stageIndex, keep)
  }

  // ---------- input ----------

  bind() {
    const { sensors, haptics, mic } = this.s
    haptics.onPulse = () => (this.fx.hapticAt = this.time)
    sensors.onShake = (k) => {
      if (!this.paused) this.game.shake(k)
    }
    mic.onSound = ({ intensity, sudden }) => {
      if (this.paused || !this.settings.mic) return
      this.game.noise(Math.min(1, intensity * (sudden ? 1.3 : 1)))
    }
    this.onKeyDown = (e) => {
      const d = keyDirection(e.code)
      if (d) {
        this.s.tilt.keys.add(d)
        e.preventDefault()
      }
      if (e.code === 'Escape' || e.code === 'KeyP') this.onUi({ type: 'pauseRequest' })
      if (this.settings.debug) {
        if (e.code === 'KeyC') this.game.debugCollision()
        if (e.code === 'KeyE') this.game.debugEvaluate()
        if (e.code === 'KeyT') this.game.debugTransform()
        if (e.code === 'KeyX') this.game.debugReset()
        if (e.code === 'KeyN') this.game.noise(0.7)
        if (e.code === 'KeyD') this.game.debugDream() // developer only: a dream now
      }
    }
    this.onKeyUp = (e) => {
      const d = keyDirection(e.code)
      if (d) this.s.tilt.keys.delete(d)
    }
    this.onBlur = () => this.s.tilt.keys.clear()
    this.onVisibility = () => {
      if (document.hidden) {
        this.s.sensors.suspend()
        this.s.audio.suspend()
        this.s.mic.pause?.()
        this.onUi({ type: 'pauseRequest' })
      } else {
        this.s.sensors.resume()
        this.s.mic.resume?.()
      }
    }
    this.onOrientation = () => {
      // Turning the phone changes how it is held: recalibrate once it has settled.
      clearTimeout(this.reorientTimer)
      this.reorientTimer = setTimeout(() => {
        this.renderer.resize()
        if (this.s.sensors.gravity && this.s.tilt.calibrate(this.s.sensors.gravity)) this.onUi({ type: 'toast', text: 'Recalibrated for the new orientation.' })
      }, 600)
    }
    // touch fallback: drag on the board, the finger's offset acts as tilt
    this.onPointerDown = (e) => {
      // only when the motion sensors are not steering (no sensor, denied, or desktop)
      if (this.s.sensors.active) return
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
      this.canvas.setPointerCapture?.(e.pointerId)
      this.s.tilt.touch = { x: 0, y: 0 }
    }
    this.onPointerMove = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return
      const R = 70
      const dx = (e.clientX - this.drag.x) / R
      const dy = (e.clientY - this.drag.y) / R
      const m = Math.hypot(dx, dy)
      this.s.tilt.touch = m > 1 ? { x: dx / m, y: dy / m } : { x: dx, y: dy }
    }
    this.onPointerUp = (e) => {
      if (this.drag && e.pointerId === this.drag.id) {
        this.drag = null
        this.s.tilt.touch = null
      }
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('orientationchange', this.onOrientation)
    screen.orientation?.addEventListener?.('change', this.onOrientation)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.resizeObserver = new ResizeObserver(() => this.renderer.resize())
    this.resizeObserver.observe(this.canvas)
  }

  destroy() {
    if (window.__houseEngine === this) delete window.__houseEngine
    cancelAnimationFrame(this.raf)
    clearTimeout(this.reorientTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('orientationchange', this.onOrientation)
    screen.orientation?.removeEventListener?.('change', this.onOrientation)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.resizeObserver.disconnect()
    this.s.haptics.onPulse = null
    this.s.sensors.onShake = null
    this.s.mic.onSound = null
    this.s.tilt.keys.clear()
    this.s.tilt.touch = null
  }

  setPaused(p) {
    this.paused = p
    this.s.tilt.keys.clear()
    if (p) this.s.audio.suspend()
    else {
      this.s.audio.resume()
      this.last = performance.now()
    }
  }

  // ---------- the frame ----------

  frame(now) {
    this.raf = requestAnimationFrame((t) => this.frame(t))
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05
    if (!this.paused) this.step(dt)
    this.fx.inspect = !!this.inspecting
    this.renderer.draw(this.game, this.fx, this.time, this.paused ? 0 : dt)
  }

  step(dt) {
    this.time += dt
    const { sensors, tilt, audio } = this.s
    const g = this.game
    tilt.deadzone = this.settings.deadzone
    const t = tilt.read(sensors.active ? sensors.gravity : null, dt)
    this.input = { tilt: t, motion: sensors.active ? sensors.motion : 0, sensitivity: this.settings.sensitivity }
    g.update(dt, this.input)
    for (const e of g.drain()) this.handle(e)
    // a new stage or a restart begins with him asleep: keep sound and Zs in step with the game
    if (this.fx.sleep !== g.sleep.state) {
      this.fx.sleep = g.sleep.state
      audio.setSleep(g.sleep.state)
    }
    const air = g.env.airAt(g.player.x, g.player.y)
    audio.setAtmosphere({ arousal: g.agent.s.arousal, air: Math.hypot(air.x, air.y), wind: g.env.wind.strength, moving: g.house.transforming ? 1 : 0 })
    this.fx.ripples = this.fx.ripples.filter((r) => this.time - r.t < r.dur)
    if (this.fx.ghost) {
      this.fx.ghost.t += dt
      if (this.fx.ghost.t > this.fx.ghost.points.length * 0.12 + 2) this.fx.ghost.t = -1
    }
    if (this.endingTimer != null) {
      this.endingTimer -= dt
      if (this.endingTimer <= 0) {
        this.endingTimer = null
        if (g.ending === 'preserve') this.fx.ghost = { points: g.replayRoute(), t: 0 }
        this.onUi({ type: 'ending', kind: g.ending, trails: g.trails })
      }
    }
    this.hudTimer -= dt
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12
      this.onUi({ type: 'hud', data: this.hud() })
    }
  }

  hud() {
    const g = this.game
    const { sensors, tilt, haptics, mic } = this.s
    return {
      stage: g.stageIndex,
      source: tilt.source,
      sensorStatus: sensors.status,
      arousal: g.agent.s.arousal,
      holding: g.holding,
      mode: g.agent.mode,
      micStatus: mic.status,
      micLevel: mic.meter?.() ?? 0,
      hapticSupported: haptics.supported,
      hapticResult: haptics.lastResult,
      system: g.system,
      debug: this.settings.debug ? this.inspector() : null,
    }
  }

  // Everything the developer inspector shows.
  inspector() {
    const g = this.game
    const { sensors } = this.s
    const h = g.house
    const tr = h.transform
    const rooms = new Set(h.cfg.bay.flat().filter(Boolean))
    const d = g.body.regionDisturbance()
    return {
      ...g.snapshot(),
      agent: g.agent.inspect(),
      tilt: this.input?.tilt,
      motion: sensors.motion,
      raw: { ...sensors.raw },
      events: sensors.events,
      fps: this.fps,
      log: this.log.slice(-4),
      wind: { ...g.env.wind },
      sun: { ...g.env.sun, on: g.env.sunOn },
      env: g.env.summary(g.house),
      audio: { ready: this.s.audio.ready, assets: this.s.audio.assets ?? {}, voice: this.voiceLog ?? null, dreamPad: !!this.s.audio.dreamPad },
      body: { pose: g.body.pose, moving: g.body.moving, breath: +g.body.breathValue().toFixed(2), regions: Object.fromEntries(Object.entries(d).filter(([, v]) => v > 0.02).map(([k, v]) => [k, +v.toFixed(2)])) },
      windows: g.env.windows
        .map((w) => ({ at: `${w.x.toFixed(1)},${w.y.toFixed(1)}`, facing: w.outside ? `${w.outside.x.toFixed(1)},${w.outside.y.toFixed(1)}` : w.kind === 'inner' ? 'between rooms (moves)' : w.kind, inflow: +(w.inflow ?? 0).toFixed(2) })),
      walls: {
        pieces: h.walls.length,
        bound: h.bound.length,
        moving: g.snapshot().moving,
        config: `${h.configId} (${h.cfg.label})${tr && tr.B !== tr.A ? ` → ${tr.B.id}` : ''}`,
        rooms: [...rooms].map((r) => h.cfg.rooms[r].name).join(', '),
        lines: `X ${h.X.map((x) => x.toFixed(2)).join(' ')} · Y ${h.Y.map((y) => y.toFixed(2)).join(' ')}`,
        valid: h.validatePlan({ X: h.X, Y: h.Y, configId: h.configId }).ok,
        sample: h.walls.filter((w) => w.lifted).slice(0, 3).map((w) => `${w.id} lifted over the ball`),
        bindings: [],
      },
    }
  }

  // ---------- hypnotic instructions (called by the UI) ----------

  // the HYPNOTIZE popup is open (true) or closed (false)
  setListening(on) {
    this.game.listening = on
  }

  hypnoStart() {
    this.fx.hypno = { phase: 'recording', since: this.time, level: 0 }
    this.s.audio.setRecording(true)
  }

  hypnoLevel(level) {
    if (this.fx.hypno?.phase === 'recording') this.fx.hypno.level = level
  }

  hypnoCancel() {
    if (this.fx.hypno?.phase === 'recording') this.fx.hypno = { phase: 'fading', since: this.time }
    this.s.audio.setRecording(false)
  }

  // "You are a …": the game checks it and, if it passes, the hypnosis begins.
  hypnotize(text, meta = {}) {
    this.s.audio.setRecording(false)
    const r = this.game.hypnotize(text, meta)
    if (!r.ok && this.fx.hypno?.phase === 'recording') this.fx.hypno = { phase: 'fading', since: this.time }
    return r
  }

  // His voice: the browser's speech synthesis, preferring a voice on this device; slow and low.
  // His voice: the words from the browser's speech synthesis (deep and slow, a voice on this device
  // preferred, a low male one if there is one), so they stay intelligible; beneath them his shadow
  // voice in the game's own audio (audio.shadow*: a growl and a breath on every word, in a long
  // reverb), panned to where his head lies, so the voice seems to rise from under the house.
  speak(words) {
    if (!this.settings.sound || typeof window === 'undefined' || !window.speechSynthesis) return
    const audio = this.s.audio
    try {
      const synth = window.speechSynthesis
      const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang))
      const deep = /david|daniel|fred|ralph|bruce|alex|george|mark|male|james|guy/i
      const u = new SpeechSynthesisUtterance(words.toLowerCase())
      u.voice = voices.find((v) => v.localService && deep.test(v.name)) ?? voices.find((v) => v.localService) ?? voices[0] ?? null
      u.rate = 0.62
      u.pitch = 0.1
      u.volume = 0.95
      const head = this.game.body.frames.head
      const pan = Math.max(-1, Math.min(1, (head.b.x / 9) * 2 - 1))
      const count = words.split(/\s+/).length
      let worded = false
      u.onstart = () => {
        audio.shadowBegin(pan)
        // some browsers report no word boundaries: then the words are paced by estimate
        setTimeout(() => {
          if (!worded) for (let i = 0; i < count; i++) setTimeout(() => audio.shadowWord(0.5), i * 420)
        }, 120)
      }
      u.onboundary = (ev) => {
        if (ev.name && ev.name !== 'word') return
        worded = true
        audio.shadowWord(0.45)
      }
      u.onend = () => audio.shadowEnd()
      u.onerror = () => audio.shadowEnd()
      synth.cancel()
      synth.speak(u)
      this.voiceLog = { words, voice: u.voice?.name ?? 'default', local: !!u.voice?.localService, t: this.time }
    } catch {
      // no voice: the words are shown on screen
    }
  }

  // The words of an instruction (recognised on this device, or typed) go to the game.
  instruct(text, meta = {}) {
    this.s.audio.setRecording(false)
    const r = this.game.instruct(text, meta)
    if (!r && this.fx.hypno?.phase === 'recording') this.fx.hypno = { phase: 'fading', since: this.time }
    return r
  }

  ripple(x, y, strong, size = 0.6) {
    this.fx.ripples.push({ x, y, t: this.time, dur: strong ? 0.7 : 0.45, strong, size })
  }

  // Game events → the senses.
  handle(e) {
    const { haptics, audio } = this.s
    switch (e.type) {
      case 'collision':
        this.ripple(e.x, e.y, e.danger, e.danger ? 0.9 : 0.5)
        haptics.play(e.danger ? 'danger' : 'tap')
        audio.knock(e.speed, e.kind)
        // a knock that really disturbs him: the house clatters (a reaction, not his waking)
        if (e.danger) audio.reaction(e.amount * 4)
        this.log.push(`${this.time.toFixed(1)}s ${e.kind} v${e.speed.toFixed(2)} +${e.amount.toFixed(3)} ${e.region ?? ''}${e.airy ? ' (draught)' : ''}`)
        break
      case 'pulse':
        haptics.play(e.critical ? 'critical' : 'heartbeat')
        audio.heartbeat(e.level)
        break
      case 'transform':
        // his body moving and the house rumbling after it (the wake-up sound is its own event)
        if (e.major) {
          haptics.play('transform')
          audio.shift(Math.round((e.walls ?? 40) / 10))
        } else audio.stretch()
        break
      case 'hypno':
        // the spirals follow the game: interpreting → reacting (to his choice) → fading; broken
        this.fx.hypno = { ...(this.fx.hypno ?? {}), phase: e.phase, kind: e.kind ?? this.fx.hypno?.kind, since: this.time }
        break
      case 'instruction':
        audio.search() // a short, restrained sound: something turning over inside him
        if (e.forceful >= 0.6) audio.voice('die') // shouted at, he answers in his own voice
        this.log.push(`${this.time.toFixed(1)}s "${e.text}" → ${Object.keys(e.concepts).join(' + ')}`)
        break
      case 'irritated':
        audio.grumble()
        audio.voice('forgive') // disturbed a third time
        haptics.play('danger')
        this.fx.irritatedAt = this.time
        break
      case 'exitMoving':
        audio.shift(8)
        break
      case 'trance':
        // "I AM A …": one stage of the embodiment — the words on screen and in his voice
        // resisting (contrary), he says so in his own voice before he gives in
        if (e.k === 1 && (this.game.chain.hypnosis?.contrariness ?? 0) > 0.3) audio.voice('forgive', 0.6)
        this.onUi({ type: 'trance', words: e.words, k: e.k })
        this.speak(e.words)
        audio.stretch()
        this.log.push(`${this.time.toFixed(1)}s ${e.words} (${e.k}/3) · ${e.walls} walls`)
        break
      case 'dream':
        // he dreams: the warning, a low swell
        this.onUi({ type: 'dreamStart' })
        audio.dreamStart()
        haptics.play('transform')
        this.log.push(`${this.time.toFixed(1)}s he dreams · anchor in the ${e.anchor?.room ?? '?'}`)
        break
      case 'dreamCycle':
        audio.shift(Math.round((e.walls ?? 60) / 12))
        break
      case 'anchorReached':
        // (no settling sound: none of the supplied recordings is one; the dream's drone fades)
        haptics.play('escape')
        this.ripple(e.at.x, e.at.y, false, 1.4)
        break
      case 'dreamEnd':
        audio.dreamStop()
        break
      case 'sleep':
        // his sleep state: SLEEPING · DISTURBED · WAKING · TRANSFORMING · SETTLING
        this.fx.sleep = e.state
        audio.setSleep(e.state)
        break
      case 'wake': {
        // once per waking: the snarl, and a pulse on the part of him that was disturbed
        audio.wakeUp()
        const bones = Object.values(this.game.body.frames).filter((f) => f.region === e.region)
        const c = bones.length ? bones.reduce((m, f) => ({ x: m.x + (f.a.x + f.b.x) / 2 / bones.length, y: m.y + (f.a.y + f.b.y) / 2 / bones.length }), { x: 0, y: 0 }) : null
        this.fx.wakeAt = this.time
        this.fx.wakeAtPoint = c
        this.log.push(`${this.time.toFixed(1)}s he wakes${e.region ? ` (${e.region})` : ''}`)
        break
      }
      case 'detach':
        audio.detach()
        break
      case 'wallHit':
        this.ripple(e.x, e.y, true, 0.5)
        audio.clack(e.impulse)
        haptics.play('tap')
        break
      case 'landed':
        audio.land()
        break
      case 'twitch':
        audio.grumble()
        break
      case 'frozenMove':
        this.fx.movedAt = this.time
        break
      case 'noise':
        this.ripple(this.game.player.x, this.game.player.y, e.amount > 0.15, 1 + e.intensity)
        break
      case 'niche':
        audio.niche(e.order)
        haptics.play('tap')
        break
      case 'crack':
        audio.crack()
        haptics.play('crack')
        this.ripple(e.x, e.y, true, 1.4)
        break
      case 'stillness':
        this.fx.stillness = e.progress
        break
      case 'restored':
        audio.restored()
        haptics.play('shift')
        break
      case 'interrupted':
        audio.interrupted()
        audio.voice('die', 1) // the oldest wall gives way
        haptics.play('transform')
        break
      case 'stageComplete':
        audio.door()
        haptics.play('escape')
        this.onUi({ type: 'stageComplete', stage: e.stage, text: e.text })
        break
      case 'ending':
        audio.door()
        haptics.play('escape')
        this.fx.hidePlayer = true
        this.endingTimer = 2.4
        break
      case 'message':
        this.onUi({ type: 'message', key: e.key, text: e.text })
        break
      case 'stageStart':
        this.fx.stillness = 0
        this.onUi({ type: 'stageStart', stage: e.stage })
        break
      default:
        break
    }
  }
}
