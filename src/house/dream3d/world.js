// THE DREAM, WALKED — the plan rebuilt by the architect he dreams he is, in three.js.
//
// One unit is one cell of the plan: plan x → world x, plan y → world z, height → world y.
// The dream unfolds in three movements:
//   transform   seen from above, as the plan is seen: every wall bends, slides or splits from the
//               plan's straight wall into the architect's (nearest the player first); columns grow
//   descend     the camera comes down into the house, to the player's eye
//   walk        first person: keys and mouse, or the phone's tilt (forward / back, turn), or two
//               thumbs. The walls are solid (physics.js). The ANCHOR glows and hums: louder, and
//               to the side it is on, the nearer the player is. Found, it calls onFound.
// The 2D game is paused meanwhile; nothing here changes it.

import * as THREE from 'three'
import { collide, PLAYER_RADIUS } from '../world/physics.js'
import { WALL_H, solidsOf } from './architects.js'

const EYE = 1.05
const WALK = 1.35 // cells per second
const RUN = 2.3
const TURN = 1.9 // radians per second at full tilt / key
const T_MORPH = 3.6
const T_DESCEND = 2.8
const LOST_AFTER = 40 // seconds of searching before the anchor's light shows through the walls
const ANCHOR_HALF = 0.3
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k))
const lerp = (a, b, k) => a + (b - a) * k

