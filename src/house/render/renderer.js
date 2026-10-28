// DRAWING THE SLEEPING ARCHITECTURE — Canvas 2D.
//
// After the reference plans: a thick white shell, thinner partitions, each a slab with a grey
// side and a cast shadow; beneath, a faint translucent body that breathes; a grid of small squares
// (a "gradient grid") that shows his body and, in deep red, where it has been disturbed. The wind
// is drawn as dotted lines that bend around the building and filter in at windows; the sun as an
// orange dotted trajectory. The palette stays the interface's: black, white, blue, orange, with
// deep red only for disturbance.

import { COLS, ROWS, SHELL_T, wallEnds } from '../world/house.js'
import { LIGHT_RES } from '../world/environment.js'
import { PLAYER_RADIUS } from '../world/physics.js'

export const COLORS = {
  bg: '#09090b',
  ink: '#f2f0ea',
  inkDim: '#8f8c85',
  side: '#3a3936',
  orange: '#ff5b3a',
  blue: '#2a6bff',
  blueGlow: 'rgba(42, 107, 255, 0.28)',
  runner: '#ffd23a', // the runner's body: yellow, to read against white walls and black floor
  deepRed: '214, 34, 40',
  body: '255, 196, 168',
  wind: '196, 222, 255',
}
const MARGIN = 0.25
const FONT = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
const WALL_H = 0.22
const DEPTH = { x: -0.18, y: -0.45 } // a unit of height, on screen (oblique view)
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

