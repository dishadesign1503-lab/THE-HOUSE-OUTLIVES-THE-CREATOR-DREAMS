// VIBRATION (haptics manager).
//
// Each pattern says something about the house. The browser decides whether anything is felt:
// iOS Safari has no vibration API at all, and Android only vibrates after the page has been
// tapped. So this never claims a vibration happened; `lastResult` records what the browser
// answered, and every pattern also has a visual equivalent (onPulse), shown on screen.

export const PATTERNS = {
  tap: [14], // a minor knock against a wall
  danger: [35, 60, 45], // a severe or repeated collision
  heartbeat: [22, 110, 30], // the house is restless (repeats, faster as it nears reorganising)
  critical: [30, 60, 30, 60, 90], // critical disturbance: it is about to reorganise
  transform: [180, 70, 180, 70, 420], // a major architectural transformation
  shift: [60, 260, 60, 260, 60], // the house settling back into its old order
  crack: [90, 40, 140], // the oldest wall cracks
  escape: [40, 90, 40, 90, 260], // the door / the end
  test: [60, 80, 60],
}

export class Haptics {
  constructor() {
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    this.enabled = true
    this.minimal = false // reduced motion: only the essential patterns
    this.lastResult = this.supported ? 'not used yet' : 'unsupported'
    this.onPulse = null
    this.lastAt = 0
  }

  play(name) {
    const pattern = PATTERNS[name]
    if (!pattern) return false
    this.onPulse?.(name)
    if (!this.enabled || !this.supported) return false
    if (this.minimal && !['transform', 'escape', 'test', 'danger', 'critical'].includes(name)) return false
    const now = performance.now()
    // never stack: a new tap does not cut a long pattern short
    if (name === 'tap' && now - this.lastAt < 120) return false
    this.lastAt = now
    let ok = false
    try {
      ok = navigator.vibrate(pattern)
    } catch {
      ok = false
    }
    this.lastResult = ok ? 'accepted by the browser' : 'refused by the browser'
    return ok
  }

  stop() {
    if (this.supported) navigator.vibrate(0)
  }
}