function rng(seed) {
  let s = (Math.floor(seed) % 2147483646) + 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// ---------- textures, drawn once on canvases ----------

function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas')
  c.width = size[0]
  c.height = size[1]
  draw(c.getContext('2d'), c.width, c.height)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

// Gaudí's hexagonal paving (Passeig de Gràcia): one tile period, √3 r wide and 3 r high
function hexTexture() {
  const W = 256
  const r = W / Math.sqrt(3)
  return canvasTexture([W, Math.round(3 * r)], (g, w, h) => {
    g.fillStyle = '#4f6b6c'
    g.fillRect(0, 0, w, h)
    const hex = (cx, cy) => {
      g.beginPath()
      for (let i = 0; i < 6; i++) g.lineTo(cx + r * 0.94 * Math.cos(Math.PI / 6 + (i * Math.PI) / 3), cy + r * 0.94 * Math.sin(Math.PI / 6 + (i * Math.PI) / 3))
      g.closePath()
      g.fillStyle = '#7d9a95'
      g.fill()
      g.strokeStyle = '#c9a25a'
      g.lineWidth = 5
      g.beginPath()
      g.arc(cx, cy, r * 0.42, 0, Math.PI * 2)
      g.stroke()
      for (let i = 0; i < 3; i++) {
        g.beginPath()
        g.arc(cx + r * 0.94 * Math.cos(Math.PI / 6 + (i * 2 * Math.PI) / 3), cy + r * 0.94 * Math.sin(Math.PI / 6 + (i * 2 * Math.PI) / 3), r * 0.5, 0, Math.PI * 2)
        g.stroke()
      }
    }
    for (const [x, y] of [[0, 0], [w, 0], [w / 2, 1.5 * r], [0, 3 * r], [w, 3 * r], [w / 2, -1.5 * r], [w / 2, 4.5 * r]]) hex(x, y)
  })
}

// a square tile per cell with fine joints: Le Corbusier's concrete, Mies's travertine
function gridTexture(base, joint, streaks) {
  return canvasTexture([256, 256], (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const r = rng(7)
    for (let i = 0; i < (streaks ? 70 : 900); i++) {
      g.fillStyle = `rgba(0,0,0,${streaks ? 0.035 : 0.05 * r()})`
      if (streaks) g.fillRect(0, r() * h, w, 1 + r() * 4)
      else g.fillRect(r() * w, r() * h, 2, 2)
    }
    g.strokeStyle = joint
    g.lineWidth = 3
    g.strokeRect(0, 0, w, h)
  })
}

// marble and onyx: a base with drifting veins
function marbleTexture(base, vein, seed) {
  return canvasTexture([512, 512], (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    const r = rng(seed)
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = vein
      g.globalAlpha = 0.15 + r() * 0.35
      g.lineWidth = 0.5 + r() * 2.5
      g.beginPath()
      let x = r() * w
      let y = 0
      g.moveTo(x, y)
      while (y < h) {
        x += (r() - 0.5) * 60
        y += 20 + r() * 40
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  })
}

// Hadid's floor: pale resin, swept by long curving lines
function flowTexture() {
  return canvasTexture([512, 512], (g, w, h) => {
    g.fillStyle = '#e9e8e4'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(70,72,84,0.22)'
    g.lineWidth = 2
    for (let k = 0; k < 9; k++) {
      g.beginPath()
      for (let x = 0; x <= w; x += 8) g.lineTo(x, ((k + 0.5) * h) / 9 + 18 * Math.sin((2 * Math.PI * x) / w + k * 0.7))
      g.stroke()
    }
  })
}

function glowTexture() {
  return canvasTexture(
    [128, 128],
    (g, w) => {
      const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      grd.addColorStop(0, 'rgba(160,255,190,1)')
      grd.addColorStop(0.25, 'rgba(60,255,130,0.55)')
      grd.addColorStop(1, 'rgba(60,255,130,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, w, w)
    },
    false,
  )
}

// ---------- materials, per architect ----------

const TRENCADIS = ['#e0a43a', '#2f8f9d', '#1f4e9c', '#d8c9a3', '#b8452f', '#6aa56b', '#f2f0ea', '#c7603a']

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o })
  return {
    trencadis: std({ vertexColors: true, roughness: 0.35, metalness: 0.15, flatShading: true }),
    stone: std({ color: '#d9c49f', roughness: 0.9 }),
    stained: std({ color: '#3fa7a0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, emissive: '#7a4a10', emissiveIntensity: 0.25 }),
    door: std({ color: '#5a3020', roughness: 0.7 }),
    vault: std({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.FrontSide }),
    white: std({ color: '#f2f0ea', roughness: 0.85 }),
    blue: std({ color: '#3b5b8c', roughness: 0.85 }),
    red: std({ color: '#a8432f', roughness: 0.85 }),
    ochre: std({ color: '#c9a43a', roughness: 0.85 }),
    green: std({ color: '#6f8f6a', roughness: 0.85 }),
    ribbon: std({ color: '#a9c4d6', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 }),
    ceiling: std({ color: '#f4f2ec', roughness: 0.95, side: THREE.FrontSide }),
    glass: std({ color: '#7fa6b8', roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false }),
    steel: std({ color: '#c8ccd2', roughness: 0.18, metalness: 0.95 }),
    onyx: std({ map: marbleTexture('#c8924f', '#fff1d0', 3), roughness: 0.15, metalness: 0.05 }),
    marble: std({ map: marbleTexture('#2f4a3c', '#d9e8dc', 11), roughness: 0.12, metalness: 0.05 }),
    travertineWall: std({ map: gridTexture('#d8cdb5', 'rgba(0,0,0,0.12)', true), roughness: 0.6 }),
    fluid: std({ color: '#f1f0ec', roughness: 0.22, metalness: 0.05 }),
    fluidCeiling: std({ color: '#eceae6', roughness: 0.3, side: THREE.FrontSide }),
    titanium: std({ color: '#c3c9cf', roughness: 0.35, metalness: 0.6, flatShading: true }),
    copper: std({ color: '#b5683a', roughness: 0.4, metalness: 0.5, flatShading: true }),
    ply: std({ map: gridTexture('#c49a6c', 'rgba(70,35,0,0.35)', true), roughness: 0.8 }),
    plyCeiling: std({ map: gridTexture('#c49a6c', 'rgba(70,35,0,0.35)', true), roughness: 0.8, side: THREE.FrontSide }),
  }
}

function floorMaterial(kind) {
  if (kind === 'hex') return { mat: new THREE.MeshStandardMaterial({ map: hexTexture(), roughness: 0.55 }), tile: [0.7, (0.7 * 3) / Math.sqrt(3)] }
  if (kind === 'concrete') return { mat: new THREE.MeshStandardMaterial({ map: gridTexture('#b9bbb8', 'rgba(0,0,0,0.18)'), roughness: 0.9 }), tile: [0.6, 0.6] }
  if (kind === 'flow') return { mat: new THREE.MeshStandardMaterial({ map: flowTexture(), roughness: 0.2 }), tile: [2.4, 2.4] }
  // Gehry's: rough boards
  if (kind === 'boards') return { mat: new THREE.MeshStandardMaterial({ map: gridTexture('#a77d50', 'rgba(40,20,0,0.35)', true), roughness: 0.85 }), tile: [1.2, 0.3] }
  return { mat: new THREE.MeshStandardMaterial({ map: gridTexture('#e3d9c2', 'rgba(90,70,40,0.25)', true), roughness: 0.4 }), tile: [1, 0.5] }
}

// ---------- a wall as a ribbon along its path ----------

// The vertex count stays the same as the wall morphs, so its arrays are rewritten in place.
class Ribbon {
  constructor(e, mat, seed) {
    this.e = e
    const n = e.pts0.length
    // broken tiles need rows up the wall, or the faces read as stripes
    this.rows = mat.vertexColors ? 6 : 1
    this.quads = (n - 1) * (2 * this.rows + 2) + 2
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.quads * 18), 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.quads * 12), 2))
    if (mat.vertexColors) {
      // broken tiles: each face its own colour
      const r = rng(seed)
      const col = new Float32Array(this.quads * 18)
      const c = new THREE.Color()
      for (let q = 0; q < this.quads; q++) {
        c.set(TRENCADIS[Math.floor(r() * TRENCADIS.length)]).convertSRGBToLinear()
        for (let v = 0; v < 6; v++) col.set([c.r, c.g, c.b], q * 18 + v * 3)
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    }
    this.mesh = new THREE.Mesh(g, mat)
    this.set(0)
  }

  set(k) {
    const e = this.e
    const n = e.pts0.length
    const at = (v, i) => (Array.isArray(v) ? v[i] : v)
    const pts = e.pts0.map((p, i) => ({ x: lerp(p.x, e.pts1[i].x, k), y: lerp(p.y, e.pts1[i].y, k) }))
    const bot = pts.map((_, i) => lerp(at(e.bot0, i), at(e.bot1, i), k))
    const top = pts.map((_, i) => Math.max(bot[i] + 0.001, lerp(at(e.top0, i), at(e.top1, i), k)))
    const th = lerp(e.thick0, e.thick1, k) / 2
    const L = []
    const R = []
    let s = 0
    const along = [0]
    for (let i = 0; i < n; i++) {
      const p = pts[Math.min(n - 1, i + 1)]
      const q = pts[Math.max(0, i - 1)]
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1
      const nx = -(p.y - q.y) / d
      const ny = (p.x - q.x) / d
      L.push({ x: pts[i].x + nx * th, y: pts[i].y + ny * th })
      R.push({ x: pts[i].x - nx * th, y: pts[i].y - ny * th })
      if (i) along.push((s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)))
    }
    const pos = this.mesh.geometry.attributes.position.array
    const uv = this.mesh.geometry.attributes.uv.array
    let o = 0
    let u = 0
    // a quad from four [plan point, height, along] corners
    const quad = (...c) => {
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const [p, y, a] = c[idx]
        pos[o++] = p.x
        pos[o++] = y
        pos[o++] = p.y
        uv[u++] = a / 2
        uv[u++] = y / 2
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const [a0, a1] = [along[i], along[i + 1]]
      for (let r = 0; r < this.rows; r++) {
        const y = (j, f) => lerp(bot[j], top[j], f / this.rows)
        quad([L[i], y(i, r), a0], [L[i + 1], y(i + 1, r), a1], [L[i + 1], y(i + 1, r + 1), a1], [L[i], y(i, r + 1), a0])
        quad([R[i], y(i, r), a0], [R[i + 1], y(i + 1, r), a1], [R[i + 1], y(i + 1, r + 1), a1], [R[i], y(i, r + 1), a0])
      }
      quad([L[i], top[i], a0], [L[i + 1], top[i + 1], a1], [R[i + 1], top[i + 1], a1], [R[i], top[i], a0])
      quad([L[i], bot[i], a0], [L[i + 1], bot[i + 1], a1], [R[i + 1], bot[i + 1], a1], [R[i], bot[i], a0])
    }
    const m = n - 1
    quad([L[0], bot[0], 0], [R[0], bot[0], 0.1], [R[0], top[0], 0.1], [L[0], top[0], 0])
    quad([L[m], bot[m], s], [R[m], bot[m], s + 0.1], [R[m], top[m], s + 0.1], [L[m], top[m], s])
    const g = this.mesh.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.uv.needsUpdate = true
    g.computeVertexNormals()
    g.computeBoundingSphere()
  }
}