function hull(points) {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

// a slab's footprint; shell walls run on past their ends so corners meet cleanly
// a stable number for a wall (its id is a string), for jitter and crack patterns
const seedOf = (w) => w.seed ?? (w.seed = [...String(w.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7))

function slab(w, pose = w, extra = 0) {
  const ax = Math.cos(pose.a)
  const ay = Math.sin(pose.a)
  const hl = w.len / 2 + extra
  const ht = w.thick / 2
  return [
    { x: pose.x - ax * hl - ay * ht, y: pose.y - ay * hl + ax * ht },
    { x: pose.x + ax * hl - ay * ht, y: pose.y + ay * hl + ax * ht },
    { x: pose.x + ax * hl + ay * ht, y: pose.y + ay * hl - ax * ht },
    { x: pose.x - ax * hl + ay * ht, y: pose.y - ay * hl - ax * ht },
  ]
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.reducedMotion = false
    this.showGrid = 0 // 0..1, raised during disturbance, transformation and inspection
    this.lightCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    this.lightVersion = -1
    this.flows = Array.from({ length: 110 }, () => ({ x: Math.random() * COLS, y: Math.random() * ROWS, trail: [], life: Math.random(), seed: Math.random() }))
    this.drift = Array.from({ length: 160 }, () => ({ x: Math.random() * COLS, y: Math.random() * ROWS, trail: [], life: Math.random() }))
    this.t = 0
    this.resize()
  }

  resize() {
    const c = this.canvas
    const rect = c.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    this.w = Math.max(1, rect.width)
    this.h = Math.max(1, rect.height)
    c.width = Math.round(this.w * dpr)
    c.height = Math.round(this.h * dpr)
    this.dpr = dpr
    this.cell = Math.min(this.w / (COLS + 2 * MARGIN), this.h / (ROWS + 2 * MARGIN))
    this.ox = (this.w - COLS * this.cell) / 2
    this.oy = (this.h - ROWS * this.cell) / 2
  }

  X(x) {
    return this.ox + x * this.cell
  }

  Y(y) {
    return this.oy + y * this.cell
  }

  poly(pts) {
    const ctx = this.ctx
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(this.X(p.x), this.Y(p.y)) : ctx.moveTo(this.X(p.x), this.Y(p.y))))
    ctx.closePath()
  }

  line(a, b) {
    this.ctx.beginPath()
    this.ctx.moveTo(this.X(a.x), this.Y(a.y))
    this.ctx.lineTo(this.X(b.x), this.Y(b.y))
    this.ctx.stroke()
  }

  draw(game, fx, time, dt = 1 / 60) {
    const ctx = this.ctx
    this.t += dt
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, this.w, this.h)
    // while he dreams the whole scene sways, very slightly (a dream's distortion)
    const sway = game.dream && !this.reducedMotion ? Math.min(1, game.dream.fog * 1.4) : 0
    if (sway > 0.01) {
      const cx = this.w / 2
      const cy = this.h / 2
      ctx.translate(cx, cy)
      ctx.rotate(Math.sin(this.t * 0.37) * 0.006 * sway)
      ctx.scale(1 + Math.sin(this.t * 0.23) * 0.006 * sway, 1 + Math.cos(this.t * 0.29) * 0.006 * sway)
      ctx.translate(-cx, -cy)
    }
    const house = game.house
    // the grid shows itself when something happens, and fades back to almost nothing
    const wanted = Math.max(fx.inspect ? 1 : 0, game.tx.state !== 'IDLE' ? 0.8 : 0, clamp(game.agent.s.arousal * 1.2))
    this.showGrid += (wanted - this.showGrid) * Math.min(1, dt * 2)

    // ground: open ground a shade lighter; the house floor; the courtyard open to the sky
    ctx.fillStyle = '#111114'
    ctx.fillRect(this.X(0), this.Y(0), COLS * this.cell, ROWS * this.cell)
    // the floor, bay by bay from the plan (the courtyard, open to the sky, a shade lighter)
    for (const b of house.bays()) {
      if (!b.room) continue
      ctx.fillStyle = b.type === 'court' ? '#121216' : '#0b0b0e'
      ctx.fillRect(this.X(b.x0) - 0.5, this.Y(b.y0) - 0.5, (b.x1 - b.x0) * this.cell + 1, (b.y1 - b.y0) * this.cell + 1)
    }
    this.drawLight(game.env)
    this.drawBody(game, time)
    this.drawGrid(game, time)
    this.drawWind(game, dt)
    this.drawAir(game, dt)
    this.drawShadows(game)
    if (game.stageDef.id === 'question') this.drawNiches(game, time)
    this.drawWalls(game, time)
    this.drawDoorways(game)
    this.drawDoors(game)
    this.drawRipples(fx.ripples, time)
    if (fx.ghost) this.drawGhost(fx.ghost)
    this.drawSleep(game, fx, time, dt)
    this.drawHypnosis(game, fx, time)
    if (game.dream) this.drawFog(game, time, dt)
    if (game.dream) this.drawAnchor(game, fx, time)
    this.drawPlayer(game, fx, time, dt)
    if (game.dream) this.drawDreamCloud(game, time, dt)
    this.drawSun(game)
    this.drawLegend(game.env)

    const s = this.cell
    if (game.holding) {
      const pulse = this.reducedMotion ? 0.75 : 0.55 + 0.35 * Math.sin(time * 4)
      ctx.strokeStyle = `rgba(255, 91, 58, ${pulse})`
      ctx.lineWidth = 2
      ctx.strokeRect(this.X(0) + 1, this.Y(0) + 1, COLS * s - 2, ROWS * s - 2)
    }
    if (fx.hapticAt && time - fx.hapticAt < 0.35) {
      const k = 1 - (time - fx.hapticAt) / 0.35
      ctx.strokeStyle = `rgba(242, 240, 234, ${0.4 * k})`
      ctx.lineWidth = 1
      const pad = 3 + (1 - k) * 4
      ctx.strokeRect(this.X(0) - pad, this.Y(0) - pad, COLS * s + 2 * pad, ROWS * s + 2 * pad)
    }
  }

  // ---------- light ----------

  drawLight(env) {
    const lc = this.lightCanvas
    if (!lc) return
    const W = COLS * LIGHT_RES
    const H = ROWS * LIGHT_RES
    if (this.lightVersion !== env.version) {
      this.lightVersion = env.version
      lc.width = W
      lc.height = H
      const lctx = lc.getContext('2d')
      const img = lctx.createImageData(W, H)
      for (let i = 0; i < W * H; i++) {
        // warm light, as in the solar-impact diagram
        img.data[i * 4] = 255
        img.data[i * 4 + 1] = 226
        img.data[i * 4 + 2] = 196
        img.data[i * 4 + 3] = Math.round(clamp(env.light[i]) * 30)
      }
      lctx.putImageData(img, 0, 0)
    }
    const ctx = this.ctx
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(lc, this.X(0), this.Y(0), COLS * this.cell, ROWS * this.cell)
    ctx.restore()
  }

  // ---------- his body ----------

  drawBody(game, time) {
    const ctx = this.ctx
    const body = game.body
    const s = this.cell
    const glow = body.glow
    ctx.save()
    ctx.lineCap = 'round'
    // three soft passes: a translucent, slightly irregular silhouette that breathes
    const passes = [
      [1.45, 0.022],
      [1.18, 0.035],
      [0.95, 0.05],
    ]
    for (const [k, a] of passes) {
      ctx.strokeStyle = `rgba(${COLORS.body}, ${a})`
      for (const [id, f] of Object.entries(body.frames)) {
        if (id === 'head') continue
        const wob = this.reducedMotion ? 1 : 1 + 0.05 * Math.sin(time * 0.7 + id.length * 1.7)
        ctx.lineWidth = Math.max(2, f.hw * 2 * s * k * wob)
        this.line(f.a, f.b)
      }
      const h = body.frames.head
      ctx.fillStyle = `rgba(${COLORS.body}, ${a})`
      ctx.beginPath()
      ctx.arc(this.X((h.a.x + h.b.x) / 2), this.Y((h.a.y + h.b.y) / 2), h.hw * s * 1.2 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    // under hypnosis his shape is traced in a thin pale line, so the posture he takes for the
    // object can be read; it fades a few seconds after he settles
    const hp = game.hypno?.phase
    const want = game.trance || hp === 'interpreting' || hp === 'deciding' ? 1 : 0
    this.trace = (this.trace ?? 0) + (want - (this.trace ?? 0)) * (want ? 0.05 : 0.012)
    if (this.trace > 0.02) {
      ctx.strokeStyle = `rgba(${COLORS.wind}, ${0.55 * this.trace})`
      ctx.lineWidth = 1.5
      for (const [id, f] of Object.entries(body.frames)) if (id !== 'head') this.line(f.a, f.b)
      const hd = body.frames.head
      ctx.beginPath()
      ctx.arc(this.X((hd.a.x + hd.b.x) / 2), this.Y((hd.a.y + hd.b.y) / 2), hd.hw * s * 1.1, 0, Math.PI * 2)
      ctx.stroke()
    }
    // a disturbed region glows deep red, fading slowly
    for (const [id, f] of Object.entries(body.frames)) {
      const g = glow[f.region] ?? 0
      if (g < 0.02) continue
      ctx.strokeStyle = `rgba(${COLORS.deepRed}, ${0.32 * clamp(g)})`
      ctx.lineWidth = Math.max(2, f.hw * 2 * s * 1.25)
      if (id === 'head') {
        ctx.fillStyle = `rgba(${COLORS.deepRed}, ${0.32 * clamp(g)})`
        ctx.beginPath()
        ctx.arc(this.X((f.a.x + f.b.x) / 2), this.Y((f.a.y + f.b.y) / 2), f.hw * s * 1.4, 0, Math.PI * 2)
        ctx.fill()
      } else this.line(f.a, f.b)
    }
    ctx.restore()
  }

  // The body grid: small squares at every cell, sized by how much of him lies there and how
  // disturbed it is (after the "safe gradient" reference). Soft red pools where it hurts.
  drawGrid(game, time) {
    const ctx = this.ctx
    const body = game.body
    const s = this.cell
    const show = this.showGrid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c
        const d = clamp(body.disturb[i])
        const w = body.weight[i]
        const x = this.X(c + 0.5)
        const y = this.Y(r + 0.5)
        if (d > 0.04) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.95)
          g.addColorStop(0, `rgba(${COLORS.deepRed}, ${0.3 * d})`)
          g.addColorStop(1, `rgba(${COLORS.deepRed}, 0)`)
          ctx.fillStyle = g
          ctx.fillRect(x - s, y - s, 2 * s, 2 * s)
        }
        const size = s * (0.035 + 0.07 * w + 0.16 * d) * (1 + (this.reducedMotion ? 0 : 0.08 * Math.sin(time * 2 + i)) * d)
        if (d > 0.04) ctx.fillStyle = `rgba(${COLORS.deepRed}, ${0.35 + 0.55 * d})`
        else if (w > 0.05) ctx.fillStyle = `rgba(${COLORS.body}, ${(0.07 + 0.25 * show) * w})`
        else ctx.fillStyle = `rgba(242, 240, 234, ${0.03 + 0.08 * show})`
        ctx.fillRect(x - size / 2, y - size / 2, size, size)
      }
    }
  }

  // ---------- wind ----------

  // Outside: fast, layered streaks of the constant wind; they bend around the building, turn
  // turbulent at its corners, and pour in where a window faces them.
  drawWind(game, dt) {
    const ctx = this.ctx
    const env = game.env
    const house = game.house
    const W = env.windDir
    const base = 2.4 + env.wind.strength * 2.6
    const corners = house.outline
    ctx.lineCap = 'round'
    for (const p of this.flows) {
      if (!this.reducedMotion) {
        let vx = W.x
        let vy = W.y
        const ahead = { x: p.x + vx * 0.45, y: p.y + vy * 0.45 }
        if (house.inside(ahead.x, ahead.y)) {
          // slide along the facade: the component into the wall is turned aside
          const cx = COLS / 2
          const cy = ROWS / 2
          const t = { x: -(p.y - cy), y: p.x - cx }
          const tl = Math.hypot(t.x, t.y) || 1
          const sgn = t.x * W.x + t.y * W.y >= 0 ? 1 : -1
          vx = vx * 0.25 + (t.x / tl) * sgn * 0.9
          vy = vy * 0.25 + (t.y / tl) * sgn * 0.9
          p.turb = Math.min(1, (p.turb ?? 0) + dt * 3)
        }
        // corners shed turbulence
        for (const c of corners) if (Math.hypot(p.x - c.x, p.y - c.y) < 0.7) p.turb = Math.min(1, (p.turb ?? 0) + dt * 4)
        p.turb = Math.max(0, (p.turb ?? 0) - dt * 0.8)
        const wob = p.turb * Math.sin(this.t * 9 + p.seed * 13) * 0.9
        const sp = base * (0.8 + p.seed * 0.5)
        p.x += (vx - vy * wob) * sp * dt
        p.y += (vy + vx * wob) * sp * dt
        p.life -= dt * 0.18
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 7) p.trail.shift()
      }
      const gone = p.life <= 0 || p.x < -0.8 || p.y < -0.8 || p.x > COLS + 0.8 || p.y > ROWS + 0.8 || house.inside(p.x, p.y)
      if (gone) {
        p.life = 1
        p.trail = []
        p.seed = Math.random()
        if (Math.abs(W.x) > Math.abs(W.y)) {
          p.x = W.x > 0 ? -0.5 : COLS + 0.5
          p.y = Math.random() * ROWS
        } else {
          p.y = W.y > 0 ? -0.5 : ROWS + 0.5
          p.x = Math.random() * COLS
        }
        continue
      }
      if (p.trail.length < 2) continue
      // near layer brighter and thicker, far layer faint
      const near = p.seed > 0.55
      const a = (near ? 0.42 : 0.2) * Math.min(1, env.wind.strength) * Math.sin(Math.PI * clamp(p.life))
      ctx.strokeStyle = `rgba(${COLORS.wind}, ${a})`
      ctx.lineWidth = near ? 1.4 : 0.8
      ctx.beginPath()
      p.trail.forEach((q, i) => (i ? ctx.lineTo(this.X(q.x), this.Y(q.y)) : ctx.moveTo(this.X(q.x), this.Y(q.y))))
      ctx.stroke()
    }
  }

  // Inside: the air that got in. Dense where it enters, streaks lengthening as it speeds up in
  // narrow passages, small eddies at wall ends; an orange chevron on each window taking wind in.
  drawAir(game, dt) {
    const ctx = this.ctx
    const env = game.env
    const s = this.cell
    const ins = env.windows.filter((w) => w.inflow > 0.03 && w.outside)
    for (const w of ins) {
      // filtration: a pale tongue of air into the room
      const cx = this.X(w.x - w.outside.x * 0.8)
      const cy = this.Y(w.y - w.outside.y * 0.8)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * (0.9 + w.inflow))
      g.addColorStop(0, `rgba(${COLORS.wind}, ${0.16 * clamp(w.inflow * 1.4)})`)
      g.addColorStop(1, `rgba(${COLORS.wind}, 0)`)
      ctx.fillStyle = g
      ctx.fillRect(cx - s * 2.2, cy - s * 2.2, s * 4.4, s * 4.4)
      // chevron: which way it blows in
      const ix = -w.outside.x
      const iy = -w.outside.y
      const px = -iy
      const py = ix
      const mx = w.x + ix * 0.35
      const my = w.y + iy * 0.35
      ctx.strokeStyle = `rgba(255, 91, 58, ${0.4 + 0.5 * clamp(w.inflow)})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(this.X(mx - ix * 0.12 + px * 0.14), this.Y(my - iy * 0.12 + py * 0.14))
      ctx.lineTo(this.X(mx + ix * 0.08), this.Y(my + iy * 0.08))
      ctx.lineTo(this.X(mx - ix * 0.12 - px * 0.14), this.Y(my - iy * 0.12 - py * 0.14))
      ctx.stroke()
    }
    const ends = []
    for (const w of game.house.walls) if (w.kind === 'interior') ends.push(...Object.values(wallEnds(w)))
    ctx.lineCap = 'round'
    for (const p of this.drift) {
      const v = env.airAt(p.x, p.y)
      const m = Math.hypot(v.x, v.y)
      if (!this.reducedMotion) {
        let vx = v.x
        let vy = v.y
        // eddies: air brushing past a wall end curls around it for a moment
        if (m > 0.12) for (const e of ends) {
          const dx = p.x - e.x
          const dy = p.y - e.y
          const d = Math.hypot(dx, dy)
          if (d < 0.45 && d > 0.05) {
            vx += (-dy / d) * m * 0.9
            vy += (dx / d) * m * 0.9
          }
        }
        p.x += vx * 3.2 * dt
        p.y += vy * 3.2 * dt
        p.life -= dt * (0.3 + (m < 0.03 ? 1.2 : 0))
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 6) p.trail.shift()
      }
      if (p.life <= 0 || !game.house.inside(p.x, p.y)) {
        // most new air comes in at the windows that face the wind
        if (ins.length && Math.random() < 0.85) {
          const w = ins[Math.floor(Math.random() * ins.length)]
          const along = (Math.random() - 0.5) * w.width
          p.x = w.x - w.outside.x * (0.25 + Math.random() * 0.3) + (w.b.x - w.a.x) / (Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1) * along
          p.y = w.y - w.outside.y * (0.25 + Math.random() * 0.3) + (w.b.y - w.a.y) / (Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1) * along
        } else {
          p.x = Math.random() * COLS
          p.y = Math.random() * ROWS
        }
        p.life = 1
        p.trail = []
        continue
      }
      if (m < 0.04 || p.trail.length < 2) continue
      const a = clamp(m * 1.6) * 0.75 * Math.sin(Math.PI * clamp(p.life))
      ctx.strokeStyle = `rgba(${COLORS.wind}, ${a})`
      ctx.lineWidth = 0.8 + clamp(m * 2) * 1.2
      ctx.beginPath()
      p.trail.forEach((q, i) => (i ? ctx.lineTo(this.X(q.x), this.Y(q.y)) : ctx.moveTo(this.X(q.x), this.Y(q.y))))
      ctx.stroke()
    }
  }

  // ---------- walls ----------

  drawShadows(game) {
    const env = game.env
    if (!env.sunOn) return
    const ctx = this.ctx
    const S = env.sunDir
    const len = (1 / Math.tan((env.sun.elevation * Math.PI) / 180)) * WALL_H * 1.6
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    for (const w of game.house.walls) {
      if ((w.kind === 'rule' && game.house.ruleBroken) || w.kind === 'glass') continue
      const base = slab(w, w, w.kind === 'shell' || w.kind === 'panel' ? w.thick / 2 : 0)
      const lift = w.lifted ? 0.35 : (w.float ?? 0) * 0.6
      const off = base.map((q) => ({ x: q.x + S.x * lift, y: q.y + S.y * lift }))
      const tip = off.map((q) => ({ x: q.x + S.x * len, y: q.y + S.y * len }))
      this.poly(hull(lift ? [...off, ...tip] : [...base, ...tip]))
      ctx.fill()
    }
  }

  drawWalls(game, time) {
    const ctx = this.ctx
    const house = game.house
    const unbound = game.agent.unbound
    const walls = house.walls.slice().sort((a, b) => (a.lifted ? 1 : 0) - (b.lifted ? 1 : 0) || a.y - b.y)
    for (const w of walls) {
      // a window: the opening in the exterior wall with its glazing, at floor level
      if (w.kind === 'glass') {
        this.windowMark({ ...w, thick: SHELL_T }, w.windows[0], w, game)
        continue
      }
      const broken = w.kind === 'rule' && house.ruleBroken
      let jx = 0
      let jy = 0
      // restless walls shiver a little near the last disturbance
      const f = game.agent.focus
      const ar = game.agent.s.arousal
      // each disturbance that counts against the player leaves the partitions a little more uneasy
      const irk = game.irk?.count ?? 0
      if (f && !this.reducedMotion && (ar > 0.45 || irk > 0) && w.kind === 'interior') {
        const amp = clamp(1 - Math.hypot(w.x - f.x, w.y - f.y) / (2.5 + irk)) * (Math.max(0, ar - 0.45) * 0.025 + irk * 0.006)
        jx = Math.sin(time * 41 + seedOf(w)) * amp
        jy = Math.cos(time * 37 + seedOf(w)) * amp
      }
      const heavy = w.kind === 'shell' || w.kind === 'panel'
      const H = (broken ? 0.04 : WALL_H * (heavy ? 1.25 : 1)) * (1 + 0.15 * ar) + (w.lifted ? 0.4 : (w.float ?? 0) * 0.5)
      const q = { x: w.x + jx, y: w.y + jy, a: w.a }
      const base = slab(w, q, heavy ? w.thick / 2 : 0)
      const lift = w.lifted ? 0.4 : (w.float ?? 0) * 0.5
      const b = base.map((c) => ({ x: c.x + DEPTH.x * lift, y: c.y + DEPTH.y * lift }))
      const top = base.map((c) => ({ x: c.x + DEPTH.x * H, y: c.y + DEPTH.y * H }))
      ctx.fillStyle = COLORS.side
      this.poly(hull([...b, ...top]))
      ctx.fill()
      const struck = time - (w.struckAt ?? -9) < 0.3 || game.time - w.struck < 0.3
      ctx.fillStyle = struck ? `rgb(${COLORS.deepRed})` : broken ? COLORS.inkDim : unbound || game.system === 'interrupted' ? COLORS.inkDim : COLORS.ink
      this.poly(top)
      ctx.fill()
      const topC = { x: q.x + DEPTH.x * H, y: q.y + DEPTH.y * H, a: w.a }
      if (w.kind === 'rule' && !broken) this.hatch(w, topC)
      if (broken) this.cracks(w, topC)
      for (const win of w.windows) this.windowMark(w, win, topC, game)
    }
  }

  hatch(w, c) {
    const ctx = this.ctx
    ctx.save()
    this.poly(slab(w, c))
    ctx.clip()
    ctx.strokeStyle = COLORS.orange
    ctx.lineWidth = 1.2
    const ax = Math.cos(c.a)
    const ay = Math.sin(c.a)
    const n = Math.ceil(w.len * 8)
    for (let i = -n; i <= n; i++) {
      const o = (i / n) * (w.len / 2)
      this.line({ x: c.x + ax * o - 0.14, y: c.y + ay * o - 0.14 }, { x: c.x + ax * o + 0.14, y: c.y + ay * o + 0.14 })
    }
    ctx.restore()
  }

  cracks(w, c) {
    const ctx = this.ctx
    ctx.strokeStyle = COLORS.bg
    ctx.lineWidth = 1
    const ax = Math.cos(c.a)
    const ay = Math.sin(c.a)
    const L = w.len / 2
    ctx.beginPath()
    ctx.moveTo(this.X(c.x - ax * L), this.Y(c.y - ay * L))
    for (let i = 1; i <= 10; i++) {
      const k = -L + (2 * L * i) / 10
      const off = Math.sin(seedOf(w) * 7 + i * 3) * 0.06
      ctx.lineTo(this.X(c.x + ax * k - ay * off), this.Y(c.y + ay * k + ax * off))
    }
    ctx.stroke()
  }

  // a window in its wall: the opening, with three thin lines of glazing (as in the unit plan)
  windowMark(w, win, c, game) {
    const ctx = this.ctx
    const ax = Math.cos(c.a)
    const ay = Math.sin(c.a)
    const off = (win.at - 0.5) * w.len
    const p = { x: c.x + ax * off, y: c.y + ay * off, a: c.a }
    this.poly(slab({ len: win.width, thick: w.thick * 0.98 }, p))
    ctx.fillStyle = COLORS.bg
    ctx.fill()
    ctx.strokeStyle = COLORS.ink
    ctx.lineWidth = 0.7
    const hw = win.width / 2
    for (const k of [-0.3, 0, 0.3]) {
      const nx = -ay * w.thick * k
      const ny = ax * w.thick * k
      this.line({ x: p.x - ax * hw + nx, y: p.y - ay * hw + ny }, { x: p.x + ax * hw + nx, y: p.y + ay * hw + ny })
    }
    const info = game.env.windows.find((x) => x.kind === 'window' && Math.hypot(x.x - (w.x + Math.cos(w.a) * off), x.y - (w.y + Math.sin(w.a) * off)) < 0.2)
    if (info && info.inflow > 0.05) {
      ctx.fillStyle = `rgba(255, 91, 58, ${clamp(info.inflow * 1.4)})`
      ctx.beginPath()
      ctx.arc(this.X(p.x), this.Y(p.y), Math.max(1.5, this.cell * 0.05), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // doors between rooms: the opening in the partition, its leaf and swing (as in the plans)
  drawDoorways(game) {
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(242, 240, 234, 0.45)'
    for (const d of game.house.doorways ?? []) {
      const L = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
      const along = { x: (d.b.x - d.a.x) / L, y: (d.b.y - d.a.y) / L }
      // the leaf opens into the side the door belongs to (alternating, as drawn)
      const sgn = seedOf(d) % 2 ? 1 : -1
      const n = { x: -along.y * sgn, y: along.x * sgn }
      ctx.lineWidth = 1
      this.line(d.a, { x: d.a.x + n.x * L * 0.9, y: d.a.y + n.y * L * 0.9 })
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 0.7
      ctx.beginPath()
      const a0 = Math.atan2(n.y, n.x)
      const a1 = Math.atan2(along.y, along.x)
      let dd = a1 - a0
      while (dd > Math.PI) dd -= 2 * Math.PI
      while (dd < -Math.PI) dd += 2 * Math.PI
      ctx.arc(this.X(d.a.x), this.Y(d.a.y), L * 0.9 * this.cell, a0, a0 + dd, dd < 0)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // doors: an opening in the shell, its leaf and swing (as in the plans); shut, the leaf closes it
  drawDoors(game) {
    const ctx = this.ctx
    for (const d of game.house.doors) {
      const inward = { x: -d.out.x, y: -d.out.y }
      const hinge = d.a
      const latch = d.b
      const sealed = d.id === 'sealed' && game.system !== 'interrupted'
      ctx.strokeStyle = COLORS.ink
      if (!d.open) {
        ctx.lineWidth = Math.max(2, SHELL_T * this.cell * 0.4)
        this.line(hinge, latch)
      } else if (!sealed) {
        const L = Math.hypot(latch.x - hinge.x, latch.y - hinge.y) * 0.95
        ctx.lineWidth = 1.4
        this.line(hinge, { x: hinge.x + inward.x * L, y: hinge.y + inward.y * L })
        ctx.setLineDash([2, 3])
        ctx.lineWidth = 0.8
        ctx.beginPath()
        const a0 = Math.atan2(inward.y, inward.x)
        const a1 = Math.atan2(latch.y - hinge.y, latch.x - hinge.x)
        let dd = a1 - a0
        while (dd > Math.PI) dd -= 2 * Math.PI
        while (dd < -Math.PI) dd += 2 * Math.PI
        ctx.arc(this.X(hinge.x), this.Y(hinge.y), L * this.cell, a0, a0 + dd, dd < 0)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.fillStyle = 'rgba(242, 240, 234, 0.6)'
      ctx.font = `${Math.max(8, this.cell * 0.2)}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.save()
      ctx.translate(this.X(d.mid.x + d.out.x * 0.35), this.Y(d.mid.y + d.out.y * 0.35))
      if (Math.abs(d.out.x) > 0.5) ctx.rotate(d.out.x > 0 ? Math.PI / 2 : -Math.PI / 2)
      ctx.fillText(sealed ? 'SEALED' : d.open ? 'EXIT' : 'SHUT', 0, 0)
      ctx.restore()
    }
  }

  drawNiches(game, time) {
    if (game.system !== 'running' && game.system !== 'restoring') return
    const ctx = this.ctx
    const s = this.cell
    for (const n of game.niches) {
      const done = n.order < game.nicheNext
      const next = n.order === game.nicheNext
      const x = this.X(n.x)
      const y = this.Y(n.y)
      const h = s * 0.24
      ctx.strokeStyle = `rgba(242, 240, 234, ${next ? 0.55 + 0.3 * Math.sin(time * 3) : done ? 0.8 : 0.35})`
      ctx.lineWidth = 1
      ctx.strokeRect(x - h, y - h, 2 * h, 2 * h)
      if (done) {
        ctx.fillStyle = 'rgba(242, 240, 234, 0.18)'
        ctx.fillRect(x - h, y - h, 2 * h, 2 * h)
      }
      ctx.fillStyle = `rgba(242, 240, 234, ${done ? 0.9 : 0.6})`
      ctx.font = `${Math.max(9, s * 0.24)}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(n.order), x, y + 0.5)
    }
  }

  // ---------- the rest ----------

  drawRipples(ripples, time) {
    const ctx = this.ctx
    for (const r of ripples) {
      const k = (time - r.t) / r.dur
      if (k < 0 || k > 1) continue
      ctx.strokeStyle = r.strong ? `rgba(${COLORS.deepRed}, ${1 - k})` : `rgba(242, 240, 234, ${0.8 * (1 - k)})`
      ctx.lineWidth = r.strong ? 1.6 : 1
      ctx.beginPath()
      ctx.arc(this.X(r.x), this.Y(r.y), Math.max(1, r.size * k * this.cell), 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  drawGhost(ghost) {
    const ctx = this.ctx
    const pts = ghost.points
    const i = Math.min(pts.length - 1, Math.floor(ghost.t / 0.05))
    if (i < 0 || !pts.length) return
    ctx.strokeStyle = 'rgba(42, 107, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    const j0 = Math.max(0, i - 40)
    for (let j = j0; j <= i; j++) (j === j0 ? ctx.moveTo : ctx.lineTo).call(ctx, this.X(pts[j].x), this.Y(pts[j].y))
    ctx.stroke()
    ctx.fillStyle = COLORS.blue
    ctx.beginPath()
    ctx.arc(this.X(pts[i].x), this.Y(pts[i].y), PLAYER_RADIUS * this.cell, 0, Math.PI * 2)
    ctx.fill()
  }

  // The player: an abstract runner seen from directly above. A round electric-blue head, a short
  // rounded yellow body across the shoulders, small arms and legs that swing in a running cycle.
  // It faces where it is going (and keeps that heading when it stops or is carried), leans into
  // its run, and leans and staggers against a strong draught. Only the round collision circle
  // underneath (PLAYER_RADIUS) is solid; limbs and glow are drawing only.
  drawPlayer(game, fx, time, dt) {
    if (fx.hidePlayer) return
    const ctx = this.ctx
    const p = game.player
    const s = this.cell * 1.3 // drawn a little larger than its collision circle, to read on a phone
    const R = (this.runner ??= { heading: -Math.PI / 2, phase: 0, run: 0 })
    const speed = Math.hypot(p.vx, p.vy)
    if (speed > 0.12) {
      let d = Math.atan2(p.vy, p.vx) - R.heading
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      R.heading += d * Math.min(1, dt * 10)
    }
    R.run += (clamp(speed / 2.4) - R.run) * Math.min(1, dt * 6)
    if (!this.reducedMotion) R.phase += dt * (3 + speed * 4.2)
    const air = game.env.airAt(p.x, p.y)
    const am = Math.hypot(air.x, air.y)
    const fwd = { x: Math.cos(R.heading), y: Math.sin(R.heading) }
    // the head leans into the run, and upwind against a strong draught (with a little stagger)
    const struggle = clamp((am - 0.2) * 2.5)
    const jitter = this.reducedMotion ? 0 : Math.sin(time * 23) * 0.012 * struggle
    const lean = {
      x: fwd.x * 0.05 * R.run - (am ? (air.x / am) * 0.06 * struggle : 0) + jitter,
      y: fwd.y * 0.05 * R.run - (am ? (air.y / am) * 0.06 * struggle : 0) + jitter,
    }
    const x = this.X(p.x)
    const y = this.Y(p.y)
    ctx.save()
    if (game.carry?.fade) ctx.globalAlpha = Math.abs(1 - 2 * clamp(game.carry.t))
    // a small soft shadow on the floor
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.beginPath()
    ctx.ellipse(x + s * 0.03, y + s * 0.05, s * 0.19, s * 0.15, R.heading, 0, Math.PI * 2)
    ctx.fill()
    ctx.translate(x, y)
    ctx.rotate(R.heading)
    // local frame: +x forward, +y to the right
    const swing = Math.sin(R.phase) * R.run
    const crouch = 1 - 0.12 * (1 - R.run) // standing still, a little gathered
    const limb = (x0, y0, x1, y1, w, color) => {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1.5, w * s)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x0 * s, y0 * s)
      ctx.lineTo(x1 * s, y1 * s)
      ctx.stroke()
    }
    // legs: from the hips, stepping forward and back in turn
    const legC = 'rgba(214, 170, 30, 0.95)'
    limb(-0.02, -0.055, -0.02 + 0.13 * swing, -0.06, 0.055, legC)
    limb(-0.02, 0.055, -0.02 - 0.13 * swing, 0.06, 0.055, legC)
    // arms: from the shoulders, opposite to the legs
    const armC = 'rgba(255, 214, 64, 0.9)'
    limb(0.0, -0.13 * crouch, -0.09 * swing + 0.02, -0.15 * crouch, 0.045, armC)
    limb(0.0, 0.13 * crouch, 0.09 * swing + 0.02, 0.15 * crouch, 0.045, armC)
    // body: a short rounded slab across the shoulders, yellow with a restrained glow
    ctx.shadowColor = 'rgba(255, 210, 58, 0.55)'
    ctx.shadowBlur = s * 0.12
    ctx.fillStyle = COLORS.runner
    ctx.beginPath()
    const bw = 0.13 * s
    const bh = 0.15 * s * crouch
    ctx.roundRect ? ctx.roundRect(-bw / 2 - 0.02 * s, -bh, bw, bh * 2, bw * 0.45) : ctx.rect(-bw / 2, -bh, bw, bh * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.rotate(-R.heading)
    // head: a perfectly round electric-blue form, on top
    const hx = lean.x * s
    const hy = lean.y * s
    ctx.shadowColor = 'rgba(42, 107, 255, 0.8)'
    ctx.shadowBlur = s * 0.14
    const hr = 0.072 * s
    const core = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, hr * 0.1, hx, hy, hr)
    core.addColorStop(0, '#7aa4ff')
    core.addColorStop(0.6, COLORS.blue)
    core.addColorStop(1, '#1747c9')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(hx, hy, hr, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    // he felt you move while he was changing: the body flashes orange for a moment
    if (game.holding && fx.movedAt && time - fx.movedAt < 0.3) {
      ctx.fillStyle = 'rgba(255, 91, 58, 0.55)'
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2)
      ctx.fill()
    }
    // the stillness asked for at the end of the circuit: a thin bar filling beneath the runner
    if (game.system === 'restoring' && fx.stillness > 0) {
      ctx.fillStyle = 'rgba(242, 240, 234, 0.25)'
      ctx.fillRect(-s * 0.25, s * 0.3, s * 0.5, 2)
      ctx.fillStyle = 'rgba(242, 240, 234, 0.9)'
      ctx.fillRect(-s * 0.25, s * 0.3, s * 0.5 * fx.stillness, 2)
    }
    ctx.restore()
  }

  // ---------- his dream ----------

  // Fog: layered banks of smoke drifting slowly through the rooms, darker shadows and an
  // amber-brown haze; its density follows the dream (and breathes). Walls, the player and the
  // anchor stay readable through it.
  drawFog(game, time, dt) {
    const d = game.dream
    const dens = clamp(d.fog)
    if (dens < 0.01) return
    const ctx = this.ctx
    const s = this.cell
    const t = this.reducedMotion ? 0 : time
    ctx.save()
    ctx.beginPath()
    ctx.rect(this.X(0), this.Y(0), COLS * s, ROWS * s)
    ctx.clip()
    // an overall veil
    ctx.fillStyle = `rgba(14, 10, 8, ${0.42 * dens})`
    ctx.fillRect(this.X(0), this.Y(0), COLS * s, ROWS * s)
    // drifting banks: dark ones low, amber ones higher and fainter
    const banks = (this.fogBanks ??= Array.from({ length: 16 }, (_, i) => ({ x: (i * 2.37) % COLS, y: (i * 3.91) % ROWS, r: 1.6 + ((i * 0.73) % 1.6), vx: 0.08 + ((i * 0.37) % 0.12), vy: 0.03 * (i % 3) - 0.03, amber: i % 3 === 0, ph: i * 1.7 })))
    // a second, charcoal layer drifting the other way, slower
    const low = (this.fogLow ??= Array.from({ length: 10 }, (_, i) => ({ x: (i * 3.1) % COLS, y: (i * 4.7) % ROWS, r: 2.2 + ((i * 0.53) % 1.4), vx: -(0.04 + ((i * 0.29) % 0.06)), ph: i * 2.3 })))
    for (const b of low) {
      if (!this.reducedMotion) {
        b.x += b.vx * dt
        if (b.x + b.r < 0) b.x = COLS + b.r
      }
      const x = this.X(b.x)
      const y = this.Y(b.y + Math.sin(t * 0.2 + b.ph) * 0.3)
      const r = b.r * s
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(22, 20, 19, ${0.5 * dens})`)
      g.addColorStop(1, 'rgba(22, 20, 19, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    }
    for (const b of banks) {
      if (!this.reducedMotion) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        if (b.x - b.r > COLS) b.x = -b.r
        if (b.y - b.r > ROWS) b.y = -b.r
        if (b.y + b.r < 0) b.y = ROWS + b.r
      }
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.4 + b.ph)
      const x = this.X(b.x)
      const y = this.Y(b.y)
      const r = b.r * s * (0.9 + 0.1 * Math.sin(t * 0.3 + b.ph))
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      if (b.amber) {
        g.addColorStop(0, `rgba(150, 96, 44, ${0.22 * dens * pulse})`)
        g.addColorStop(1, 'rgba(150, 96, 44, 0)')
      } else {
        g.addColorStop(0, `rgba(36, 26, 20, ${0.58 * dens * pulse})`)
        g.addColorStop(1, 'rgba(36, 26, 20, 0)')
      }
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    }
    // soft amber light blooms drifting through it, and motes of dust catching the light
    ctx.globalCompositeOperation = 'lighter'
    const blooms = (this.blooms ??= Array.from({ length: 5 }, (_, i) => ({ x: (i * 2.9 + 1) % COLS, y: (i * 3.3 + 2) % ROWS, ph: i * 1.9 })))
    for (const b of blooms) {
      const x = this.X(b.x + Math.sin(t * 0.11 + b.ph) * 1.2)
      const y = this.Y(b.y + Math.cos(t * 0.09 + b.ph) * 1.0)
      const r = s * (1.1 + 0.3 * Math.sin(t * 0.5 + b.ph))
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(190, 120, 50, ${0.1 * dens * (0.6 + 0.4 * Math.sin(t * 0.8 + b.ph))})`)
      g.addColorStop(1, 'rgba(190, 120, 50, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    }
    const motes = (this.motes ??= Array.from({ length: 60 }, (_, i) => ({ x: (i * 0.37 * COLS) % COLS, y: (i * 0.61 * ROWS) % ROWS, v: 0.05 + (i % 7) * 0.02, ph: i * 0.9 })))
    for (const m of motes) {
      if (!this.reducedMotion) {
        m.y -= m.v * dt
        m.x += Math.sin(t * 0.3 + m.ph) * 0.05 * dt
        if (m.y < 0) m.y = ROWS
      }
      const a = 0.35 * dens * (0.5 + 0.5 * Math.sin(t * 1.7 + m.ph))
      ctx.fillStyle = `rgba(255, 190, 110, ${a})`
      ctx.beginPath()
      ctx.arc(this.X(m.x), this.Y(m.y), Math.max(0.8, s * 0.025), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    // darker shadows gathering at the edges
    const vg = ctx.createRadialGradient(this.X(COLS / 2), this.Y(ROWS / 2), s * 2, this.X(COLS / 2), this.Y(ROWS / 2), s * ROWS * 0.62)
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vg.addColorStop(1, `rgba(6, 4, 3, ${0.55 * dens})`)
    ctx.fillStyle = vg
    ctx.fillRect(this.X(0), this.Y(0), COLS * s, ROWS * s)
    ctx.restore()
  }

  // The ANCHOR: a floor tile glowing bright green, blinking between green and a dimmer green, a
  // soft halo that shows through the fog, its name above; on reaching it, a burst.
  drawAnchor(game, fx, time) {
    const d = game.dream
    const a = d.anchorPos()
    if (!a) return
    const ctx = this.ctx
    const s = this.cell
    const reached = d.phase === 'settling' || d.phase === 'over'
    const since = reached ? d.t - d.reachedAt : 0
    const fade = reached ? clamp(1 - (since - 1.5) / 2.5) : clamp(d.t / 0.8)
    if (fade <= 0) return
    const blink = this.reducedMotion ? 1 : 0.55 + 0.45 * (Math.sin(time * 5) > 0 ? 1 : 0.35) * (0.8 + 0.2 * Math.sin(time * 2.2))
    const boost = reached ? 1 + 1.5 * clamp(1 - since / 1.5) : 1
    const x = this.X(a.x)
    const y = this.Y(a.y)
    ctx.save()
    ctx.globalAlpha = fade
    const halo = ctx.createRadialGradient(x, y, 0, x, y, s * 1.4 * boost)
    halo.addColorStop(0, `rgba(57, 255, 122, ${0.45 * blink})`)
    halo.addColorStop(1, 'rgba(57, 255, 122, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x, y, s * 1.4 * boost, 0, Math.PI * 2)
    ctx.fill()
    const h = 0.3 * s
    ctx.shadowColor = 'rgba(57, 255, 122, 0.9)'
    ctx.shadowBlur = s * 0.4 * boost
    ctx.fillStyle = blink > 0.8 ? '#39ff7a' : '#1f9e4c'
    ctx.fillRect(x - h, y - h, 2 * h, 2 * h)
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(200, 255, 215, 0.9)'
    ctx.lineWidth = 1
    ctx.strokeRect(x - h, y - h, 2 * h, 2 * h)
    // reached: a ring of confirmation
    if (reached && since < 1.5) {
      ctx.strokeStyle = `rgba(57, 255, 122, ${1 - since / 1.5})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, s * (0.4 + since * 1.6), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.font = `bold ${Math.max(10, s * 0.26)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = blink > 0.8 ? '#39ff7a' : '#7dffa8'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
    ctx.shadowBlur = 4
    ctx.fillText('ANCHOR', x, y - h - s * 0.12)
    ctx.restore()
  }

  // The dream cloud above his head: dark translucent smoke puffs with amber edges, small
  // bubbles rising to it from his head, particles drifting off, all breathing slowly.
  drawDreamCloud(game, time, dt) {
    const d = game.dream
    const k = clamp(d.cloud)
    if (k < 0.01) return
    const ctx = this.ctx
    const s = this.cell
    const t = this.reducedMotion ? 0 : time
    const hb = game.body.frames.head
    const head = { x: this.X((hb.a.x + hb.b.x) / 2), y: this.Y((hb.a.y + hb.b.y) / 2) }
    const c = { x: Math.max(this.X(0) + s * 1.1, Math.min(this.X(COLS) - s * 1.1, head.x + s * 0.7)), y: Math.max(this.Y(0) + s * 0.9, Math.min(this.Y(ROWS) - s * 0.9, head.y - s * 1.6)) }
    const pulse = 1 + 0.06 * Math.sin(t * 1.3)
    ctx.save()
    ctx.globalAlpha = k
    // the little bubbles from his head to the cloud
    for (let i = 0; i < 3; i++) {
      const f = (i + 1) / 4
      const r = s * (0.07 + 0.04 * i)
      ctx.fillStyle = 'rgba(30, 24, 20, 0.7)'
      ctx.strokeStyle = 'rgba(255, 170, 80, 0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(head.x + (c.x - head.x) * f, head.y + (c.y - head.y) * f + Math.sin(t * 2 + i) * 2, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // the puffs
    const puffs = [
      [0, 0, 0.55],
      [-0.5, 0.1, 0.4],
      [0.5, 0.08, 0.42],
      [-0.22, -0.3, 0.38],
      [0.25, -0.28, 0.4],
    ]
    for (const [i, [px, py, pr]] of puffs.entries()) {
      const x = c.x + px * s + Math.sin(t * 0.7 + i) * s * 0.04
      const y = c.y + py * s + Math.cos(t * 0.6 + i * 1.3) * s * 0.04
      const r = pr * s * pulse
      const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r)
      g.addColorStop(0, 'rgba(70, 52, 38, 0.75)')
      g.addColorStop(0.7, 'rgba(26, 20, 16, 0.8)')
      g.addColorStop(1, 'rgba(255, 160, 70, 0.28)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // particles drifting out of it
    const parts = (this.cloudParts ??= Array.from({ length: 14 }, (_, i) => ({ a: i * 0.45, r: 0.3 + (i % 5) * 0.12, life: (i * 0.37) % 1 })))
    for (const p of parts) {
      if (!this.reducedMotion) p.life += dt * 0.25
      if (p.life > 1) p.life -= 1
      const x = c.x + Math.cos(p.a) * (p.r + p.life * 0.6) * s
      const y = c.y + Math.sin(p.a) * (p.r + p.life * 0.4) * s - p.life * s * 0.5
      ctx.fillStyle = `rgba(255, 176, 90, ${0.5 * Math.sin(Math.PI * p.life)})`
      ctx.beginPath()
      ctx.arc(x, y, Math.max(1, s * 0.03), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // ---------- the hypnotic spirals, around his head ----------
  //   recording     concentric rings turning at different speeds, a double spiral; they swell
  //                 with the voice
  //   interpreting  they draw in toward his head, turn against themselves, go irregular
  //   reacting      to what he chose: drawn outward (followed), held and faded (stayed still),
  //                 twisted with orange (turned against it, or reread it)
  //   broken        irritated: they distort and stop at once
  // They never show what he will do before he does it.
  drawHypnosis(game, fx, time) {
    const h = fx.hypno
    if (!h) return
    const k = Math.max(0, time - h.since)
    const s = this.cell
    const hb = game.body.frames.head
    const c = { x: this.X((hb.a.x + hb.b.x) / 2), y: this.Y((hb.a.y + hb.b.y) / 2) }
    let alpha = 0
    let scale = 1
    let twist = 1
    let wobble = 0
    let accent = false
    const out = (x) => 1 - (1 - clamp(x)) ** 3
    switch (h.phase) {
      case 'recording':
        alpha = clamp(k / 0.6) * 0.75
        scale = 0.85 + 0.35 * (h.level ?? 0) + 0.1 * Math.min(1, k / 8)
        break
      case 'interpreting':
        alpha = 0.8
        scale = 1 - 0.45 * out(k / 1.2) + 0.05 * Math.sin(k * 6)
        twist = -2.6
        wobble = 0.06 + 0.1 * Math.abs(Math.sin(k * 3.7)) * Math.sin(k * 11)
        break
      case 'reacting':
        if (h.kind === 'follow') {
          scale = 0.6 + 2.2 * out(k / 2.4)
          alpha = 0.8 * (1 - clamp(k / 2.4))
        } else if (h.kind === 'still') {
          scale = 0.7
          alpha = 0.6 * (1 - clamp(k / 2))
          twist = 0.3
        } else {
          accent = h.kind === 'contrary'
          scale = 0.7 + 0.6 * out(k / 2.4)
          alpha = 0.8 * (1 - clamp(k / 2.4))
          twist = h.kind === 'contrary' ? -3.2 : -1.6
          wobble = h.kind === 'contrary' ? 0.28 : 0.16
        }
        break
      // under hypnosis: he chooses a shape, then takes it in three stages
      case 'deciding':
        alpha = 0.85
        scale = 0.55 + 0.08 * Math.sin(k * 9)
        twist = 3.2
        wobble = 0.18 * Math.sin(k * 13)
        break
      case 'say1':
        alpha = 0.7
        scale = 0.6 + 0.5 * out(k / 2)
        twist = 1.4
        break
      case 'say2':
        alpha = 0.9
        scale = 1.1 + 0.4 * out(k / 2)
        twist = 2.4
        wobble = 0.06
        accent = k < 0.6
        break
      case 'say3':
        alpha = 0.9 - 0.4 * clamp(k / 2.6)
        scale = 1.5 - 0.4 * out(k / 2.6)
        twist = 0.8
        break
      case 'fading':
        alpha = 0.35 * (1 - clamp(k / 1.2))
        scale = 1.2
        break
      case 'broken':
        accent = true
        alpha = 0.9 * (1 - clamp(k / 0.45))
        scale = 1 + 0.8 * k
        wobble = 0.5
        twist = 4
        break
      default:
        break
    }
    if (alpha <= 0.01) {
      if (h.phase !== 'recording' && h.phase !== 'interpreting' && k > 0.3) fx.hypno = null
      return
    }
    const ctx = this.ctx
    const t = this.reducedMotion ? 0 : time
    ctx.save()
    ctx.lineCap = 'round'
    const ring = (r, i) => {
      ctx.beginPath()
      for (let j = 0; j <= 72; j++) {
        const th = (j / 72) * Math.PI * 2
        const rr = r * (1 + wobble * Math.sin(th * (3 + i) + t * 5 + i * 1.7))
        const x = c.x + Math.cos(th) * rr
        const y = c.y + Math.sin(th) * rr
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
    for (let i = 0; i < 6; i++) {
      const r = (0.3 + i * 0.36) * s * scale * (1 + 0.04 * Math.sin(t * 1.3 + i))
      ctx.strokeStyle = accent && i % 2 ? `rgba(255, 91, 58, ${alpha * (0.6 - i * 0.07)})` : `rgba(${COLORS.wind}, ${alpha * (0.55 - i * 0.07)})`
      ctx.lineWidth = 1
      ctx.setLineDash([r * 0.3, r * 0.14])
      ctx.lineDashOffset = t * (12 + i * 7) * (i % 2 ? 1 : -1) * twist
      ring(r, i)
    }
    ctx.setLineDash([])
    // a double spiral, slowly turning
    for (let arm = 0; arm < 2; arm++) {
      ctx.strokeStyle = accent ? `rgba(255, 91, 58, ${alpha * 0.7})` : `rgba(42, 107, 255, ${alpha * 0.75})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      const rot = t * 0.7 * twist + arm * Math.PI
      for (let j = 0; j <= 110; j++) {
        const th = (j / 110) * Math.PI * 5
        const rr = s * scale * 0.13 * th * (1 + wobble * Math.sin(th * 2 + t * 7))
        const x = c.x + Math.cos(th + rot) * rr
        const y = c.y + Math.sin(th + rot) * rr
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---------- his sleep: floating Zs at his head; a pulse where he was woken ----------

  drawSleep(game, fx, time, dt) {
    const ctx = this.ctx
    const s = this.cell
    const zs = (this.zs ??= [])
    const asleep = (fx.sleep ?? game.sleep?.state) === 'SLEEPING'
    const h = game.body.frames.head
    const head = { x: h.b.x, y: h.b.y }
    this.zTimer = (this.zTimer ?? 0.5) - dt
    if (asleep && this.zTimer <= 0 && !this.reducedMotion) {
      this.zTimer = 1.4 + Math.random() * 1.8
      const n = zs.length ? (zs[zs.length - 1].n % 3) + 1 : 1
      zs.push({ x: head.x + 0.15 + Math.random() * 0.15, y: head.y - 0.15, t: 0, life: 3.4 + Math.random() * 1.2, size: 0.18 + n * 0.05 + Math.random() * 0.05, n, drift: 0.12 + Math.random() * 0.1 })
    }
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const z of zs) {
      // awake, they fade away quickly
      z.t += dt * (asleep ? 1 : 3)
      const k = z.t / z.life
      if (k >= 1) continue
      const a = Math.sin(Math.PI * Math.min(1, k * 1.3)) * 0.7
      const zx = z.x + Math.sin(z.t * 1.3 + z.n) * 0.08 + z.t * z.drift
      const zy = z.y - z.t * 0.28
      ctx.font = `${Math.max(8, z.size * s)}px ${FONT}`
      ctx.shadowColor = `rgba(${COLORS.wind}, ${a})`
      ctx.shadowBlur = s * 0.08
      ctx.fillStyle = `rgba(226, 238, 255, ${a})`
      ctx.fillText(z.n === 1 ? 'z' : z.n === 2 ? 'Zz' : 'Zzz', this.X(zx), this.Y(zy))
    }
    ctx.restore()
    this.zs = zs.filter((z) => z.t < z.life)
    // woken: a short orange-red pulse where it happened, on his body
    if (fx.wakeAt != null && time - fx.wakeAt < 1.2) {
      const k = (time - fx.wakeAt) / 1.2
      const c = fx.wakeAtPoint ?? head
      for (const d of [0, 0.25]) {
        const kk = clamp(k - d)
        if (kk <= 0 || kk >= 1) continue
        ctx.strokeStyle = `rgba(255, 91, 58, ${0.75 * (1 - kk)})`
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(this.X(c.x), this.Y(c.y), Math.max(1, (0.2 + kk * 1.1) * s), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // The sun's trajectory: an orange dotted arc on the side it shines from, as in the reference.
  drawSun(game) {
    const env = game.env
    if (!env.sunOn) return
    const ctx = this.ctx
    const S = env.sunDir
    const cx = this.X(COLS / 2)
    const cy = this.Y(ROWS / 2)
    const R = Math.hypot(COLS, ROWS) * 0.5 * this.cell
    const from = Math.atan2(-S.y, -S.x)
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 91, 58, 0.5)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.arc(cx, cy, R, from - 0.55, from + 0.55)
    ctx.stroke()
    ctx.setLineDash([])
    const sx = cx + Math.cos(from) * R
    const sy = cy + Math.sin(from) * R
    ctx.fillStyle = 'rgba(255, 91, 58, 0.85)'
    ctx.beginPath()
    ctx.arc(sx, sy, Math.max(3, this.cell * 0.09), 0, Math.PI * 2)
    ctx.fill()
    // dotted rays toward the windows it reaches
    ctx.strokeStyle = 'rgba(255, 91, 58, 0.28)'
    ctx.setLineDash([2, 4])
    for (const b of env.beams ?? []) {
      const w = b.window
      const ex = this.X(w.x)
      const ey = this.Y(w.y)
      ctx.beginPath()
      ctx.moveTo(ex - S.x * this.cell * 1.6, ey - S.y * this.cell * 1.6)
      ctx.lineTo(ex, ey)
      ctx.stroke()
    }
    ctx.restore()
  }

  drawLegend(env) {
    const ctx = this.ctx
    const s = this.cell
    const x0 = this.X(0.12)
    const y0 = this.Y(0.32)
    ctx.font = `${Math.max(8, s * 0.2)}px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(242, 240, 234, 0.6)'
    ctx.strokeStyle = 'rgba(242, 240, 234, 0.6)'
    ctx.lineWidth = 1
    const W = env.windDir
    ctx.fillText('WIND', x0, y0)
    const ax = x0 + s * 1.2
    const L = s * 0.32
    ctx.beginPath()
    ctx.moveTo(ax - W.x * L, y0 - W.y * L)
    ctx.lineTo(ax + W.x * L, y0 + W.y * L)
    ctx.lineTo(ax + W.x * L - (W.x * 0.5 - W.y * 0.35) * L, y0 + W.y * L - (W.y * 0.5 + W.x * 0.35) * L)
    ctx.moveTo(ax + W.x * L, y0 + W.y * L)
    ctx.lineTo(ax + W.x * L - (W.x * 0.5 + W.y * 0.35) * L, y0 + W.y * L - (W.y * 0.5 - W.x * 0.35) * L)
    ctx.stroke()
  }
}

export { wallEnds }
