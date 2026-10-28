// The 3D house, generated from the plan (plan.js) and the daemon's chosen scenes (scenes.js).
// Everything is procedural: boxes, cylinders and spheres. No models are downloaded.

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ROOM_TYPES } from '../engine/rooms.js'
import { S, H, T } from './plan.js'

const WOOD = '#8a5a3b'
const DARK = '#3a3a35'
const LINEN = '#efe6d4'
const SHEET = '#cfc8b8'
const GOLD = '#C4A15A'

// ---------- walls, floors, ceilings ----------

function BoxInstances({ boxes, color, roughness = 0.92, emissive, emissiveIntensity = 0 }) {
  const ref = useRef()
  useLayoutEffect(() => {
    if (!ref.current) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    boxes.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d))
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [boxes])
  if (!boxes.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} key={boxes.length}>
      <boxGeometry />
      <meshStandardMaterial color={color} roughness={roughness} emissive={emissive ?? '#000000'} emissiveIntensity={emissiveIntensity} />
    </instancedMesh>
  )
}

export function Structure({ house, plaster, outcomeTint }) {
  const groups = useMemo(() => {
    const g = { wall: [], ext: [], lintel: [], low: [], board: [] }
    for (const b of house.boxes) if (g[b.kind]) g[b.kind].push(b)
    return g
  }, [house])
  return (
    <group>
      <BoxInstances boxes={groups.wall} color={plaster} />
      <BoxInstances boxes={groups.ext} color={plaster} />
      <BoxInstances boxes={groups.lintel} color={plaster} />
      <BoxInstances boxes={groups.low} color="#b9ad93" />
      <BoxInstances boxes={groups.board} color={WOOD} roughness={1} />
      {/* skirting and a fine gold line where wall meets floor */}
      <BoxInstances boxes={groups.wall.concat(groups.ext).map((b) => ({ ...b, y: 0.06, h: 0.12, w: b.w + 0.02, d: b.d + 0.02 }))} color={outcomeTint} roughness={0.6} />
    </group>
  )
}