// ---------- columns ----------

function cylinderBetween(a, b, r0, r1, mat) {
  const d = new THREE.Vector3().subVectors(b, a)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 10), mat)
  m.position.copy(a).addScaledVector(d, 0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  return m
}

function column(c, mats) {
  const g = new THREE.Group()
  const mat = mats[c.mat]
  if (c.shape === 'tree') {
    // a trunk that branches toward the vault, leaning like Sagrada Família's columns
    const fork = new THREE.Vector3(0, c.h * 0.55, 0)
    g.add(cylinderBetween(new THREE.Vector3(0, 0, 0), fork, c.r * 1.3, c.r, mat))
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4
      g.add(cylinderBetween(fork, new THREE.Vector3(Math.cos(a) * 0.45, c.h, Math.sin(a) * 0.45), c.r * 0.8, c.r * 0.45, mat))
    }
  } else if (c.shape === 'cross') {
    for (const [w, d] of [[0.16, 0.035], [0.035, 0.16]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, c.h, d), mat)
      m.position.y = c.h / 2
      g.add(m)
    }
  } else if (c.shape === 'lean') {
    // a post knocked off the vertical (Gehry)
    g.add(cylinderBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(c.lx, c.h, c.lz), c.r, c.r * 0.7, mat))
  } else if (c.shape === 'mullion') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, c.h, 0.03), mat)
    m.position.y = c.h / 2
    g.add(m)
  } else {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.h, 18), mat)
    m.position.y = c.h / 2
    g.add(m)
  }
  g.position.set(c.x, 0, c.y)
  return g
}

