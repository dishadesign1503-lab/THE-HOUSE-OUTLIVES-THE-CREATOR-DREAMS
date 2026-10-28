// THE BODY IN THE ARCHITECTURE — how his movements reshape the plan.
//
// Each room lies over a body region (plan.js). When that region moves away from the mandala rest
// pose, the room follows: it shifts with the limb, shrinks when the limb draws in, swells when it
// extends; the courtyard turns with the spine and breathes with the chest. Rooms are quads on a
// shared lattice, so walls stay joined and doors stay doors.

import { CENTRE, IDEAL, ROOMS, XS, YS, restLattice, roomCorners } from './plan.js'

const UNIT = 9 / 150 // body units → metres (the mandala square is 300 units across in the panel)
const GAIN = 1.1
const MAX_SHIFT = 1.7

function idealLattice() {
  const pts = []
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pts.push({ x: IDEAL[i], y: IDEAL[j] })
  return pts
}
const REST = restLattice()
const IDEAL_PTS = idealLattice()

// regions: animator.regionState(). ending: { kind, k } where k runs 0..1 during the ending.
export function deformLattice(regions, ending = null) {
  const sum = REST.map(() => ({ x: 0, y: 0, n: 0 }))
  let gain = GAIN
  if (ending?.kind === 'restored') gain *= 1 - ending.k
  if (ending?.kind === 'unsettled') gain *= 1 + 0.4 * ending.k
  for (const room of ROOMS) {
    const rs = regions?.[room.region]
    if (!rs) continue
    let dx = rs.dx * UNIT * gain
    let dy = rs.dy * UNIT * gain
    const m = Math.hypot(dx, dy)
    if (m > MAX_SHIFT) {
      dx *= MAX_SHIFT / m
      dy *= MAX_SHIFT / m
    }
    const shrink = Math.max(-0.25, Math.min(0.3, rs.contraction * 0.32 * gain))
    const corners = roomCorners(room)
    const c = {
      x: corners.reduce((s, k) => s + REST[k].x, 0) / 4,
      y: corners.reduce((s, k) => s + REST[k].y, 0) / 4,
    }
    let rot = 0
    let breath = 0
    if (room.region === 'navel') {
      rot = ((rs.rotation ?? 0) * Math.PI) / 180 * 0.35 * gain
      breath = (rs.breath ?? 0) * 0.012
    }
    for (const k of corners) {
      const p = REST[k]
      let rx = p.x - c.x
      let ry = p.y - c.y
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      const tx = rx * cos - ry * sin
      const ty = rx * sin + ry * cos
      sum[k].x += dx + (tx - rx) - rx * shrink + rx * breath
      sum[k].y += dy + (ty - ry) - ry * shrink + ry * breath
      sum[k].n += 1
    }
  }
  return REST.map((p, k) => {
    const i = k % 4
    const j = Math.floor(k / 4)
    const outer = i === 0 || i === 3 || j === 0 || j === 3
    const w = outer ? 0.7 : 1
    const n = sum[k].n || 1
    let x = p.x + (sum[k].x / n) * w
    let y = p.y + (sum[k].y / n) * w
    if (ending?.kind === 'restored') {
      x += (IDEAL_PTS[k].x - p.x) * ending.k
      y += (IDEAL_PTS[k].y - p.y) * ending.k
    }
    return { x, y }
  })
}

// Per-room offset when the house comes apart (the awakened ending).
export function explodeOffset(room, k) {
  const cx = (XS[room.col] + XS[room.col + 1]) / 2 - CENTRE.x
  const cy = (YS[room.row] + YS[room.row + 1]) / 2 - CENTRE.y
  const d = Math.hypot(cx, cy) || 1
  const push = k * 1.8
  return { x: (cx / d) * push * (d > 1 ? 1 : 0), y: (cy / d) * push * (d > 1 ? 1 : 0), rot: k * ((room.col - 1) * 4 + (room.row - 1) * 3) }
}
