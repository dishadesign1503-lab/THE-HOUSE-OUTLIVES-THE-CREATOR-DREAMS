// TILT → A PUSH ON THE CIRCLE (tilt controller).
//
// Calibration remembers how the phone is held when the player is comfortable; tilting away
// from that pose pushes the circle. The pull is the slope of the screen (sine of the tilt),
// with a dead zone so a steady hand gives exactly zero, and full push at about 22°.
// Screen rotation is taken into account. Without sensors: arrow keys / WASD, or dragging a
// finger on the board (touch fallback). Every source gives the same thing: a vector -1..1.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const FULL = Math.sin((22 * Math.PI) / 180)

function rotationTo(from, to) {
  // Rodrigues: the rotation turning unit vector `from` onto `to`.
  const v = { x: from.y * to.z - from.z * to.y, y: from.z * to.x - from.x * to.z, z: from.x * to.y - from.y * to.x }
  const c = from.x * to.x + from.y * to.y + from.z * to.z
  const s2 = v.x * v.x + v.y * v.y + v.z * v.z
  if (s2 < 1e-9) return c > 0 ? null : [[1, 0, 0], [0, -1, 0], [0, 0, -1]]
  const k = (1 - c) / s2
  const K = [
    [0, -v.z, v.y],
    [v.z, 0, -v.x],
    [-v.y, v.x, 0],
  ]
  const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let kk = 0
      for (let m = 0; m < 3; m++) kk += K[i][m] * K[m][j]
      R[i][j] += K[i][j] + kk * k
    }
  }
  return R
}

const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

export function screenAngle() {
  if (typeof window === 'undefined') return 0
  const a = window.screen?.orientation?.angle ?? window.orientation ?? 0
  return ((a % 360) + 360) % 360
}

export class TiltController {
  constructor() {
    this.R = null // calibration rotation
    this.calibrated = false
    this.deadzone = 0.045
    this.keys = new Set()
    this.keyVec = { x: 0, y: 0 }
    this.touch = null // { x, y } while a finger drags (fallback)
    this.last = { x: 0, y: 0 }
    this.source = 'none'
  }

  calibrate(gravity) {
    if (!gravity) return false
    this.R = rotationTo(norm(gravity), { x: 0, y: 0, z: -1 })
    this.calibrated = true
    return true
  }

  // The phone's tilt as screen directions: x right, y down; magnitude = slope.
  fromGravity(gravity) {
    let g = norm(gravity)
    if (this.R) {
      const R = this.R
      g = { x: R[0][0] * g.x + R[0][1] * g.y + R[0][2] * g.z, y: R[1][0] * g.x + R[1][1] * g.y + R[1][2] * g.z, z: R[2][0] * g.x + R[2][1] * g.y + R[2][2] * g.z }
    }
    // device frame (y up) → screen frame (y down), then the screen's rotation
    const a = screenAngle()
    if (a === 90) return { x: -g.y, y: -g.x }
    if (a === 270) return { x: g.y, y: g.x }
    if (a === 180) return { x: -g.x, y: g.y }
    return { x: g.x, y: -g.y }
  }

  shape(v) {
    const m = Math.hypot(v.x, v.y)
    if (m <= this.deadzone) return { x: 0, y: 0 }
    const k = clamp((m - this.deadzone) / (FULL - this.deadzone)) ** 1.25
    return { x: (v.x / m) * k, y: (v.y / m) * k }
  }

  // Keyboard keys held → a target that the "virtual tilt" eases toward, like a real hand.
  keyTarget() {
    const k = this.keys
    let x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0)
    let y = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0)
    const m = Math.hypot(x, y) || 1
    const amp = k.has('fast') ? 1 : 0.7
    return { x: (x / m) * amp, y: (y / m) * amp }
  }

  get keysHeld() {
    return ['up', 'down', 'left', 'right'].some((d) => this.keys.has(d))
  }

  // One reading for this frame. gravity: from the sensor manager, or null.
  read(gravity, dt) {
    const t = this.keyTarget()
    const ease = 1 - Math.exp(-dt * 7)
    this.keyVec = { x: this.keyVec.x + (t.x - this.keyVec.x) * ease, y: this.keyVec.y + (t.y - this.keyVec.y) * ease }
    let out = { x: 0, y: 0 }
    if (this.keysHeld || Math.hypot(this.keyVec.x, this.keyVec.y) > 0.02) {
      out = this.keyVec
      this.source = 'keys'
    } else if (this.touch) {
      out = this.shape({ x: this.touch.x * FULL, y: this.touch.y * FULL })
      this.source = 'touch'
    } else if (gravity) {
      out = this.shape(this.fromGravity(gravity))
      this.source = 'tilt'
    } else this.source = 'none'
    if (!Number.isFinite(out.x) || !Number.isFinite(out.y)) out = { x: 0, y: 0 } // never let a bad reading reach the physics
    this.last = out
    return out
  }
}

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'fast', ShiftRight: 'fast',
}

export function keyDirection(code) {
  return KEYMAP[code]
}
