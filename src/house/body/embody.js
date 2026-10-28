// EMBODYING AN OBJECT — sleeping postures composed from an object's attributes.
//
// Each attribute has a body template, authored like the other postures (the world angle of every
// bone; head toward -90°, left arm toward 180°, right arm toward 0°, legs toward +90°):
//   upright     a pole: spine straight, arms raised close together overhead, legs together
//   elongated   arms reaching overhead, legs straight: as long as the body can be
//   branching   a straight trunk, arms rising outward and upward like branches
//   horizontal  a long hull rolled onto one side, its ends lifted a little
//   compact     curled tight around himself
//   spanning    stretched end to end, arms and legs reaching apart, the back slightly arched
//   curved      the whole body bent into a crescent
//   spread      limbs flung out like a star
// An object's posture is the weighted blend of its attributes' templates. Variants are offered at
// three degrees of expression (how far from his present posture toward that shape) and on either
// side; the planner (his mind) chooses among them. Nothing here decides.

import { BONES, POSTURES, angleDelta } from '../../sleeping/entity/skeleton.js'
import { POSES, worldFromLocal, localFromWorld, BONE_REGION, REGION_LABEL } from './body.js'

const ids = ['root', ...BONES.map((b) => b.id)]
const W = (o) => o
const curledWorld = worldFromLocal(POSTURES.curled.angles)

const TEMPLATES = {
  upright: W({ root: -90, spine: -90, chest: -90, neck: -90, head: -90, clavL: 215, armL: 262, foreL: 268, handL: 270, clavR: -35, armR: -82, foreR: -88, handR: -90, hipL: 180, thighL: 77, shinL: 78, footL: 90, hipR: 0, thighR: 103, shinR: 102, footR: 90 }),
  elongated: W({ root: -90, spine: -90, chest: -90, neck: -90, head: -90, clavL: 200, armL: 255, foreL: 265, handL: 268, clavR: -20, armR: -75, foreR: -85, handR: -88, hipL: 180, thighL: 95, shinL: 91, footL: 90, hipR: 0, thighR: 85, shinR: 89, footR: 90 }),
  branching: W({ root: -90, spine: -90, chest: -90, neck: -92, head: -94, clavL: 200, armL: 225, foreL: 250, handL: 262, clavR: -20, armR: -45, foreR: -70, handR: -82, hipL: 180, thighL: 94, shinL: 91, footL: 90, hipR: 0, thighR: 86, shinR: 89, footR: 90 }),
  // the hull: arms forward along the body, legs together, ends lifted; then rolled onto a side
  horizontal: W({ root: -90, spine: -90, chest: -95, neck: -102, head: -110, clavL: 195, armL: 250, foreL: 262, handL: 266, clavR: -15, armR: -70, foreR: -82, handR: -86, hipL: 180, thighL: 100, shinL: 84, footL: 80, hipR: 0, thighR: 80, shinR: 96, footR: 100 }),
  compact: curledWorld,
  spanning: W({ root: -86, spine: -84, chest: -92, neck: -100, head: -106, clavL: 205, armL: 262, foreL: 268, handL: 270, clavR: -25, armR: -78, foreR: -88, handR: -90, hipL: 180, thighL: 104, shinL: 98, footL: 94, hipR: 0, thighR: 76, shinR: 82, footR: 86 }),
  curved: W({ root: -60, spine: -60, chest: -85, neck: -110, head: -130, clavL: 175, armL: 200, foreL: 215, handL: 222, clavR: 5, armR: 140, foreR: 172, handR: 182, hipL: 160, thighL: 122, shinL: 150, footL: 160, hipR: -20, thighR: 102, shinR: 135, footR: 150 }),
  spread: W({ root: -90, spine: -90, chest: -90, neck: -90, head: -90, clavL: 190, armL: 200, foreL: 198, handL: 196, clavR: -10, armR: -20, foreR: -18, handR: -16, hipL: 180, thighL: 132, shinL: 132, footL: 132, hipR: 0, thighR: 48, shinR: 48, footR: 48 }),
}

// Which way an object lies IN THE PLAN (his body is laid diagonally under the house, so the
// shape is turned against his placement): mostly upright or branching things stand along the
// plan's north–south axis, mostly lying or spanning things along its east–west axis; compact,
// curved and spread things keep his own diagonal. One orientation for the whole object, so its
// parts agree. (Degrees added to every bone's angle; rot is his placement.)
function orientation(attributes, rot) {
  const vertical = (attributes.upright ?? 0) + (attributes.branching ?? 0)
  const across = (attributes.horizontal ?? 0) + (attributes.spanning ?? 0)
  if (Math.max(vertical, across) < 0.5) return 0
  return across > vertical ? 90 - rot : -rot
}

