// LISTENING FOR A HYPNOTIC INSTRUCTION — offline speech recognition on this device.
//
// Vosk (vosk-browser: the Kaldi recogniser compiled to WebAssembly, running in a web worker) with
// the small English model served from this site (public/models, 41 MB, loaded once, the first
// time the microphone button is used). After that nothing leaves the device: the audio goes from
// the microphone to the recogniser and is discarded; only the recognised words are kept.
//
// Two recognisers hear the same audio: one free (any words), one told which phrases to expect
// ("you are a boat", "you are a lamp stand", …, or "[unk]"). The free one is used when its words
// already name an object; otherwise the guided one, which hears "a boat" where the free one may
// hear "about". The result says which was used.
//
// The microphone is opened only when the player presses the button, and closed when they stop.
// status: idle | loading | ready | recording | recognizing | unsupported | denied | failed

import { expectedPhrases, parseInstruction } from './objects.js'

const MODEL = 'models/vosk-model-small-en-us-0.15.tar.gz'
const MAX_SECONDS = 8

export class HypnoListener {
  constructor() {
    this.status = !navigator.mediaDevices?.getUserMedia ? 'unsupported' : 'idle'
    this.reason = this.status === 'unsupported' ? (window.isSecureContext ? 'This browser cannot use a microphone.' : 'The microphone needs a secure (https) page.') : ''
    this.model = null
    this.level = 0
  }

  get available() {
    return this.status !== 'unsupported' && this.status !== 'denied' && this.status !== 'failed'
  }

  async loadModel() {
    if (this.model) return this.model
    if (!this.loading) {
      this.loading = (async () => {
        const { createModel } = await import('vosk-browser')
        const url = new URL(`${import.meta.env.BASE_URL}${MODEL}`, window.location.href).href
        const model = await createModel(url, -1)
        this.model = model
        return model
      })()
    }
    return this.loading
  }

  // Open the microphone and start recognising. onLevel(0..1) follows the voice; onAutoStop is
  // called if the player speaks past the time limit.
  async start({ onLevel, onAutoStop } = {}) {
    if (!this.available) throw new Error(this.reason)
    try {
      this.status = 'loading'
      await this.loadModel()
    } catch (e) {
      this.status = 'failed'
      this.reason = 'The listening model could not be loaded.'
      this.loading = null
      throw e
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      this.status = denied ? 'denied' : 'failed'
      this.reason = denied ? 'Microphone permission was refused.' : 'No microphone could be opened.'
      throw e
    }
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const source = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    const rec = new this.model.KaldiRecognizer(ctx.sampleRate)
    const guided = new this.model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...expectedPhrases(), '[unk]']))
    const texts = []
    const guidedTexts = []
    rec.on('result', (m) => {
      const t = m.result?.text?.trim()
      if (t) texts.push(t)
      this.onFinal?.('free')
    })
    guided.on('result', (m) => {
      const t = m.result?.text?.trim()
      if (t) guidedTexts.push(t)
      this.onFinal?.('guided')
    })
    rec.on('partialresult', (m) => {
      this.partial = m.result?.partial ?? ''
    })
    let peak = 0
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0)
      let sum = 0
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i]
      const rms = Math.sqrt(sum / d.length)
      this.level = Math.min(1, rms * 6)
      peak = Math.max(peak, this.level)
      onLevel?.(this.level)
      try {
        rec.acceptWaveform(e.inputBuffer)
        guided.acceptWaveform(e.inputBuffer)
      } catch {
        // the recogniser was already removed
      }
    }
    source.connect(proc)
    proc.connect(ctx.destination) // a script processor runs only when connected; it outputs silence
    this.session = { stream, ctx, source, proc, rec, guided, texts, guidedTexts, peak: () => peak }
    this.partial = ''
    this.status = 'recording'
    this.autoStop = setTimeout(() => onAutoStop?.(), MAX_SECONDS * 1000)
    return true
  }

  // Close the microphone and return what was recognised: { text, loudness }.
  async stop() {
    const s = this.session
    clearTimeout(this.autoStop)
    if (!s) return { text: '', loudness: 0 }
    this.session = null
    this.status = 'recognizing'
    s.source.disconnect()
    s.proc.disconnect()
    s.proc.onaudioprocess = null
    for (const t of s.stream.getTracks()) t.stop()
    // the last words: ask both recognisers for their final result and wait (briefly)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000)
      const done = new Set()
      this.onFinal = (which) => {
        done.add(which)
        if (done.size === 2) {
          clearTimeout(timer)
          resolve()
        }
      }
      s.rec.retrieveFinalResult()
      s.guided.retrieveFinalResult()
    })
    this.onFinal = null
    s.rec.remove()
    s.guided.remove()
    s.ctx.close().catch(() => {})
    this.status = 'ready'
    this.level = 0
    let text = s.texts.join(' ').trim()
    if (!text && this.partial) text = this.partial.trim()
    // Vosk sometimes returns only the filler "the" for noise
    if (text === 'the') text = ''
    const guidedText = s.guidedTexts.filter((t) => !t.includes('[unk]'))[0]?.trim() ?? ''
    const free = parseInstruction(text)
    const guided = guidedText ? parseInstruction(guidedText) : null
    // the guided reading when the free one names nothing, or names less of the same thing
    // ("lamps dead" → lamp, guided "lamp stand")
    // the free words count when they say it cleanly ("you are a boat"), not "you are as dog"
    const clean = free.ok && new RegExp(`you are (a|an|the) ${free.object}\b`).test(text)
    const moreSpecific = free.ok && guided?.ok && guided.object !== free.object && (guided.object.split(' ').includes(free.object) || free.source === 'description' || !clean)
    if (guided?.ok && (!free.ok || moreSpecific)) return { text: guidedText, free: text, via: 'guided', loudness: s.peak() }
    return { text, guided: guidedText, via: 'free', loudness: s.peak() }
  }

  cancel() {
    const s = this.session
    clearTimeout(this.autoStop)
    if (!s) return
    this.session = null
    s.proc.onaudioprocess = null
    s.source.disconnect()
    s.proc.disconnect()
    for (const t of s.stream.getTracks()) t.stop()
    s.rec.remove()
    s.guided.remove()
    s.ctx.close().catch(() => {})
    this.status = 'ready'
  }
}
