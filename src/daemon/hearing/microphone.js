// SOUNDS THE DAEMON PERCEIVES — from a real microphone.
//
// Only acoustic features are measured, live, every 40 ms: loudness, duration, brightness
// (spectral centroid), noisiness (spectral flatness) and the timing between onsets.
// Nothing is recorded, stored or sent anywhere, and no words are recognised.
// The microphone is never connected to the speakers.
//
// It turns those features into rough perceptions:
//   tap     short, soft transient          clap    short, loud, bright transient
//   hum     sustained, low and tonal        whisper sustained, quiet, noisy and bright
//   voice   sustained, in between (a voice-*shaped* sound, not speech recognition)
//   rhythm  four or more onsets at a steady interval

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

export class Microphone {
  constructor({ onPerception, getOutputLevel }) {
    this.onPerception = onPerception
    this.getOutputLevel = getOutputLevel ?? (() => 0)
    this.sensitivity = 0.5
    this.level = 0
    this.threshold = 0.02
    this.floor = 0.005
    this.segment = null
    this.onsets = []
    this.lastEmit = 0
  }

  static supported() {
    return !!navigator.mediaDevices?.getUserMedia
  }

  // Uses its own audio context, so stopping the daemon's sound doesn't stop its hearing.
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    })
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    if (ctx.state === 'suspended') await ctx.resume()
    this.ctx = ctx
    this.source = ctx.createMediaStreamSource(this.stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.2
    this.source.connect(this.analyser) // analysis only; never to ctx.destination
    this.time = new Float32Array(this.analyser.fftSize)
    this.freq = new Float32Array(this.analyser.frequencyBinCount)
    this.timer = setInterval(() => this.analyse(), 40)
  }

  stop() {
    clearInterval(this.timer)
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close()
    this.ctx = null
    this.analyser = null
    this.level = 0
  }

  waveform() {
    return this.analyser ? this.time : null
  }

  analyse() {
    const a = this.analyser
    a.getFloatTimeDomainData(this.time)
    a.getFloatFrequencyData(this.freq)
    let sum = 0
    for (const v of this.time) sum += v * v
    const rms = Math.sqrt(sum / this.time.length)
    this.level = rms

    // Spectral features between ~100 Hz and ~8 kHz.
    const binHz = this.ctx.sampleRate / a.fftSize
    const lo = Math.floor(100 / binHz)
    const hi = Math.min(this.freq.length, Math.floor(8000 / binHz))
    let energy = 0
    let weighted = 0
    let logSum = 0
    for (let i = lo; i < hi; i++) {
      const p = 10 ** (this.freq[i] / 10) + 1e-12
      energy += p
      weighted += p * i * binHz
      logSum += Math.log(p)
    }
    const n = hi - lo
    const centroid = weighted / energy
    const flatness = Math.exp(logSum / n) / (energy / n)

    // A slowly adapting noise floor, so a noisy classroom doesn't count as "activity".
    if (rms < this.floor) this.floor = this.floor * 0.9 + rms * 0.1
    else this.floor = this.floor * 0.998 + rms * 0.002
    const sens = 2 + (1 - this.sensitivity) * 6
    this.threshold = Math.max(0.006 + (1 - this.sensitivity) * 0.02, this.floor * sens) + this.getOutputLevel() * 0.5

    const t = performance.now() / 1000
    const seg = this.segment
    if (rms > this.threshold) {
      if (!seg) this.segment = { start: t, peak: rms, frames: 0, centroid: 0, flatness: 0, below: 0, emitted: false }
      const s = this.segment
      s.peak = Math.max(s.peak, rms)
      s.frames++
      s.centroid += centroid
      s.flatness += flatness
      s.below = 0
      // A sustained sound is reported while it is still going.
      if (!s.emitted && t - s.start > 0.7) {
        s.emitted = true
        this.emit(this.classifySustained(s), s)
      }
    } else if (seg) {
      seg.below += 0.04
      if (seg.below > 0.12) {
        const dur = t - seg.start - seg.below
        if (dur < 0.25) {
          this.onsets = [...this.onsets.filter((x) => t - x < 4), seg.start]
          if (!this.checkRhythm()) {
            const bright = seg.centroid / seg.frames > 1800
            this.emit(seg.peak > this.threshold * 4 && bright ? 'clap' : 'tap', seg)
          }
        }
        this.segment = null
      }
    }
  }

  classifySustained(s) {
    const c = s.centroid / s.frames
    const f = s.flatness / s.frames
    if (f > 0.3 && c > 1800 && s.peak < this.threshold * 5) return 'whisper'
    if (c < 650 && f < 0.12) return 'hum'
    return 'voice'
  }

  checkRhythm() {
    if (this.onsets.length < 4) return false
    const gaps = this.onsets.slice(1).map((x, i) => x - this.onsets[i])
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length)
    if (mean > 0.15 && mean < 1.5 && sd / mean < 0.25) {
      this.onsets = []
      this.emit('rhythm', { peak: this.threshold * 3 }, true)
      return true
    }
    return false
  }

  emit(kind, seg, force = false) {
    const t = performance.now() / 1000
    if (!force && t - this.lastEmit < 0.35) return
    this.lastEmit = t
    const intensity = clamp((seg.peak / this.threshold - 1) / 6)
    this.onPerception({ kind, intensity, source: 'microphone' })
  }
}
