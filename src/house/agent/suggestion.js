// HOW A SUGGESTION FITS A POSTURE (instruction compatibility, for the planner).
//
// No posture is written next to a sentence. Instead every posture is measured from its own
// geometry (the bone frames of his body as it would lie):
//   elong     how elongated the whole body is (ratio of its principal extents)
//   size      how much floor it spans
//   straight  how straight the spine is, head to pelvis
//   bend      how bent the joints are, on average
//   reach     how far hands and feet are from the body's centre
//   apart     how far apart the feet are
//   turn      which way the torso points
//   centre    where the body's centre lies
// A candidate is compared with how he lies NOW, so "becoming smaller" means more compact than
// the present posture, and "turning onto your side" means a large turn of the torso from here.
// Each concept reads those changes in its own way; the result is a compatibility in -1..1.

import { Body, POSES } from '../body/body.js'
import { BONES, angleDelta } from '../../sleeping/entity/skeleton.js'

const PARENT = Object.fromEntries(BONES.map((b) => [b.id, b.parent]))
const SPINE = ['spine', 'chest', 'neck', 'head']

export function measure(frames) {
  const pts = []
  for (const f of Object.values(frames)) pts.push(f.a, f.b)
  const n = pts.length
  const cx = pts.reduce((s, p) => s + p.x, 0) / n
  const cy = pts.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of pts) {
    sxx += (p.x - cx) ** 2
    syy += (p.y - cy) ** 2
    sxy += (p.x - cx) * (p.y - cy)
  }
  sxx /= n
  syy /= n
  sxy /= n
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = Math.max(1e-6, tr / 2 - disc)
  const len = SPINE.reduce((s, id) => s + Math.hypot(frames[id].b.x - frames[id].a.x, frames[id].b.y - frames[id].a.y), 0)
  const straight = Math.hypot(frames.head.b.x - frames.spine.a.x, frames.head.b.y - frames.spine.a.y) / len
  let bend = 0
  let joints = 0
  for (const [id, f] of Object.entries(frames)) {
    const p = PARENT[id]
    if (!p || !frames[p]) continue
    bend += Math.abs(angleDelta((f.ang * 180) / Math.PI, (frames[p].ang * 180) / Math.PI))
    joints++
  }
  const ends = ['handL', 'handR', 'footL', 'footR'].map((id) => frames[id].b)
  const reach = ends.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / ends.length
  const apart = Math.hypot(frames.footL.b.x - frames.footR.b.x, frames.footL.b.y - frames.footR.b.y)
  const turn = Math.atan2(frames.head.b.y - frames.spine.a.y, frames.head.b.x - frames.spine.a.x)
  return { elong: Math.sqrt(l1 / l2), size: Math.sqrt(tr), straight, bend: bend / joints, reach, apart, turn, cx, cy }
}

// The spread of each measure over all his postures: what counts as a large change.
const scaleCache = new Map()
function scales(place) {
  const key = `${place.x},${place.y},${place.rot},${place.scale}`
  if (!scaleCache.has(key)) {
    const ms = Object.keys(POSES).filter((p) => !POSES[p].embodied).map((p) => measure(Body.framesOf(p, place)))
    const sd = (k) => {
      const v = ms.map((m) => m[k])
      const mean = v.reduce((s, x) => s + x, 0) / v.length
      return Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length) || 1
    }
    const centre = Math.sqrt(sd('cx') ** 2 + sd('cy') ** 2)
    scaleCache.set(key, { elong: sd('elong'), size: sd('size'), straight: sd('straight'), bend: sd('bend'), reach: sd('reach'), apart: sd('apart'), turn: 0.6, centre })
  }
  return scaleCache.get(key)
}

const t = Math.tanh

// How each concept reads the change from now to a candidate (each roughly -1..1).
function reading(d, k) {
  const change = (Math.abs(d.elong) / k.elong + Math.abs(d.size) / k.size + Math.abs(d.bend) / k.bend + Math.abs(d.turn) / k.turn + d.centre / k.centre) / 5
  return {
    UPRIGHT: t(d.straight / k.straight + (0.5 * d.elong) / k.elong - (0.5 * d.apart) / k.apart),
    ELONGATED: t(d.elong / k.elong + (0.4 * d.reach) / k.reach),
    LATERAL_MOVEMENT: t(d.centre / k.centre + (0.3 * Math.abs(d.turn)) / k.turn - 0.4),
    ROLLING: t(Math.abs(d.turn) / k.turn - 0.5),
    EXPANSION: t(d.size / k.size + (0.5 * d.reach) / k.reach),
    CONTRACTION: t(-d.size / k.size - (0.5 * d.reach) / k.reach),
    STILLNESS: t(1 - 2 * change),
    FLEXION: t(d.bend / k.bend),
    EXTENSION: t(-d.bend / k.bend + (0.5 * d.reach) / k.reach),
    UNKNOWN: 0,
  }
}

// How closely one posture resembles another in shape (1 the same … below 0 nothing alike), from
// the measured features that do not depend on where or which way round he lies.
export function shapeFit(poseA, poseB, place) {
  const k = scales(place)
  const a = measure(Body.framesOf(poseA, place))
  const b = measure(Body.framesOf(poseB, place))
  let d = 0
  for (const f of ['elong', 'size', 'straight', 'bend', 'reach', 'apart']) d += ((a[f] - b[f]) / k[f]) ** 2
  return Math.max(-1, 1 - Math.sqrt(d) / 3)
}

// Compatibility of a posture (or of staying as he is: pose = null) with a suggestion's concepts.
export function compatibility(concepts, currentFrames, pose, place) {
  const k = scales(place)
  const a = measure(currentFrames)
  const b = pose ? measure(Body.framesOf(pose, place)) : a
  let turn = b.turn - a.turn
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const d = { elong: b.elong - a.elong, size: b.size - a.size, straight: b.straight - a.straight, bend: b.bend - a.bend, reach: b.reach - a.reach, apart: b.apart - a.apart, turn, centre: Math.hypot(b.cx - a.cx, b.cy - a.cy) }
  const r = reading(d, k)
  let sum = 0
  let w = 0
  for (const [c, wc] of Object.entries(concepts)) {
    if (c === 'UNKNOWN') continue
    sum += wc * r[c]
    w += wc
  }
  return w ? sum / w : 0
}