export function Floors({ cells, scenes }) {
  return (
    <group>
      {cells.map((c) => {
        const garden = c.cellType === 'garden'
        const corridor = c.cellType === 'corridor'
        const mood = scenes[c.id]?.mood
        const base = garden ? '#5f7b55' : corridor ? '#b8ad98' : '#d9ccb2'
        const floor = mood === 'neglect' ? '#8f8674' : base
        return (
          <group key={c.id} position={[c.x, 0, c.z]}>
            <mesh rotation-x={-Math.PI / 2} receiveShadow>
              <planeGeometry args={[S, S]} />
              <meshStandardMaterial color={floor} roughness={1} />
            </mesh>
            {!garden && !corridor && (
              <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
                <planeGeometry args={[S * 0.55, S * 0.55]} />
                <meshStandardMaterial color={ROOM_TYPES[c.cellType]?.colour ?? '#c9c0ae'} roughness={1} transparent opacity={mood === 'neglect' ? 0.35 : 0.8} />
              </mesh>
            )}
            {!garden && (
              <mesh rotation-x={Math.PI / 2} position-y={corridor ? H - 0.4 : H}>
                <planeGeometry args={[S, S]} />
                <meshStandardMaterial color={mood === 'neglect' ? '#6f6a60' : '#ece3d0'} roughness={1} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

export function Ground({ sky }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[12, -0.01, 12]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#cbbf9f" roughness={1} />
      </mesh>
      <mesh position={[12, 0, 12]}>
        <sphereGeometry args={[60, 24, 12]} />
        <meshBasicMaterial color={sky} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

// Window panes glow with the light the daemon imagines outside that room.
export function Windows({ windows, scenes }) {
  return windows.map((w, i) => {
    const mood = scenes[w.roomId]?.mood ?? 'quiet'
    const colour = { harmony: '#fff0c4', tension: '#c9d6e2', loss: '#b8d0e8', neglect: '#77746d', quiet: '#f3ead6' }[mood]
    const glow = { harmony: 0.75, tension: 0.35, loss: 0.3, neglect: 0.08, quiet: 0.45 }[mood]
    const inward = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] }[w.side]
    const x = w.x + inward[0] * (T / 2 + 0.012)
    const z = w.z + inward[1] * (T / 2 + 0.012)
    const rotY = Math.atan2(inward[0], inward[1])
    return (
      <group key={i} position={[x, 1.6, z]} rotation-y={rotY}>
        <mesh>
          <planeGeometry args={[1.3, 1.2]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={glow} roughness={0.4} />
        </mesh>
        {[[-0.68, 0, 0.06, 1.3], [0.68, 0, 0.06, 1.3], [0, 0.63, 1.42, 0.06], [0, -0.63, 1.42, 0.06], [0, 0, 0.04, 1.2]].map(([fx, fy, fw, fh], k) => (
          <mesh key={k} position={[fx, fy, 0.01]}>
            <planeGeometry args={[fw, fh]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
        ))}
        {mood === 'harmony' && (
          <mesh position={[0, -0.5, 0.9]} rotation-x={-0.9}>
            <planeGeometry args={[1.2, 2.2]} />
            <meshBasicMaterial color="#ffe3a8" transparent opacity={0.09} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    )
  })
}

// ---------- figures ----------

const figMat = { harmony: '#efe2c8', tension: '#b7ae9c', loss: '#c9d2da', neglect: '#9a9384', quiet: '#e6dcc8' }

function Figure({ pose = 'stand', anim = 'still', at, face = 0, phase = 0, mood, child = false, walkTo }) {
  const ref = useRef()
  const torso = useRef()
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: figMat[mood] ?? figMat.quiet, roughness: 0.85, transparent: true }), [mood])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    const g = ref.current
    if (!g) return
    if (anim === 'talk') torso.current.rotation.x = Math.sin(t * 2) * 0.04
    if (anim === 'argue') {
      torso.current.rotation.x = Math.max(0, Math.sin(t * 2.6)) * 0.22
      g.position.y = Math.max(0, Math.sin(t * 2.6)) * 0.03
    }
    if (anim === 'sway') torso.current.rotation.z = Math.sin(t * 1.3) * 0.07
    if (anim === 'pace') {
      g.position.x = at[0] + Math.sin(t * 0.5) * 1.1
      g.rotation.y = Math.cos(t * 0.5) > 0 ? -Math.PI / 2 : Math.PI / 2
    }
    if (anim === 'walkaway' && walkTo) {
      // walks to the door and fades, again and again: footsteps receding
      const k = (t % 9) / 7
      const u = Math.min(1, k)
      g.position.x = at[0] + (walkTo[0] - at[0]) * u
      g.position.z = at[1] + (walkTo[1] - at[1]) * u
      mat.opacity = k > 1 ? 0 : 1 - Math.max(0, u - 0.6) / 0.4
    }
  })
  const s = child ? 0.62 : 1
  const seated = pose === 'sit'
  const floor = pose === 'floor'
  const lie = pose === 'lie'
  return (
    <group ref={ref} position={[at[0], 0, at[1]]} rotation-y={face}>
      <group scale={s} rotation-x={lie ? -Math.PI / 2 : 0} position={lie ? [0, 0.62, 0.75] : [0, 0, 0]}>
        {!seated && !floor && (
          <mesh position={[0, 0.42, 0]} material={mat}>
            <cylinderGeometry args={[0.15, 0.12, 0.84, 10]} />
          </mesh>
        )}
        {seated && (
          <mesh position={[0, 0.47, -0.18]} material={mat}>
            <boxGeometry args={[0.32, 0.14, 0.42]} />
          </mesh>
        )}
        {floor && (
          <mesh position={[0, 0.1, 0]} material={mat}>
            <boxGeometry args={[0.55, 0.18, 0.4]} />
          </mesh>
        )}
        <group ref={torso} position={[0, seated ? 0.55 : floor ? 0.18 : 0.84, 0]}>
          <mesh position={[0, 0.32, 0]} material={mat}>
            <cylinderGeometry args={[0.2, 0.16, 0.64, 12]} />
          </mesh>
          <mesh position={[0, 0.78, 0]} material={mat}>
            <sphereGeometry args={[0.13, 14, 10]} />
          </mesh>
          {[-0.25, 0.25].map((x) => (
            <mesh key={x} position={[x, 0.3, anim === 'argue' ? -0.08 : 0]} rotation-x={anim === 'argue' ? -0.5 : 0} material={mat}>
              <cylinderGeometry args={[0.05, 0.045, 0.58, 8]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

// Who the daemon imagines in each room, by room type and scene.
function figuresFor(type, mood) {
  const F = (at, o = {}) => ({ at, ...o })
  const table = {
    living: {
      harmony: [F([-1.6, 1.2], { pose: 'sit' }), F([-0.8, 1.2], { pose: 'sit', anim: 'talk' }), F([0.9, 0.9], { face: -2.3, anim: 'talk' }), F([0.9, -0.9], { child: true, anim: 'sway' })],
      tension: [F([-0.55, -0.4], { face: -Math.PI / 2, anim: 'argue' }), F([0.55, -0.4], { face: Math.PI / 2, anim: 'argue', phase: 1.2 })],
      quiet: [F([-1.2, 1.2], { pose: 'sit' })],
    },
    bedroom: {
      harmony: [F([-1.0, -1.1], { pose: 'lie' })],
      tension: [F([0.6, 0.9], { face: 2.6, anim: 'argue' }), F([-0.4, 1.3], { face: -0.5 })],
    },
    kitchen: {
      harmony: [F([-1.25, -1.0], { anim: 'sway' }), F([1.15, -1.0], { anim: 'sway', phase: 2 })],
      tension: [F([-1.25, -1.0]), F([1.1, 1.0], { face: -2.4 })],
    },
    dining: {
      harmony: [F([-0.55, -0.85], { pose: 'sit', face: Math.PI }), F([0.55, -0.85], { pose: 'sit', face: Math.PI, anim: 'talk' }), F([-0.55, 0.85], { pose: 'sit', anim: 'talk', phase: 1 }), F([0.55, 0.85], { pose: 'sit' })],
      tension: [F([-0.55, -0.85], { pose: 'sit', face: Math.PI, anim: 'argue' }), F([0.55, 0.85], { pose: 'sit', anim: 'argue', phase: 1.3 })],
    },
    prayer: { harmony: [F([0, -0.5], { pose: 'floor' })] },
    garden: {
      harmony: [F([0.6, -0.4], { child: true, anim: 'sway' }), F([-0.2, 0.6], { child: true, anim: 'sway', phase: 1.5 }), F([1.2, 1.35], { pose: 'sit' })],
      tension: [F([0, 0.2], { anim: 'pace' })],
    },
    entrance: {
      harmony: [F([0.5, 0.5], { face: -2.6, anim: 'talk' })],
      loss: [F([0, 0], { anim: 'walkaway', walkTo: [0, -1.9] })],
    },
    study: { harmony: [F([1.3, -0.9], { pose: 'sit' })], tension: [F([0.4, 0.3], { anim: 'pace' })] },
    staircase: { loss: [F([0.6, 0.6], { anim: 'walkaway', walkTo: [0.6, -1.8] })] },
  }
  return table[type]?.[mood] ?? (mood === 'loss' && (type === 'living' || type === 'kitchen') ? [F([0, 0.4], { anim: 'walkaway', walkTo: [1.9, 0.4] })] : [])
}

// ---------- furniture ----------

function Box({ p, s, c, e, ei = 0, r = 0 }) {
  return (
    <mesh position={p} rotation-y={r}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.85} emissive={e ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}

function Cyl({ p, a, c, e, ei = 0 }) {
  return (
    <mesh position={p}>
      <cylinderGeometry args={a} />
      <meshStandardMaterial color={c} roughness={0.8} emissive={e ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}

function Furniture({ type, mood, colour }) {
  const sheet = mood === 'neglect'
  const W = sheet ? SHEET : WOOD
  const L = sheet ? SHEET : LINEN
  const C = sheet ? SHEET : colour
  const fire = mood === 'harmony' || mood === 'tension'
  switch (type) {
    case 'living':
      return (
        <>
          <Box p={[-1.2, 0.25, 1.4]} s={[1.9, 0.5, 0.8]} c={C} />
          <Box p={[-1.2, 0.6, 1.72]} s={[1.9, 0.6, 0.18]} c={C} />
          <Box p={[-1.2, 0.22, 0.45]} s={[1.0, 0.44, 0.55]} c={W} />
          <Cyl p={[1.55, 0.75, 1.55]} a={[0.04, 0.04, 1.5, 6]} c={DARK} />
          <Cyl p={[1.55, 1.55, 1.55]} a={[0.18, 0.25, 0.3, 12]} c={L} e={mood === 'harmony' ? '#ffcf8a' : undefined} ei={0.8} />
        </>
      )
    case 'bedroom':
      return (
        <>
          <Box p={[-1.0, 0.25, -1.0]} s={[1.5, 0.5, 2.0]} c={W} />
          <Box p={[-1.0, 0.55, -0.95]} s={[1.42, 0.12, 1.85]} c={sheet ? SHEET : colour} />
          <Box p={[-1.0, 0.68, -1.75]} s={[1.2, 0.14, 0.4]} c={L} />
          <Box p={[0.35, 0.3, -1.65]} s={[0.45, 0.6, 0.45]} c={W} />
          <Box p={[1.6, 1.0, 1.1]} s={[0.6, 2.0, 1.3]} c={W} />
        </>
      )
    case 'kitchen':
      return (
        <>
          <Box p={[-1.25, 0.45, -1.65]} s={[1.1, 0.9, 0.6]} c={L} />
          <Box p={[1.25, 0.45, -1.65]} s={[1.1, 0.9, 0.6]} c={L} />
          <Box p={[1.25, 0.92, -1.65]} s={[0.7, 0.05, 0.5]} c={DARK} e={fire && !sheet ? '#ff7a2e' : undefined} ei={mood === 'harmony' ? 0.9 : 0.4} />
          <Box p={[-1.25, 1.75, -1.85]} s={[1.1, 0.06, 0.3]} c={W} />
          <Box p={[1.2, 0.4, 1.2]} s={[0.9, 0.8, 0.9]} c={C} />
        </>
      )
    case 'dining':
      return (
        <>
          <Box p={[0, 0.72, 0]} s={[1.7, 0.08, 0.95]} c={W} />
          {[[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]].map(([x, z]) => (
            <Box key={`${x}${z}`} p={[x, 0.35, z]} s={[0.07, 0.7, 0.07]} c={W} />
          ))}
          {[[-0.55, -0.85, 0], [0.55, -0.85, 0], [-0.55, 0.85, 0], [mood === 'loss' ? 1.25 : 0.55, mood === 'loss' ? 1.45 : 0.85, mood === 'loss' ? 0.8 : 0]].map(([x, z, r]) => (
            <Box key={`c${x}${z}`} p={[x, 0.45, z]} s={[0.45, 0.06, 0.45]} c={C} r={r} />
          ))}
        </>
      )
    case 'bathroom':
      return (
        <>
          <Box p={[-1.2, 0.28, -1.3]} s={[1.4, 0.56, 0.75]} c={sheet ? '#a9a291' : '#f4f1ea'} />
          <Box p={[1.5, 0.8, -1.5]} s={[0.55, 0.15, 0.4]} c={sheet ? '#a9a291' : '#f4f1ea'} />
          <Cyl p={[1.85, 1.5, 1.85]} a={[0.04, 0.04, 3, 6]} c={sheet ? '#7a5a40' : '#9c7c3a'} />
          <Cyl p={[1.7, 1.5, 1.85]} a={[0.03, 0.03, 3, 6]} c={sheet ? '#7a5a40' : '#9c7c3a'} />
        </>
      )
    case 'prayer':
      return (
        <>
          <Box p={[0, 0.15, -1.55]} s={[1.3, 0.3, 0.7]} c={W} />
          <Box p={[0, 0.65, -1.75]} s={[0.7, 0.7, 0.3]} c={sheet ? SHEET : GOLD} />
          <Cyl p={[0, 0.38, -1.35]} a={[0.07, 0.05, 0.06, 10]} c="#b9763a" />
          {mood === 'harmony' && <Cyl p={[0, 0.47, -1.35]} a={[0.0, 0.025, 0.1, 8]} c="#ffb04a" e="#ffb04a" ei={3} />}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -0.5]}>
            <planeGeometry args={[1.0, 1.4]} />
            <meshStandardMaterial color={sheet ? SHEET : colour} roughness={1} />
          </mesh>
        </>
      )
    case 'garden': {
      const dry = mood === 'neglect' || mood === 'loss'
      return (
        <>
          <Cyl p={[-1.2, 0.9, -1.2]} a={[0.12, 0.18, 1.8, 8]} c="#6b4b32" />
          <mesh position={[-1.2, 2.2, -1.2]}>
            <sphereGeometry args={[0.95, 16, 12]} />
            <meshStandardMaterial color={dry ? '#8f8a5a' : '#365743'} roughness={1} />
          </mesh>
          <Box p={[1.2, 0.25, 1.45]} s={[1.3, 0.08, 0.45]} c={WOOD} />
          <Cyl p={[1.4, 0.25, -1.4]} a={[0.35, 0.3, 0.5, 14]} c="#C45A42" />
          <mesh position={[1.4, 0.65, -1.4]}>
            <sphereGeometry args={[0.35, 12, 10]} />
            <meshStandardMaterial color={dry ? '#9d9461' : '#4f7a4b'} roughness={1} />
          </mesh>
        </>
      )
    }
    case 'entrance':
      return (
        <>
          <Box p={[-1.45, 0.22, 1.45]} s={[0.9, 0.44, 0.4]} c={W} />
          <Box p={[1.8, 1.7, 1.2]} s={[0.08, 0.06, 0.9]} c={DARK} />
          {mood === 'loss' && <Box p={[1.72, 1.35, 1.2]} s={[0.12, 0.7, 0.4]} c="#6f6a60" />}
          <Cyl p={[1.5, 0.9, -1.5]} a={[0.03, 0.03, 1.8, 6]} c={DARK} />
          <Cyl p={[1.5, 1.85, -1.5]} a={[0.16, 0.22, 0.25, 12]} c={L} e={mood === 'harmony' ? '#ffcf8a' : undefined} ei={0.7} />
        </>
      )
    case 'study':
      return (
        <>
          <Box p={[1.3, 0.72, -1.55]} s={[1.3, 0.06, 0.65]} c={W} />
          <Box p={[1.3, 0.36, -1.55]} s={[1.2, 0.7, 0.05]} c={W} />
          <Box p={[1.3, 0.45, -0.9]} s={[0.45, 0.06, 0.45]} c={C} r={mood === 'loss' ? 2.6 : 0} />
          <Box p={[-1.7, 1.0, 0.9]} s={[0.4, 2.0, 1.4]} c={W} />
          {mood === 'tension' && [0.3, -0.4, 0.9].map((x) => <Box key={x} p={[x, 0.01, 0.6 - x]} s={[0.3, 0.005, 0.4]} c={LINEN} r={x} />)}
        </>
      )
    case 'storage':
      return [[-1.4, -1.4, 0.7], [-0.7, -1.5, 0.5], [-1.4, -1.4 + 0.0, 0.5, 0.7], [1.4, 1.3, 0.8], [1.4, 0.5, 0.6]].map(([x, z, s, y], i) => (
        <Box key={i} p={[x, (y ?? 0) + s / 2, z]} s={[s, s, s]} c={sheet ? SHEET : i % 2 ? WOOD : '#a8916c'} r={i * 0.3} />
      ))
    case 'staircase':
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <Box key={i} p={[-1.2, 0.17 + i * 0.3, 1.6 - i * 0.36]} s={[1.2, 0.08, 0.36]} c={W} />
          ))}
          <Box p={[-1.2, 2.9, -1.93]} s={[0.9, 1.8, 0.05]} c={DARK} />
        </>
      )
    default:
      return null
  }
}

// ---------- atmosphere ----------

function Dust({ count = 60, colour = '#d8cfbd', rise = false }) {
  const ref = useRef()
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 3.6
      a[i * 3 + 1] = Math.random() * 2.6
      a[i * 3 + 2] = (Math.random() - 0.5) * 3.6
    }
    return a
  }, [count])
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.y = clock.elapsedTime * 0.03
    ref.current.position.y = rise ? (clock.elapsedTime * 0.25) % 1 : Math.sin(clock.elapsedTime * 0.3) * 0.08
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={colour} size={0.03} transparent opacity={0.7} depthWrite={false} />
    </points>
  )
}

// A shadow sliding across the north wall: someone pacing, out of sight.
function WallShadow() {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.x = Math.sin(clock.elapsedTime * 0.6) * 1.2
  })
  return (
    <group ref={ref} position={[0, 1.4, -S / 2 + T / 2 + 0.015]}>
      <mesh scale={[0.5, 1.1, 1]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial color="#1b1c1a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <circleGeometry args={[0.2, 20]} />
        <meshBasicMaterial color="#1b1c1a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Coin({ onReach, player }) {
  const ref = useRef()
  const done = useRef(false)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g || done.current) return
    g.rotation.y = clock.elapsedTime * 2
    g.position.y = 1.0 + Math.sin(clock.elapsedTime * 2) * 0.08
    const wp = new THREE.Vector3()
    g.getWorldPosition(wp)
    if (Math.hypot(wp.x - player.current.x, wp.z - player.current.z) < 0.85) {
      done.current = true
      g.visible = false
      onReach()
    }
  })
  return (
    <group ref={ref} position={[0.9, 1, 0.9]}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 24]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.25} emissive="#C4A15A" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

export function RoomContents({ cell, scene, player, onCoin, avoid }) {
  if (cell.cellType === 'corridor' || !scene) return null
  const colour = ROOM_TYPES[cell.cellType]?.colour ?? '#c9c0ae'
  let figures = figuresFor(cell.cellType, scene.mood)
  // In the entrance, people stand across the room from the front door, never in the visitor's face.
  if (avoid) {
    const len = Math.hypot(avoid.x, avoid.z) || 1
    const at = [-avoid.x * 0.6 - (avoid.z / len) * 1.2, -avoid.z * 0.6 + (avoid.x / len) * 1.2]
    figures = figures.map((f) => ({ ...f, at, face: Math.atan2(-(avoid.x - at[0]), -(avoid.z - at[1])), walkTo: f.walkTo ? [avoid.x * 1.9, avoid.z * 1.9] : undefined }))
  }
  return (
    <group position={[cell.x, 0, cell.z]}>
      <Furniture type={cell.cellType} mood={scene.mood} colour={colour} />
      {figures.map((f, i) => (
        <Figure key={i} {...f} mood={scene.mood} />
      ))}
      {scene.mood === 'neglect' && <Dust count={90} />}
      {scene.mood === 'loss' && <Dust count={25} colour="#cfdbe6" />}
      {cell.cellType === 'bathroom' && scene.mood === 'harmony' && <Dust count={40} colour="#ffffff" rise />}
      {scene.mood === 'tension' && <WallShadow />}
      {scene.coin && <Coin player={player} onReach={() => onCoin(cell.id)} />}
    </group>
  )
}

// A small pool of lights that follow the visitor: the nearest rooms get their scene light.
export function LightPool({ cells, scenes, player, lamps, timeInRoom }) {
  const lights = useRef([])
  const assigned = useRef([])
  const lastCell = useRef('')
  useFrame(({ clock }) => {
    const p = player.current
    const here = `${Math.floor(p.x / S)},${Math.floor(p.z / S)}`
    if (here !== lastCell.current || !assigned.current.length) {
      lastCell.current = here
      assigned.current = [...cells].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, lights.current.length)
    }
    const t = clock.elapsedTime
    lights.current.forEach((l, i) => {
      const c = assigned.current[i]
      if (!l) return
      if (!c) {
        l.intensity = 0
        return
      }
      const sc = scenes[c.id]
      const base = sc?.light ?? { colour: '#e9dcc4', intensity: 0.7 }
      let k = base.intensity * (lamps ? 1.25 : 1)
      let x = c.x
      let z = c.z
      if (sc?.mood === 'tension') {
        x += Math.cos(t * 0.6) * 1.1
        z += Math.sin(t * 0.6) * 1.1
      }
      if (sc?.flicker || sc?.mood === 'neglect') k *= Math.random() < 0.06 ? 0.3 : 1
      if (sc?.mood === 'loss' && timeInRoom.current.id === c.id) k *= Math.max(0.3, 1 - (t - timeInRoom.current.t) / 14)
      if (c.cellType === 'garden') k *= 1.4
      l.position.set(x, c.cellType === 'garden' ? 3.6 : 2.6, z)
      l.color.set(lamps && sc?.mood !== 'neglect' ? new THREE.Color(base.colour).lerp(new THREE.Color('#ffcf8a'), 0.25) : base.colour)
      l.intensity = k * 6
    })
  })
  return Array.from({ length: 6 }, (_, i) => <pointLight key={i} ref={(el) => (lights.current[i] = el)} distance={7.5} decay={1.6} intensity={0} />)
}
