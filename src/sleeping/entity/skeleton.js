// THE VASTU PURUSHA'S BODY — a 2D articulated skeleton seen from above.
//
// Coordinates are in the body's own frame: pelvis near the origin, head toward -y. The panel
// rotates the whole figure by 45°, so the head lies in the north-east (Ishanya) and the feet in
// the south-west (Nairitya), as in the traditional mandala image. Every bone has its own joint
// angle; moving a parent carries its children (forward kinematics).
//
// Angles are degrees, screen convention: 0 = right, 90 = down, -90 = up.

export const BONES = [
  { id: 'spine', parent: null, len: 70 },
  { id: 'chest', parent: 'spine', len: 64 },
  { id: 'neck', parent: 'chest', len: 26 },
  { id: 'head', parent: 'neck', len: 34 },
  { id: 'clavL', parent: 'chest', len: 40 },
  { id: 'armL', parent: 'clavL', len: 62 },
  { id: 'foreL', parent: 'armL', len: 80 },
  { id: 'handL', parent: 'foreL', len: 15 },
  { id: 'clavR', parent: 'chest', len: 40 },
  { id: 'armR', parent: 'clavR', len: 62 },
  { id: 'foreR', parent: 'armR', len: 80 },
  { id: 'handR', parent: 'foreR', len: 15 },
  { id: 'hipL', parent: null, len: 28 },
  { id: 'thighL', parent: 'hipL', len: 62 },
  { id: 'shinL', parent: 'thighL', len: 64 },
  { id: 'footL', parent: 'shinL', len: 24 },
  { id: 'hipR', parent: null, len: 28 },
  { id: 'thighR', parent: 'hipR', len: 62 },
  { id: 'shinR', parent: 'thighR', len: 64 },
  { id: 'footR', parent: 'shinR', len: 24 },
]
export const BONE = Object.fromEntries(BONES.map((b) => [b.id, b]))
const ROOT_POS = { x: 0, y: 40 }

// Body regions (the mandala's reading of the body) and the bones that belong to each.
// Labels come from the earlier daemon project's Vastu reference.
export const REGION_BONES = {
  head: ['neck', 'head'],
  armN: ['clavL', 'armL'],
  handNW: ['foreL', 'handL'],
  armE: ['clavR', 'armR'],
  handSE: ['foreR', 'handR'],
  navel: ['spine', 'chest'],
  legW: ['hipL', 'thighL', 'shinL'],
  legS: ['hipR', 'thighR', 'shinR'],
  feet: ['footL', 'footR'],
}
export const BONE_REGION = Object.fromEntries(Object.entries(REGION_BONES).flatMap(([r, bs]) => bs.map((b) => [b, r])))
export const REGION_LABEL = {
  head: 'head',
  armN: 'north shoulder',
  handNW: 'north-west hand',
  armE: 'east shoulder',
  handSE: 'south-east hand',
  navel: 'navel',
  legW: 'west leg',
  legS: 'south leg',
  feet: 'feet',
}
// The joint whose displacement stands for each region (used by the architecture mapping).
export const REGION_ANCHOR = {
  head: 'head',
  armN: 'armL',
  handNW: 'handL',
  armE: 'armR',
  handSE: 'handR',
  navel: 'spine',
  legW: 'thighL',
  legS: 'thighR',
  feet: 'footL',
}