function rotate(w, deg) {
  const out = {}
  for (const k of Object.keys(w)) out[k] = w[k] + deg
  return out
}

const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180

// the other side: mirrored across the plan's north–south axis (so an upright shape stays upright)
function mirror(w, rot = 0) {
  const m = {}
  for (const [k, v] of Object.entries(w)) m[k] = norm(180 - v - 2 * rot)
  const out = {}
  for (const k of ids) {
    const other = k.endsWith('L') ? `${k.slice(0, -1)}R` : k.endsWith('R') ? `${k.slice(0, -1)}L` : k
    out[k] = m[other] ?? m[k]
  }
  out.root = m.root
  return out
}

// the blended shape of an object (world angles), as a weighted circular mean of the templates;
// weights are squared so the object's strongest character shapes the body
export function shapeOf(attributes, rot = 0) {
  const out = {}
  let total = 0
  for (const w of Object.values(attributes)) total += w
  if (total < 1e-6) return null
  const turn = orientation(attributes, rot)
  for (const k of ids) {
    let sx = 0
    let sy = 0
    for (const [a, w] of Object.entries(attributes)) {
      if (!w || !TEMPLATES[a]) continue
      const r = ((TEMPLATES[a][k] + turn) * Math.PI) / 180
      sx += w * w * Math.cos(r)
      sy += w * w * Math.sin(r)
    }
    out[k] = (Math.atan2(sy, sx) * 180) / Math.PI
  }
  return out
}

// from world angles `a` toward `b` by k (shortest way round each joint)
function blend(a, b, k) {
  const out = {}
  for (const id of ids) out[id] = a[id] + k * angleDelta(a[id], b[id])
  return out
}

function register(id, world, base, extra) {
  const angles = localFromWorld(world, base.angles)
  angles.curlL = extra.curl ?? base.angles.curlL ?? 0.3
  angles.curlR = extra.curl ?? base.angles.curlR ?? 0.3
  POSES[id] = { id, embodied: true, angles, lens: {}, ...extra }
  return POSES[id]
}

let seq = 0

// Candidate postures for an object: 3 degrees of expression × 2 sides, from where he lies now.
export function embodimentCandidates(object, attributes, currentPose, place = { rot: 0 }) {
  const cur = POSES[currentPose]
  const now = worldFromLocal(cur.angles)
  const shape = shapeOf(attributes, place.rot)
  if (!shape) return []
  const curl = attributes.compact > 0.5 ? 0.9 : attributes.spread > 0.5 || attributes.branching > 0.5 ? 0.05 : 0.25
  const tag = object.replace(/\s+/g, '-')
  seq++
  const out = []
  for (const [side, target] of [['', shape], ['~', mirror(shape, place.rot)]]) {
    for (const intensity of [0.6, 0.85, 1]) {
      const id = `emb:${tag}:${seq}:${Math.round(intensity * 100)}${side}`
      const label = `like ${/^[aeiou]/.test(object) ? 'an' : 'a'} ${object}${intensity < 1 ? ` (${Math.round(intensity * 100)}%)` : ''}${side ? ', other side' : ''}`
      register(id, blend(now, target, intensity), cur, { label, major: intensity >= 0.85 || attributes.horizontal >= 0.5, object, intensity, mirror: !!side, curl })
      out.push({ id, intensity, mirror: !!side })
    }
  }
  return out
}

// A posture part of the way from one to another (the stages of the hypnosis).
export function stagePose(id, fromPose, toPose, k) {
  const a = worldFromLocal(POSES[fromPose].angles)
  const b = worldFromLocal(POSES[toPose].angles)
  const p = POSES[toPose]
  return register(id, blend(a, b, k), POSES[toPose], { label: `${p.label}, ${Math.round(k * 100)}%`, major: p.major, object: p.object, intensity: p.intensity, stage: true, curl: p.angles.curlL })
}

// Which parts of him move (by more than `deg`) from one posture to another.
export function affectedRegions(fromPose, toPose, deg = 18) {
  const a = worldFromLocal(POSES[fromPose].angles)
  const b = worldFromLocal(POSES[toPose].angles)
  const regions = new Set()
  for (const id of BONES.map((x) => x.id)) if (Math.abs(angleDelta(b[id], a[id])) > deg) regions.add(BONE_REGION[id])
  return [...regions].map((r) => REGION_LABEL[r] ?? r)
}

// forget postures nobody lies in any more
export function forgetPoses(keep) {
  for (const id of Object.keys(POSES)) if (POSES[id].embodied && !keep.has(id)) delete POSES[id]
}
