// THE BLUE CIRCLE (player physics). Units are cells and seconds.
//
// Tilt is an acceleration, never a position: the circle speeds up gradually, rolls on, slows
// with friction and settles when the phone is level. Two outside forces act on it too:
//   air    the airflow in the house pushes it (it drifts downwind, speeds up in draughty passages)
//   light  sunlit floor is slippery: less friction, so it slides further and stops later
// Walls are thick slabs (capsules) of their own thickness; the circle is pushed out of any it overlaps and bounces off
// with a little of its speed. Each impact is reported with its strength (the speed into the wall).

function closestOnSegment(px, py, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L)) : 0
  return { x: a.x + dx * t, y: a.y + dy * t }
}

export const PLAYER_RADIUS = 0.2
export const MAX_SPEED = 4.2 // cells per second
export const ACCEL = 11 // cells per second² at full tilt
// windForce = local airflow direction × local airflow strength × exposure (the ball is fully exposed)
export const AIR_PUSH = 18 // cells per second² per unit of air velocity
export const AIR_MAX = 8 // the strongest push: less than full tilt (11), so it can always be fought
const DAMPING = 1.5 // per second, on bare floor
const ROLLING_STOP = 1.4 // extra slowing (cells/s²) when there is no tilt, so it settles
const SUN_SLIP = 0.7 // how much of that grip full sunlight takes away
const RESTITUTION = 0.32
const IMPACT_MIN = 0.35 // slower than this is a touch, not a collision
const SUBSTEP = 1 / 240

export function createPlayer(c, r) {
  return { x: c + 0.5, y: r + 0.5, vx: 0, vy: 0, r: PLAYER_RADIUS, contactUntil: {} }
}

// One frame. accel: { x, y } in -1..1 (filtered tilt). geometry: { segments: [...] }.
// env: { air: {x, y}, light: 0..1 } at the player. Returns the impacts.
export function stepPlayer(player, accel, dt, segments, { sensitivity = 1, time = 0, air = { x: 0, y: 0 }, light = 0 } = {}) {
  const impacts = []
  let remaining = Math.min(dt, 0.05)
  const grip = 1 - SUN_SLIP * Math.min(1, light)
  while (remaining > 1e-6) {
    const h = Math.min(SUBSTEP, remaining)
    remaining -= h
    const ax = accel.x * ACCEL * sensitivity
    const ay = accel.y * ACCEL * sensitivity
    let wx = air.x * AIR_PUSH
    let wy = air.y * AIR_PUSH
    const wm = Math.hypot(wx, wy)
    if (wm > AIR_MAX) {
      wx *= AIR_MAX / wm
      wy *= AIR_MAX / wm
    }
    player.vx += (ax + wx) * h
    player.vy += (ay + wy) * h
    const damp = Math.exp(-DAMPING * grip * h)
    player.vx *= damp
    player.vy *= damp
    let speed = Math.hypot(player.vx, player.vy)
    if (Math.hypot(ax, ay) < 1e-3 && speed > 0) {
      const slowed = Math.max(0, speed - ROLLING_STOP * grip * h)
      player.vx *= slowed / speed
      player.vy *= slowed / speed
      speed = slowed
    }
    if (speed > MAX_SPEED) {
      player.vx *= MAX_SPEED / speed
      player.vy *= MAX_SPEED / speed
    }
    player.x += player.vx * h
    player.y += player.vy * h
    collide(player, segments, impacts, time)
  }
  return impacts
}

export function collide(player, segments, impacts = [], time = 0) {
  let overlapping = false
  for (let pass = 0; pass < 3; pass++) {
    let hit = false
    for (const s of segments) {
      const q = closestOnSegment(player.x, player.y, s.a, s.b)
      const dx = player.x - q.x
      const dy = player.y - q.y
      const d = Math.hypot(dx, dy)
      const min = PLAYER_RADIUS + s.r
      if (d >= min) continue
      hit = true
      const nx = d > 1e-6 ? dx / d : 0
      const ny = d > 1e-6 ? dy / d : -1
      player.x = q.x + nx * min
      player.y = q.y + ny * min
      const vn = player.vx * nx + player.vy * ny
      if (vn < 0) {
        player.vx -= (1 + RESTITUTION) * vn * nx
        player.vy -= (1 + RESTITUTION) * vn * ny
        player.vx *= 0.94
        player.vy *= 0.94
        const speed = -vn
        const key = s.key
        const last = player.contactUntil[key] ?? -1
        if (speed > IMPACT_MIN && time > last) impacts.push({ x: q.x, y: q.y, speed, key, kind: s.kind ?? 'wall', wall: s.wall ?? null })
        player.contactUntil[key] = time + 0.15
      }
    }
    overlapping = hit
    if (!hit) break
  }
  return overlapping
}

// Is the circle overlapping anything solid right now (squeezed)?
export function overlapping(player, segments, slack = 0.02) {
  for (const s of segments) {
    const q = closestOnSegment(player.x, player.y, s.a, s.b)
    if (Math.hypot(player.x - q.x, player.y - q.y) < PLAYER_RADIUS + s.r - slack) return true
  }
  return false
}
