// Simple collision: the visitor is a circle on the floor plane; walls are boxes.
// Movement is applied one axis at a time and pushed back out of any wall it enters.

export const RADIUS = 0.32

function pushOut(p, boxes, r) {
  for (const b of boxes) {
    const hx = b.w / 2
    const hz = b.d / 2
    const nx = Math.max(b.x - hx, Math.min(p.x, b.x + hx))
    const nz = Math.max(b.z - hz, Math.min(p.z, b.z + hz))
    const dx = p.x - nx
    const dz = p.z - nz
    const d2 = dx * dx + dz * dz
    if (d2 >= r * r) continue
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2)
      p.x += (dx / d) * (r - d)
      p.z += (dz / d) * (r - d)
    } else {
      // centre inside the box: leave by the nearest face
      const ex = hx + r - Math.abs(p.x - b.x)
      const ez = hz + r - Math.abs(p.z - b.z)
      if (ex < ez) p.x += Math.sign(p.x - b.x || 1) * ex
      else p.z += Math.sign(p.z - b.z || 1) * ez
    }
  }
}

export function move(pos, dx, dz, boxes, r = RADIUS) {
  const near = boxes.filter((b) => Math.abs(b.x - pos.x) < b.w / 2 + 2 && Math.abs(b.z - pos.z) < b.d / 2 + 2)
  const p = { x: pos.x + dx, z: pos.z }
  pushOut(p, near, r)
  p.z += dz
  pushOut(p, near, r)
  return p
}