// ---------- ceilings: faces turned down, so from above the house is cut open ----------

function ceiling(cl, mats, seed) {
  const w = cl.x1 - cl.x0
  const d = cl.y1 - cl.y0
  const vault = cl.kind === 'vault'
  const wave = cl.kind === 'wave'
  const g = new THREE.PlaneGeometry(w, d, vault ? 14 : wave ? Math.ceil(w * 6) : 1, vault ? 14 : wave ? Math.ceil(d * 6) : 1).rotateX(Math.PI / 2)
  if (wave) {
    // one sheet rippling along the current (Hadid), its crests drifting across it
    const p = g.attributes.position
    const [cx, cz] = [Math.cos(cl.dir), Math.sin(cl.dir)]
    for (let i = 0; i < p.count; i++) {
      const a = p.getX(i) * cx + p.getZ(i) * cz
      const c = p.getZ(i) * cx - p.getX(i) * cz
      p.setY(i, cl.rise * Math.sin(a * 1.6 + 0.6 * Math.sin(c * 0.9)))
    }
    g.computeVertexNormals()
  }
  if (vault) {
    // a catenary, upside down: rising to the middle of the bay
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const u = (2 * p.getX(i)) / w
      const v = (2 * p.getZ(i)) / d
      p.setY(i, cl.rise * (1 - u * u) * (1 - v * v))
    }
    const r = rng(seed)
    const col = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      c.set(TRENCADIS[Math.floor(r() * TRENCADIS.length)]).lerp(new THREE.Color('#f2e6cc'), 0.45).convertSRGBToLinear()
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
  }
  const m = new THREE.Mesh(g, mats[cl.mat])
  m.position.set((cl.x0 + cl.x1) / 2, cl.y, (cl.y0 + cl.y1) / 2)
  // a plane tilted its own way (Gehry)
  if (cl.kind === 'tilt') m.rotation.set(cl.tx, 0, cl.tz)
  return m
}

