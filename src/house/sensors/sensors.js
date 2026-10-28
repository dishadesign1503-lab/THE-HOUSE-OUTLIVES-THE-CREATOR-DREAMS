// THE PHONE'S MOTION SENSORS (sensor manager).
//
// Orientation (beta, gamma) gives the direction of gravity in the phone's own frame; that is
// what tilting changes. Motion (rotation rate, acceleration) says how much the phone is being
// moved; that is what the Purusha notices while he searches, and what a sudden shake is.
//
// Browsers differ: iOS asks permission from a button press; Android Chrome needs https; desktop
// browsers often have the API but no sensor, so "supported" is only believed once data arrives.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

export function capabilities() {
  const w = typeof window !== 'undefined' ? window : {}
  return {
    secure: !!w.isSecureContext,
    orientation: 'DeviceOrientationEvent' in w,
    motion: 'DeviceMotionEvent' in w,
    needsPermission: typeof w.DeviceOrientationEvent?.requestPermission === 'function',
    vibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    mic: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    touch: !!w.matchMedia?.('(pointer: coarse)').matches,
  }
}

export class SensorManager {
  constructor() {
    this.caps = capabilities()
    // unknown | unsupported | insecure | needs-permission | denied | waiting | active | no-data
    this.status = 'unknown'
    this.gravity = null // { x, y, z } in the phone's frame, filtered
    this.raw = { beta: 0, gamma: 0, rot: 0, acc: 0 }
    this.motion = 0 // 0..1: how much the phone is being moved right now
    this.events = 0
    this.lastEvent = 0
    this.onShake = null
    this.lastShake = 0
    this.suspended = false
    this.onOrientation = (e) => this.orientation(e)
    this.onMotion = (e) => this.motionEvent(e)
    if (!this.caps.orientation) this.status = 'unsupported'
    else if (!this.caps.secure) this.status = 'insecure'
    else if (this.caps.needsPermission) this.status = 'needs-permission'
  }

  // Must run inside a click/tap handler on iOS.
  async request() {
    if (!this.caps.orientation) return (this.status = 'unsupported')
    if (!this.caps.secure) return (this.status = 'insecure')
    try {
      if (this.caps.needsPermission) {
        const o = await window.DeviceOrientationEvent.requestPermission()
        if (o !== 'granted') return (this.status = 'denied')
        if (typeof window.DeviceMotionEvent?.requestPermission === 'function') {
          await window.DeviceMotionEvent.requestPermission().catch(() => 'denied')
        }
      }
    } catch {
      return (this.status = 'denied')
    }
    this.start()
    return this.status
  }

  start() {
    if (this.listening) return
    this.listening = true
    window.addEventListener('deviceorientation', this.onOrientation)
    window.addEventListener('devicemotion', this.onMotion)
    this.status = 'waiting'
    // Desktop browsers often expose the API but never send real values.
    clearTimeout(this.noDataTimer)
    this.noDataTimer = setTimeout(() => {
      if (this.status === 'waiting') this.status = 'no-data'
    }, 1800)
  }

  stop() {
    this.listening = false
    clearTimeout(this.noDataTimer)
    window.removeEventListener('deviceorientation', this.onOrientation)
    window.removeEventListener('devicemotion', this.onMotion)
  }

  // Hidden page: stop listening, remember to come back.
  suspend() {
    if (!this.listening) return
    this.suspended = true
    this.stop()
  }

  resume() {
    if (!this.suspended) return
    this.suspended = false
    this.start()
  }

  get active() {
    return this.status === 'active'
  }

  orientation(e) {
    if (e.beta == null || e.gamma == null) return
    const b = (e.beta * Math.PI) / 180
    const g = (e.gamma * Math.PI) / 180
    // gravity in the phone's frame (x right, y up the screen, z out of the screen)
    const v = { x: Math.sin(g) * Math.cos(b), y: -Math.sin(b), z: -Math.cos(b) * Math.cos(g) }
    if (!this.gravity) this.gravity = v
    else {
      // light smoothing: removes jitter without making the controls feel late
      const k = 0.35
      this.gravity = { x: this.gravity.x + (v.x - this.gravity.x) * k, y: this.gravity.y + (v.y - this.gravity.y) * k, z: this.gravity.z + (v.z - this.gravity.z) * k }
    }
    this.raw.beta = e.beta
    this.raw.gamma = e.gamma
    this.events++
    this.lastEvent = performance.now()
    this.status = 'active'
  }

  motionEvent(e) {
    const r = e.rotationRate
    const rot = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0
    let acc = 0
    if (e.acceleration && e.acceleration.x != null) acc = Math.hypot(e.acceleration.x, e.acceleration.y, e.acceleration.z)
    else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
      const a = e.accelerationIncludingGravity
      acc = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81)
    }
    this.raw.rot = rot
    this.raw.acc = acc
    // Hand tremor stays below ~20°/s and ~0.6 m/s²; only deliberate movement counts.
    const m = Math.max(clamp((rot - 25) / 90), clamp((acc - 0.8) / 3.5))
    this.motion += (m - this.motion) * (m > this.motion ? 0.5 : 0.1)
    // a sudden shake: a strong jolt, debounced
    const now = performance.now()
    if (acc > 11 && now - this.lastShake > 1500) {
      this.lastShake = now
      this.onShake?.(clamp((acc - 11) / 12))
    }
  }
}
