import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { S } from '../walk/plan.js'
import { move } from '../walk/collide.js'
import { ENTER_SOUND } from '../walk/scenes.js'
import { Floors, Ground, LightPool, RoomContents, Structure, Windows } from '../walk/HouseScene.jsx'
import { ROOM_TYPES } from '../engine/rooms.js'
import { ZONES } from '../vastu/reference.js'
import { zoneOfCell } from '../engine/layout.js'

const SKY = { harmony: '#efe2c6', tension: '#9aa7b0', isolation: '#a9bfd2', confusion: '#8fa4a6', abandonment: '#6f6a60', listening: '#d9cfbb' }
const TINT = { harmony: '#C4A15A', tension: '#C45A42', isolation: '#A9C8E8', confusion: '#155D63', abandonment: '#77746d', listening: '#C4A15A' }
const MOOD_LABEL = { harmony: 'Harmony', tension: 'Tension', loss: 'Loss', neglect: 'Neglect', quiet: 'Quiet' }
const KEYS = { forward: ['w', 'arrowup'], back: ['s', 'arrowdown'], left: ['a'], right: ['d'], turnL: ['arrowleft', 'q'], turnR: ['arrowright', 'e'] }

// First-person controller: keys, on-screen buttons, drag-to-look and optional pointer lock.
function Player({ house, input, player, look, onCell, onPorch, onStep }) {
  const { camera, gl } = useThree()
  const bob = useRef(0)
  const walked = useRef(0)
  const last = useRef({ cell: '', porch: false })
  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])
  // looking with the mouse: drag, or pointer lock
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    const down = (e) => {
      dragging = true
      el.setPointerCapture?.(e.pointerId)
    }
    const up = () => (dragging = false)
    const mv = (e) => {
      if (!dragging && document.pointerLockElement !== el) return
      look.current.yaw -= e.movementX * 0.0035
      look.current.pitch = Math.max(-1.1, Math.min(1.1, look.current.pitch - e.movementY * 0.0035))
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointermove', mv)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointermove', mv)
    }
  }, [gl, look])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.12)
    const k = input.current
    const turn = (k.turnR ? 1 : 0) - (k.turnL ? 1 : 0)
    look.current.yaw -= turn * dt * 1.9
    const fwd = (k.forward ? 1 : 0) - (k.back ? 1 : 0)
    const side = (k.right ? 1 : 0) - (k.left ? 1 : 0)
    const yaw = look.current.yaw
    const speed = (k.run ? 3.8 : 2.4) * dt
    let dx = (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * speed
    let dz = (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * speed
    const p = player.current
    if (dx || dz) {
      // small sub-steps, so a slow frame can never carry the visitor through a wall
      const n = Math.ceil(Math.hypot(dx, dz) / 0.1)
      let next = { x: p.x, z: p.z }
      for (let i = 0; i < n; i++) next = move(next, dx / n, dz / n, house.colliders)
      const stepLen = Math.hypot(next.x - p.x, next.z - p.z)
      p.x = next.x
      p.z = next.z
      bob.current += stepLen * 3.2
      walked.current += stepLen
      if (walked.current > 1.35) {
        walked.current = 0
        onStep()
      }
    }
    camera.position.set(p.x, 1.6 + Math.sin(bob.current) * 0.025, p.z)
    camera.rotation.set(look.current.pitch, yaw, 0)

    const cellKey = `${Math.floor(p.x / S)},${Math.floor(p.z / S)}`
    const pc = house.porch
    const inPorch = pc && Math.abs(p.x - pc.x) < pc.w / 2 && Math.abs(p.z - pc.z) < pc.d / 2
    if (cellKey !== last.current.cell && !inPorch) {
      last.current.cell = cellKey
      onCell(cellKey)
    }
    if (!!inPorch !== last.current.porch) {
      last.current.porch = !!inPorch
      onPorch(!!inPorch)
    }
  })
  return null
}