// ---------- the world ----------

export class DreamWorld {
  // dream: { house, start, anchor } from dreamHouse(); architect from architects.js
  constructor({ canvas, dream, architect, plan, services, onWalk, onLost, onFound }) {
    this.canvas = canvas
    this.dream = dream
    this.architect = architect
    this.services = services
    this.on = { walk: onWalk, lost: onLost, found: onFound }
    this.phase = 'still' // still · transform · descend · walk · found
    this.t = 0
    this.walkT = 0
    this.player = { x: dream.start.x, y: dream.start.y, vx: 0, vy: 0, r: PLAYER_RADIUS, contactUntil: {} }
    this.yaw = -Math.PI / 2 // looking up the plan, as the plan is seen from above
    this.pitch = 0
    this.bob = 0
    this.keys = new Set()
    this.look = null
    this.stick = null
    this.solids = solidsOf(dream.house)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer = renderer
    const look = architect.look
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(look.background)
    scene.fog = new THREE.Fog(look.fog, 60, 120)
    this.scene = scene
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200)
    scene.add(new THREE.HemisphereLight(look.sky, look.ground, 1.3))
    // light bounced off the floor, so the ceilings read from below
    scene.add(new THREE.AmbientLight(look.sun, 0.55))
    const sun = new THREE.DirectionalLight(look.sun, 1.6)
    sun.position.set(...look.sunAt)
    scene.add(sun)

