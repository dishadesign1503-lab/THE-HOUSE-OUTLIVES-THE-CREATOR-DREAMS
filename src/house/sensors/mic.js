// THE OPTIONAL HEARING MECHANIC (microphone).
//
// Only loudness is measured: the RMS level of the signal, 20 times a second, on this device.
// Nothing is recorded, stored or sent, and nothing is recognised. The microphone is never
// connected to the speakers.
//
// A calibration listens to the room for two seconds to learn its ambient level; the floor then
// keeps adapting slowly, so a steady background (a fan, traffic) stops counting. A sound counts
// when it rises clearly above that floor; after one, there is a short cooldown.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

export class MicSensor {
  constructor({ onSound } = {}) {
    this.onSound = onSound
    // off | requesting | calibrating | on | denied | unsupported | insecure | error
    this.status = !navigator.mediaDevices?.getUserMedia ? (window.isSecureContext ? 'unsupported' : 'insecure') : 'off'
    this.sensitivity = 0.5
    this.level = 0
    this.smooth = 0
    this.floor = 0.01
    this.threshold = 0.03
    this.cooldownUntil = 0
    this.calib = null
  }

  async start() {
    if (this.status === 'unsupported' || this.status === 'insecure') return this.status
    this.status = 'requesting'
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } })
    } catch (e) {
      this.status = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'error'
      return this.status
    }
    const AC = window.AudioContext || window.webkitAudioContext
    this.ctx = new AC()
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {})
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.source.connect(this.analyser) // analysis only
    this.buf = new Float32Array(this.analyser.fftSize)
    this.timer = setInterval(() => this.tick(), 50)
    this.calibrate()
    return this.status
  }

  stop() {
    clearInterval(this.timer)
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {})
    this.stream = this.ctx = this.source = this.analyser = null
    this.level = this.smooth = 0
    if (['on', 'calibrating', 'requesting'].includes(this.status)) this.status = 'off'
  }

  // While the page is hidden or the game paused: stop analysing, keep the permission.
  pause() {
    if (!this.analyser) return
    clearInterval(this.timer)
    this.timer = null
    this.ctx?.suspend().catch(() => {})
  }

  resume() {
    if (!this.analyser || this.timer) return
    this.ctx?.resume().catch(() => {})
    this.timer = setInterval(() => this.tick(), 50)
  }

  // Listen to the room for two seconds and take that as quiet.
  calibrate() {
    if (!this.analyser) return
    this.status = 'calibrating'
    this.calib = { until: performance.now() + 2000, sum: 0, n: 0, max: 0 }
  }

  tick() {
    this.analyser.getFloatTimeDomainData(this.buf)
    let s = 0
    for (const v of this.buf) s += v * v
    const rms = Math.sqrt(s / this.buf.length)
    this.level = rms
    const rising = rms > this.smooth
    this.smooth += (rms - this.smooth) * (rising ? 0.6 : 0.15)
    const now = performance.now()
    if (this.calib) {
      const c = this.calib
      c.sum += rms
      c.n++
      c.max = Math.max(c.max, rms)
      if (now > c.until) {
        this.floor = Math.max(0.002, c.sum / c.n, c.max * 0.6)
        this.calib = null
        this.status = 'on'
      }
      return
    }
    // the floor follows quiet stretches quickly and loud ones very slowly
    if (this.smooth < this.floor) this.floor += (this.smooth - this.floor) * 0.05
    else this.floor += (this.smooth - this.floor) * 0.003
    this.floor = Math.max(0.002, this.floor)
    // higher sensitivity: a smaller rise above the room counts
    this.threshold = this.floor * (1.8 + (1 - this.sensitivity) * 4.5) + 0.004
    if (this.smooth > this.threshold && now > this.cooldownUntil) {
      this.cooldownUntil = now + 1400
      const sudden = rms > this.threshold * 2.2
      this.onSound?.({ intensity: clamp((this.smooth / this.threshold - 1) / 3), sudden })
    }
  }

  // 0..1, for the level meter
  meter() {
    return clamp(this.smooth / Math.max(this.threshold * 1.6, 0.01))
  }
}