function MiniMap({ house, scenes, player, look }) {
  const ref = useRef()
  useEffect(() => {
    let raf
    const draw = () => {
      const c = ref.current
      if (!c) return
      const g = c.getContext('2d')
      const cell = c.width / 6
      g.clearRect(0, 0, c.width, c.height)
      g.strokeStyle = 'rgba(196,161,90,0.35)'
      for (let i = 0; i <= 6; i++) {
        g.beginPath()
        g.moveTo(i * cell, 0)
        g.lineTo(i * cell, c.height)
        g.moveTo(0, i * cell)
        g.lineTo(c.width, i * cell)
        g.stroke()
      }
      for (const h of house.cells) {
        g.fillStyle = h.cellType === 'corridor' ? '#b8ad98' : ROOM_TYPES[h.cellType]?.colour ?? '#999'
        g.globalAlpha = scenes[h.id]?.mood === 'neglect' ? 0.35 : 0.85
        g.fillRect(h.col * cell + 2, h.row * cell + 2, cell - 4, cell - 4)
      }
      g.globalAlpha = 1
      const p = player.current
      const x = (p.x / S) * cell
      const y = (p.z / S) * cell
      g.fillStyle = '#FAF7EF'
      g.strokeStyle = '#242622'
      g.beginPath()
      g.arc(x, y, 4.5, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x - Math.sin(look.current.yaw) * 12, y - Math.cos(look.current.yaw) * 12)
      g.stroke()
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [house, scenes, player, look])
  return <canvas ref={ref} className="walk-map" width={150} height={150} aria-label="Map of the house with your position" />
}

// The walkable house. Everything in it comes from the plan and the daemon's scenes.
export default function WalkView({ house, scenes, rooms, outcome, features, baseMix, engine, lastLog, coins, onExit, onCoin, onStep, onEnterRoom, fading }) {
  const input = useRef({})
  const player = useRef({ x: house.spawn.x, z: house.spawn.z })
  const look = useRef({ yaw: house.spawn.yaw, pitch: 0 })
  const timeInRoom = useRef({ id: null, t: 0 })
  const [here, setHere] = useState(null)
  const [porch, setPorch] = useState(false)
  const [locked, setLocked] = useState(false)
  const cellById = useMemo(() => new Map(house.cells.map((c) => [`${c.col},${c.row}`, c])), [house])

  // development only: lets automated tests face a doorway
  useEffect(() => {
    if (import.meta.env.DEV) window.__walk = { player, look, input }
  }, [])

  // keyboard
  useEffect(() => {
    const set = (e, v) => {
      if (e.target.closest?.('input')) return
      const k = e.key.toLowerCase()
      if (k === 'shift') input.current.run = v
      for (const [action, keys] of Object.entries(KEYS)) {
        if (keys.includes(k)) {
          input.current[action] = v
          e.preventDefault()
        }
      }
    }
    const down = (e) => set(e, true)
    const up = (e) => set(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    const lockChange = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', lockChange)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      document.removeEventListener('pointerlockchange', lockChange)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [])

  // Entering a room: crossfade to that room's sound, with a little of the neighbours through the walls.
  const enterCell = useCallback(
    (key) => {
      const cell = cellById.get(key)
      setHere(cell ?? null)
      if (!cell) return
      timeInRoom.current = { id: cell.id, t: performance.now() / 1000 }
      const scene = scenes[cell.id]
      const mix = {}
      for (const [k, v] of Object.entries(baseMix)) mix[k] = v * 0.35
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = cellById.get(`${cell.col + dc},${cell.row + dr}`)
        const ns = n && scenes[n.id]
        if (!ns) continue
        for (const [k, v] of Object.entries(ns.sound)) mix[k] = Math.max(mix[k] ?? 0, v * 0.3)
      }
      if (scene) for (const [k, v] of Object.entries(scene.sound)) mix[k] = Math.max(mix[k] ?? 0, v)
      mix.hum = Math.max(mix.hum ?? 0, outcome === 'abandonment' ? 0.12 : 0.18)
      engine.setLayers(mix, 1.4)
      const shot = scene && ENTER_SOUND[scene.mood]
      if (shot && scene.seed % 3 !== 0) engine.play(shot, { delay: 0.6 })
      if (scene) onEnterRoom(cell, scene)
    },
    [cellById, scenes, baseMix, engine, outcome, onEnterRoom],
  )

  const hold = (action) => ({
    onPointerDown: (e) => {
      e.preventDefault()
      input.current[action] = true
    },
    onPointerUp: () => (input.current[action] = false),
    onPointerLeave: () => (input.current[action] = false),
  })

  const scene = here && scenes[here.id]
  const zone = here && zoneOfCell(here.col, here.row)
  const sky = SKY[outcome] ?? SKY.listening

  return (
    <div className={`walk ${fading ? 'is-fading' : ''}`}>
      <Canvas camera={{ fov: 68, near: 0.05, far: 140, position: [house.spawn.x, 1.6, house.spawn.z] }} dpr={[1, 1.75]} gl={{ antialias: true }}>
        <color attach="background" args={[sky]} />
        <fog attach="fog" args={[sky, 6, outcome === 'abandonment' ? 22 : 38]} />
        <hemisphereLight args={['#fff3dc', '#5c5446', outcome === 'abandonment' ? 0.22 : 0.42]} />
        <ambientLight intensity={0.08} />
        <Ground sky={sky} />
        <Structure house={house} plaster={features.lamps ? '#f4ebda' : '#e7dcc6'} outcomeTint={TINT[outcome] ?? TINT.listening} />
        <Floors cells={house.cells} scenes={scenes} />
        <Windows windows={house.windows} scenes={scenes} />
        {house.cells.map((c) => (
          <RoomContents key={c.id} cell={c} scene={scenes[c.id]} player={player} onCoin={onCoin} avoid={c.cellType === 'entrance' ? { x: house.spawn.x - c.x, z: house.spawn.z - c.z } : null} />
        ))}
        {house.porch && (
          <mesh rotation-x={-Math.PI / 2} position={[house.porch.x, 0.01, house.porch.z]}>
            <planeGeometry args={[house.porch.w, house.porch.d]} />
            <meshStandardMaterial color="#b5a27c" roughness={1} />
          </mesh>
        )}
        <LightPool cells={house.cells} scenes={scenes} player={player} lamps={!!features.lamps} timeInRoom={timeInRoom} />
        <Player house={house} input={input} player={player} look={look} onCell={enterCell} onPorch={setPorch} onStep={onStep} />
      </Canvas>

      <div className="walk-top">
        <div className="walk-place">
          <span className="eyebrow">Inside the house</span>
          <h2>{here ? (here.cellType === 'corridor' ? 'Corridor' : ROOM_TYPES[here.cellType]?.label) : porch ? 'Outside' : '—'}</h2>
          {zone && here?.cellType !== 'corridor' && (
            <span className="dim">
              {ZONES[zone].dir} · {ZONES[zone].name}
            </span>
          )}
        </div>
        <div className="walk-actions">
          <span className="walk-coins">
            <span className="coin-icon" aria-hidden="true" /> {coins}
          </span>
          <button className="btn primary" onClick={onExit}>
            Return to floor plan
          </button>
        </div>
      </div>

      {scene && here?.cellType !== 'corridor' && (
        <section className={`walk-story mood-${scene.mood}`} key={here.id}>
          <span className={`story-badge mood-${scene.mood}`}>{MOOD_LABEL[scene.mood]}</span>
          <p className="story-see">{scene.see}</p>
          <dl>
            <dt>The daemon heard</dt>
            <dd>{scene.heard}</dd>
            <dt>It believes</dt>
            <dd>{scene.believes}</dd>
          </dl>
          <p className="story-note">An imagined scene: the daemon’s fiction, not a prediction.</p>
        </section>
      )}

      {porch && (
        <div className="walk-porch">
          <p>You are outside the front door.</p>
          <button className="btn primary" onClick={onExit}>
            Return to floor plan
          </button>
          <span className="dim">or turn around and go back in</span>
        </div>
      )}

      <div className="walk-side">
        <MiniMap house={house} scenes={scenes} player={player} look={look} />
        <div className="walk-pad" aria-label="Movement controls">
          <button className="btn small" {...hold('turnL')} aria-label="Turn left">↶</button>
          <button className="btn small" {...hold('forward')} aria-label="Forward">▲</button>
          <button className="btn small" {...hold('turnR')} aria-label="Turn right">↷</button>
          <button className="btn small" {...hold('left')} aria-label="Step left">◀</button>
          <button className="btn small" {...hold('back')} aria-label="Back">▼</button>
          <button className="btn small" {...hold('right')} aria-label="Step right">▶</button>
        </div>
        <p className="walk-help">
          <kbd>W</kbd>/<kbd>↑</kbd> forward · <kbd>S</kbd>/<kbd>↓</kbd> back · <kbd>A</kbd>/<kbd>D</kbd> step · <kbd>←</kbd>/<kbd>→</kbd> turn · drag to look ·{' '}
          <kbd>Shift</kbd> walk faster
        </p>
        <button
          className="btn small"
          onClick={() => (locked ? document.exitPointerLock() : document.querySelector('.walk canvas')?.requestPointerLock?.())}
        >
          {locked ? 'Release mouse (Esc)' : 'Mouse look'}
        </button>
      </div>

      {lastLog && (
        <p className="walk-log" key={lastLog.id}>
          {lastLog.text}
        </p>
      )}
    </div>
  )
}