    const mats = materials()
    this.mats = mats
    const b = dream.house.bounds
    // the floor, in the architect's paving, and the dark ground beyond
    const fm = floorMaterial(dream.house.floor)
    const fw = b.x1 - b.x0 + 1.2
    const fd = b.y1 - b.y0 + 1.2
    fm.mat.map.repeat.set(fw / fm.tile[0], fd / fm.tile[1])
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2), fm.mat)
    floor.position.set((b.x0 + b.x1) / 2, 0, (b.y0 + b.y1) / 2)
    scene.add(floor)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: look.ground, roughness: 1 }))
    ground.position.y = -0.01
    scene.add(ground)
    for (const x of dream.house.extras) {
      if (x.kind !== 'pool') continue
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(x.x1 - x.x0, x.y1 - x.y0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0d2238', roughness: 0.04, metalness: 0.7 }))
      pool.position.set((x.x0 + x.x1) / 2, 0.004, (x.y0 + x.y1) / 2)
      scene.add(pool)
    }

    // everything that morphs: each piece starts after a delay, nearest the player first
    const far = Math.hypot(b.x1 - b.x0, b.y1 - b.y0)
    const delay = (p) => 0.45 * clamp(Math.hypot(p.x - dream.start.x, p.y - dream.start.y) / far)
    this.walls = dream.house.walls.map((e, i) => {
      const r = new Ribbon(e, mats[e.mat], (plan.seed ?? 1) + i * 13)
      r.delay = delay(e.pts0[Math.floor(e.pts0.length / 2)])
      scene.add(r.mesh)
      return r
    })
    this.columns = dream.house.columns.map((c) => {
      const g = column(c, mats)
      g.delay = delay(c)
      g.scale.y = 0.001
      scene.add(g)
      return g
    })
    this.ceilings = dream.house.ceilings.map((c, i) => {
      const m = ceiling(c, mats, (plan.seed ?? 1) + i * 31)
      m.delay = 0.4
      m.visible = false
      scene.add(m)
      return m
    })

    // the ANCHOR: a green tile on the floor (as in the plan) with a light floating over it
    const a = dream.anchor
    const anchor = new THREE.Group()
    anchor.position.set(a.x, 0, a.y)
    const tileMat = new THREE.MeshBasicMaterial({ color: '#39ff88', transparent: true, opacity: 0.6 })
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(ANCHOR_HALF * 2, ANCHOR_HALF * 2).rotateX(-Math.PI / 2), tileMat)
    tile.position.y = 0.01
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshStandardMaterial({ color: '#7dffb0', emissive: '#39ff88', emissiveIntensity: 2.2 }))
    core.position.y = 0.95
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    halo.position.y = 0.95
    halo.scale.setScalar(1.3)
    const light = new THREE.PointLight('#39ff88', 5, 5, 1.2)
    light.position.y = 1
    // the beam shows through the walls only once the player has searched a long while
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#39ff88', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }),
    )
    beam.position.y = 7
    beam.renderOrder = 10
    anchor.add(tile, core, halo, light, beam)
    // hidden while the house is seen from above: it is found inside, not spotted on the plan
    anchor.visible = false
    scene.add(anchor)
    this.anchor = { group: anchor, tile, core, halo, light, beam }

    // the camera above the plan, as the 2D game shows it
    this.centre = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.y0 + b.y1) / 2)
    this.resize()
    this.placeTop()
    this.qTop = this.camera.quaternion.clone()
    this.pTop = this.camera.position.clone()

    this.bind()
    this.hum()
    this.last = performance.now()
    this.raf = requestAnimationFrame((t) => this.frame(t))
  }

  placeTop() {
    const b = this.dream.house.bounds
    const half = Math.max((b.x1 - b.x0) / this.camera.aspect, b.y1 - b.y0) / 2 + 0.8
    this.camera.position.set(this.centre.x, WALL_H + half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), this.centre.z)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(this.centre)
    this.camera.up.set(0, 1, 0)
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  // the transformation begins (after his declaration)
  begin() {
    if (this.phase === 'still') {
      this.phase = 'transform'
      this.t = 0
    }
  }

  // ---------- input: keys, mouse (pointer lock or drag), two thumbs, the phone's tilt ----------

  bind() {
    const c = this.canvas
    this.onKey = (e) => {
      const down = e.type === 'keydown'
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'].includes(e.code)) {
        if (down) this.keys.add(e.code)
        else this.keys.delete(e.code)
        e.preventDefault()
      }
    }
    this.onMouse = (e) => {
      if (document.pointerLockElement === c) this.turnBy(e.movementX, e.movementY)
    }
    this.onDown = (e) => {
      if (this.phase !== 'walk') return
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement !== c) c.requestPointerLock?.()
        return
      }
      c.setPointerCapture(e.pointerId)
      // left thumb walks, right thumb looks
      if (e.clientX < c.clientWidth / 2 && !this.stick) this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 }
      else this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    this.onMove = (e) => {
      if (this.stick?.id === e.pointerId) {
        this.stick.x = clamp((e.clientX - this.stick.x0) / 60, -1, 1)
        this.stick.y = clamp((e.clientY - this.stick.y0) / 60, -1, 1)
      } else if (this.look?.id === e.pointerId) {
        this.turnBy((e.clientX - this.look.x) * 1.6, (e.clientY - this.look.y) * 1.6)
        this.look.x = e.clientX
        this.look.y = e.clientY
      }
    }
    this.onUp = (e) => {
      if (this.stick?.id === e.pointerId) this.stick = null
      if (this.look?.id === e.pointerId) this.look = null
    }
    this.onResize = () => this.resize()
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    window.addEventListener('resize', this.onResize)
    document.addEventListener('mousemove', this.onMouse)
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('pointercancel', this.onUp)
  }

  turnBy(dx, dy) {
    this.yaw += dx * 0.0025
    this.pitch = clamp(this.pitch - dy * 0.0025, -1.2, 1.2)
  }

  // ---------- the anchor's hum: he hears it, and so does the player ----------

  hum() {
    const a = this.services?.audio
    if (!a?.ctx || !a.master) return
    const ctx = a.ctx
    const g = ctx.createGain()
    g.gain.value = 0
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    const oscs = [196, 293.7, 392.4].map((f, i) => {
      const o = ctx.createOscillator()
      o.type = i ? 'sine' : 'triangle'
      o.frequency.value = f
      o.connect(g)
      o.start()
      return o
    })
    if (pan) g.connect(pan).connect(a.master)
    else g.connect(a.master)
    this.sound = { ctx, g, pan, oscs }
  }

  // ---------- the frame ----------

  frame(now) {
    this.raf = requestAnimationFrame((t) => this.frame(t))
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.t += dt
    const cam = this.camera
    const look = this.architect.look

    if (this.phase === 'transform') {
      const K = clamp(this.t / T_MORPH)
      for (const w of this.walls) w.set(ease((K - w.delay) / 0.55))
      for (const c of this.columns) c.scale.y = Math.max(0.001, ease((K - c.delay - 0.2) / 0.5))
      if (K >= 1) {
        this.phase = 'descend'
        this.t = 0
      }
    } else if (this.phase === 'descend') {
      const k = ease(this.t / T_DESCEND)
      const p = this.player
      cam.position.set(lerp(this.pTop.x, p.x, ease(this.t / (T_DESCEND * 0.7))), lerp(this.pTop.y, EYE, k), lerp(this.pTop.z, p.y, ease(this.t / (T_DESCEND * 0.7))))
      cam.quaternion.slerpQuaternions(this.qTop, this.eyeQuaternion(), k)
      // once the camera is down inside the house, the ceilings close over it and the anchor is there
      const inside = cam.position.y < WALL_H * 1.05
      for (const c of this.ceilings) c.visible = inside
      this.anchor.group.visible = inside
      const f = sceneFog(look, k)
      this.scene.fog.near = f.near
      this.scene.fog.far = f.far
      if (this.t >= T_DESCEND) {
        this.phase = 'walk'
        this.walkT = 0
        this.on.walk?.()
      }
    } else if (this.phase === 'walk') {
      this.walk(dt)
    } else if (this.phase === 'found') {
      // the light swells and the dream lets go
      const k = clamp(this.t / 1.6)
      this.anchor.light.intensity = 5 + 40 * k
      this.anchor.halo.scale.setScalar(1.3 + 6 * k)
      cam.position.y = EYE + 0.3 * ease(k)
      if (this.t >= 1.6 && !this.foundSent) {
        this.foundSent = true
        this.on.found?.()
      }
    }

    // the anchor breathes
    const an = this.anchor
    an.core.rotation.y += dt * 1.4
    an.core.position.y = 0.95 + 0.06 * Math.sin(this.t * 2.1)
    an.halo.position.y = an.core.position.y
    an.tile.material.opacity = 0.45 + 0.25 * Math.sin(this.t * 3.3)
    this.renderer.render(this.scene, cam)
  }

  eyeQuaternion() {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, -this.yaw - Math.PI / 2, 0, 'YXZ'))
  }

  walk(dt) {
    this.walkT += dt
    const k = this.keys
    const has = (...c) => c.some((x) => k.has(x))
    let fwd = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0)
    let side = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0)
    let turn = (has('ArrowRight', 'KeyE') ? 1 : 0) - (has('ArrowLeft', 'KeyQ') ? 1 : 0)
    if (this.stick) {
      fwd -= this.stick.y
      side += this.stick.x
    }
    // the phone's tilt: lean it forward to walk, sideways to turn
    const { tilt, sensors } = this.services ?? {}
    if (tilt && sensors?.active) {
      const t = tilt.read(sensors.gravity, dt)
      if (tilt.source === 'tilt') {
        fwd -= t.y * 1.4
        turn += t.x * 1.2
      }
    }
    this.yaw += clamp(turn, -1, 1) * TURN * dt
    fwd = clamp(fwd, -1, 1)
    side = clamp(side, -1, 1)
    const m = Math.hypot(fwd, side)
    const speed = (has('ShiftLeft', 'ShiftRight') ? RUN : WALK) * Math.min(1, m)
    const p = this.player
    if (m > 0.01) {
      const f = { x: Math.cos(this.yaw), y: Math.sin(this.yaw) }
      const r = { x: -f.y, y: f.x }
      const vx = ((f.x * fwd + r.x * side) / Math.max(1, m)) * speed
      const vy = ((f.y * fwd + r.y * side) / Math.max(1, m)) * speed
      // small steps, each pushed out of the walls (the 2D game's own collision)
      const n = Math.ceil((speed * dt) / 0.05)
      for (let i = 0; i < n; i++) {
        p.x += (vx * dt) / n
        p.y += (vy * dt) / n
        collide(p, this.solids, [], this.walkT)
      }
      this.bob += dt * speed * 5.5
    }
    const b = this.dream.house.bounds
    p.x = clamp(p.x, b.x0 - 3, b.x1 + 3)
    p.y = clamp(p.y, b.y0 - 3, b.y1 + 3)
    this.camera.position.set(p.x, EYE + 0.022 * Math.sin(this.bob), p.y)
    this.camera.quaternion.copy(this.eyeQuaternion())

    // how near the anchor is: the hum, a heartbeat in the hand, and at last its light
    const a = this.dream.anchor
    const d = Math.hypot(a.x - p.x, a.y - p.y)
    const near = clamp(1 - d / 9)
    if (this.sound) {
      const s = this.sound
      const pulse = 0.55 + 0.45 * Math.sin(this.walkT * (2 + 9 * near))
      s.g.gain.setTargetAtTime(0.05 * near ** 1.6 * pulse + 0.004, s.ctx.currentTime, 0.05)
      // to the side it is on
      if (s.pan) s.pan.pan.setTargetAtTime(clamp(Math.sin(Math.atan2(a.y - p.y, a.x - p.x) - this.yaw), -1, 1) * 0.8, s.ctx.currentTime, 0.1)
    }
    if (d < 1.4 && this.walkT - (this.beatAt ?? -9) > 1.3) {
      this.beatAt = this.walkT
      this.services?.haptics?.play('heartbeat')
    }
    if (this.walkT > LOST_AFTER) {
      if (!this.lostSent) {
        this.lostSent = true
        this.on.lost?.()
      }
      this.anchor.beam.material.opacity = 0.45 * clamp((this.walkT - LOST_AFTER) / 5)
    }
    // the player's circle overlapping the anchor tile, as in the plan (dream.js onAnchor)
    const dx = Math.max(Math.abs(p.x - a.x) - ANCHOR_HALF, 0)
    const dy = Math.max(Math.abs(p.y - a.y) - ANCHOR_HALF, 0)
    if (Math.hypot(dx, dy) < p.r) {
      this.phase = 'found'
      this.t = 0
      this.services?.haptics?.play('escape')
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.()
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('mousemove', this.onMouse)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.()
    if (this.sound) {
      const s = this.sound
      const t = s.ctx.currentTime
      s.g.gain.cancelScheduledValues(t)
      s.g.gain.setTargetAtTime(0, t, 0.3)
      for (const o of s.oscs) o.stop(t + 1.5)
    }
    this.scene.traverse((o) => {
      o.geometry?.dispose()
      const m = o.material
      if (m) for (const x of [m].flat()) (x.map?.dispose(), x.dispose())
    })
    this.renderer.dispose()
  }
}

// the fog closes in as the camera comes down into the house
function sceneFog(look, k) {
  return { near: lerp(60, look.fogNear, k), far: lerp(120, look.fogFar, k) }
}