// ---------- postures, authored as world angles of every bone ----------
// root: the direction of the spine's base. curl: finger curl (0 open .. 1 fist).
// lens: optional length multipliers (foreshortening when a part lifts or folds).
const W = {
  mandala: {
    label: 'Mandala',
    note: 'settled in his own shape',
    root: -90, spine: -90, chest: -90, neck: -90, head: -90,
    clavL: 180, armL: 161, foreL: 121, handL: 111,
    clavR: 0, armR: 19, foreR: 59, handR: 69,
    hipL: 180, thighL: 143, shinL: 47, footL: 49,
    hipR: 0, thighR: 37, shinR: 133, footR: 131,
    curlL: 0.25, curlR: 0.25,
  },
  stretched: {
    label: 'Stretched',
    note: 'long and loosened',
    root: -90, spine: -90, chest: -91, neck: -93, head: -95,
    clavL: 190, armL: 222, foreL: 288, handL: 300,
    clavR: -10, armR: -42, foreR: -108, handR: -120,
    hipL: 178, thighL: 101, shinL: 95, footL: 88,
    hipR: 2, thighR: 79, shinR: 85, footR: 92,
    curlL: 0.08, curlR: 0.08,
  },
  turned: {
    label: 'Turned',
    note: 'turned away, on his side',
    root: -122, spine: -122, chest: -130, neck: -136, head: -144,
    clavL: 140, armL: 168, foreL: 108, handL: 98,
    clavR: -40, armR: 158, foreR: 118, handR: 104,
    hipL: 148, thighL: 172, shinL: 100, footL: 88,
    hipR: -32, thighR: 160, shinR: 112, footR: 100,
    curlL: 0.5, curlR: 0.6,
  },
  curled: {
    label: 'Curled',
    note: 'drawn in around himself',
    root: -50, spine: -50, chest: -12, neck: 32, head: 64,
    clavL: -102, armL: 26, foreL: 98, handL: 122,
    clavR: 78, armR: 118, foreR: 172, handR: 192,
    hipL: -140, thighL: -22, shinL: 150, footL: 172,
    hipR: 40, thighR: -2, shinR: 166, footR: 186,
    curlL: 0.92, curlR: 0.92,
    lens: { spine: 0.86, chest: 0.9 },
    rootX: -34, rootY: 6,
  },
  guarded: {
    label: 'Guarded',
    note: 'arms over his head',
    root: -90, spine: -92, chest: -97, neck: -100, head: -104,
    clavL: 196, armL: 254, foreL: -12, handL: 8,
    clavR: -16, armR: -74, foreR: 190, handR: 172,
    hipL: 180, thighL: 122, shinL: 70, footL: 70,
    hipR: 0, thighR: 56, shinR: 114, footR: 116,
    curlL: 0.85, curlR: 0.85,
  },
  sprawled: {
    label: 'Sprawled',
    note: 'flung open, restless',
    root: -88, spine: -86, chest: -80, neck: -70, head: -60,
    clavL: 188, armL: 204, foreL: 232, handL: 240,
    clavR: 8, armR: 34, foreR: 14, handR: 4,
    hipL: 182, thighL: 156, shinL: 126, footL: 116,
    hipR: -2, thighR: 60, shinR: 76, footR: 86,
    curlL: 0.05, curlR: 0.1,
  },
  awake: {
    label: 'Awake',
    note: 'rising, searching',
    root: -90, spine: -90, chest: -90, neck: -80, head: -64,
    clavL: 180, armL: 138, foreL: 118, handL: 108,
    clavR: 0, armR: 42, foreR: 62, handR: 72,
    hipL: 180, thighL: 100, shinL: 94, footL: 80,
    hipR: 0, thighR: 80, shinR: 86, footR: 100,
    curlL: 0, curlR: 0,
    lens: { spine: 0.5, chest: 0.55, neck: 0.7 },
    rootY: -6,
  },
}

const norm = (a) => {
  let x = ((a + 180) % 360 + 360) % 360 - 180
  if (x === -180) x = 180
  return x
}
export const angleDelta = (from, to) => norm(to - from)

// World angles → local joint angles (each relative to its parent bone).
function toLocal(w) {
  const local = { root: w.root, curlL: w.curlL, curlR: w.curlR }
  for (const b of BONES) {
    const parentWorld = b.parent ? w[b.parent] : w.root
    local[b.id] = norm(w[b.id] - parentWorld)
  }
  return local
}

export const POSTURES = Object.fromEntries(
  Object.entries(W).map(([id, w]) => [
    id,
    { id, label: w.label, note: w.note, angles: toLocal(w), lens: w.lens ?? {}, rootX: w.rootX ?? 0, rootY: w.rootY ?? 0 },
  ]),
)

// ---------- forward kinematics ----------
// angles: local angles (with root), lens: length multipliers, offset: root shift.
export function solve(angles, lens = {}, offset = { x: 0, y: 0 }) {
  const out = {}
  const root = { x: ROOT_POS.x + offset.x, y: ROOT_POS.y + offset.y }
  for (const b of BONES) {
    const parent = b.parent ? out[b.parent] : null
    const base = parent ? parent.a : angles.root
    const a = base + angles[b.id]
    // Hips and the spine start at the pelvis; clavicles start at the top of the chest.
    const start = parent ? { x: parent.x1, y: parent.y1 } : root
    const L = b.len * (lens[b.id] ?? 1)
    const r = (a * Math.PI) / 180
    out[b.id] = { x0: start.x, y0: start.y, x1: start.x + Math.cos(r) * L, y1: start.y + Math.sin(r) * L, a }
  }
  // Fingers: three per hand, two segments each, curling toward the palm.
  out.fingers = {}
  for (const side of ['L', 'R']) {
    const hand = out[`hand${side}`]
    const curl = angles[`curl${side}`] ?? 0.3
    const dir = side === 'L' ? -1 : 1
    out.fingers[side] = [-26, 0, 26].map((spread, i) => {
      const a1 = hand.a + spread * (1 - curl * 0.6) + dir * curl * 50
      const r1 = (a1 * Math.PI) / 180
      const L1 = i === 1 ? 10 : 8.5
      const p1 = { x: hand.x1 + Math.cos(r1) * L1, y: hand.y1 + Math.sin(r1) * L1 }
      const a2 = a1 + dir * curl * 75
      const r2 = (a2 * Math.PI) / 180
      const L2 = i === 1 ? 8 : 6.5
      return [{ x: hand.x1, y: hand.y1 }, p1, { x: p1.x + Math.cos(r2) * L2, y: p1.y + Math.sin(r2) * L2 }]
    })
  }
  out.root = root
  return out
}

// Body frame → plan frame (the 45° turn that lays the figure across the mandala).
const C45 = Math.SQRT1_2
export const toPlan = (p) => ({ x: (p.x - p.y) * C45, y: (p.x + p.y) * C45 })
export const fromPlanDir = (d) => ({ x: (d.x + d.y) * C45, y: (-d.x + d.y) * C45 })
