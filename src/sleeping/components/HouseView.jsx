import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  IDEAL, OBJECTS, OPENINGS, ROOMS, SIZE, WINDOWS, along, roomCorners, roomPoint, sharedWall, sideSegment,
} from '../house/plan.js'
import { explodeOffset } from '../house/bodyMap.js'
import { COMFORT, DRAFT } from '../house/environment.js'

// The architectural plan: the main stage. Everything drawn here represents physical phenomena
// in the house (heat, moving air, sound, tremor, scent). He never sees any of it.

const WALL_OUT = 0.26
const WALL_IN = 0.14
const GAP = { door: 1.1, arch: 1.9, window: 1.4, frontdoor: 1.3, lantern: 0 }
const INITIAL_VIEW = { x: SIZE / 2, y: SIZE / 2, w: 24 }
const SPAN = 21.5 // the house and its compass letters, in metres

// Fit the house into the stage, beside the objective panel when there is room for both.
function fitView(svg) {
  const { width: W, height: H } = svg.getBoundingClientRect()
  if (!W || !H) return INITIAL_VIEW
  const inset = W > 1000 ? 400 : 0
  const avail = W - inset - 24
  const scale = Math.min(avail / SPAN, H / SPAN)
  const w = Math.min(W, H) / scale
  const x = SIZE / 2 - (inset + 12 + avail / 2 - W / 2) / scale
  return { x, y: SIZE / 2, w }
}

// SVG text below ~1px renders with broken spacing, so labels are drawn at 50× and scaled down.
function Label({ x, y, className, children }) {
  return (
    <text className={className} transform={`translate(${x} ${y}) scale(0.02)`}>
      {children}
    </text>
  )
}

const pts = (list) => list.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v) => Math.hypot(v.x, v.y)

// Every wall segment of the lattice, with the openings that pierce it.
function walls(lattice, env) {
  const list = []
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const byKey = {}
  const add = (a, b, outer) => {
    const k = key(a, b)
    if (!byKey[k]) {
      byKey[k] = { a, b, outer, gaps: [] }
      list.push(byKey[k])
    }
    return byKey[k]
  }
  for (const room of ROOMS) {
    const [nw, ne, se, sw] = roomCorners(room)
    add(nw, ne, room.row === 0)
    add(ne, se, room.col === 2)
    add(sw, se, room.row === 2)
    add(nw, sw, room.col === 0)
  }
  const edgeOf = (room, side) => {
    const [nw, ne, se, sw] = roomCorners(room)
    return { N: [nw, ne], E: [ne, se], S: [sw, se], W: [nw, sw] }[side]
  }
  for (const o of OPENINGS) {
    const sw = sharedWall(o.a, o.b, lattice)
    const room = ROOMS.find((r) => r.id === o.a)
    const [a, b] = edgeOf(room, sw.side)
    byKey[key(a, b)].gaps.push({ t: o.t, kind: o.kind, id: o.id, open: o.kind === 'arch' || env.doors[o.id], opening: o })
  }
  for (const w of WINDOWS) {
    if (w.side === 'roof') continue
    const room = ROOMS.find((r) => r.id === w.room)
    const [a, b] = edgeOf(room, w.side)
    byKey[key(a, b)].gaps.push({ t: w.t, kind: w.kind ?? 'window', id: w.id, open: env.windows[w.id], window: w })
  }
  return list
}

function Wall({ wall, lattice, onToggle, time }) {
  const p = lattice[wall.a]
  const q = lattice[wall.b]
  const L = len(sub(q, p))
  const dir = { x: (q.x - p.x) / L, y: (q.y - p.y) / L }
  const nrm = { x: -dir.y, y: dir.x }
  const gaps = [...wall.gaps].sort((a, b) => a.t - b.t)
  const pieces = []
  let from = 0
  for (const g of gaps) {
    const half = GAP[g.kind] / 2 / L
    pieces.push([from, g.t - half])
    from = g.t + half
  }
  pieces.push([from, 1])
  const at = (k) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k })
  return (
    <g>
      {pieces.map(([a, b], i) =>
        b > a ? (
          <line key={i} className={wall.outer ? 'wall outer' : 'wall'} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} strokeWidth={wall.outer ? WALL_OUT : WALL_IN} />
        ) : null,
      )}
      {gaps.map((g) => {
        const half = GAP[g.kind] / 2 / L
        const s = at(g.t - half)
        const e = at(g.t + half)
        const c = at(g.t)
        if (g.kind === 'arch') return <g key={g.id}><circle className="jamb" cx={s.x} cy={s.y} r={0.09} /><circle className="jamb" cx={e.x} cy={e.y} r={0.09} /></g>
        if (g.kind === 'window') {
          // A window: two thin panes in the wall; open, the sashes swing outward.
          const out = wall.outer ? sideOut(g.window, nrm) : nrm
          const sway = g.open ? Math.sin(time * 2.3 + g.t * 9) * 0.06 : 0
          return (
            <g key={g.id} className={`window ${g.open ? 'open' : ''}`} onClick={(ev) => { ev.stopPropagation(); onToggle({ type: 'toggleWindow', id: g.id }) }}>
              <rect className="hit" x={c.x - 0.8} y={c.y - 0.8} width={1.6} height={1.6} />
              {g.open ? (
                <>
                  <line className="pane" x1={s.x} y1={s.y} x2={s.x + out.x * 0.55 + dir.x * 0.2} y2={s.y + out.y * (0.55 + sway) + dir.y * 0.2} />
                  <line className="pane" x1={e.x} y1={e.y} x2={e.x + out.x * 0.55 - dir.x * 0.2} y2={e.y + out.y * (0.55 - sway) - dir.y * 0.2} />
                </>
              ) : (
                <>
                  <line className="pane" x1={s.x + nrm.x * 0.05} y1={s.y + nrm.y * 0.05} x2={e.x + nrm.x * 0.05} y2={e.y + nrm.y * 0.05} />
                  <line className="pane" x1={s.x - nrm.x * 0.05} y1={s.y - nrm.y * 0.05} x2={e.x - nrm.x * 0.05} y2={e.y - nrm.y * 0.05} />
                </>
              )}
            </g>
          )
        }
        // Doors (and the front door): a leaf hinged at one jamb, swung open with its arc.
        const out = g.kind === 'frontdoor' ? sideOut(g.window, nrm) : nrm
        const w = GAP[g.kind]
        const leafEnd = g.open ? { x: s.x + out.x * w * 0.95 + dir.x * w * 0.1, y: s.y + out.y * w * 0.95 + dir.y * w * 0.1 } : e
        return (
          <g key={g.id} className={`door ${g.open ? 'open' : ''} ${g.kind}`} onClick={(ev) => { ev.stopPropagation(); onToggle(g.kind === 'frontdoor' ? { type: 'toggleWindow', id: g.id } : { type: 'toggleDoor', id: g.id }) }}>
            <rect className="hit" x={c.x - 0.8} y={c.y - 0.8} width={1.6} height={1.6} />
            {g.open && <path className="swing" d={`M ${leafEnd.x} ${leafEnd.y} A ${w} ${w} 0 0 ${out.x * dir.y - out.y * dir.x > 0 ? 1 : 0} ${e.x} ${e.y}`} />}
            <line className="leaf" x1={s.x} y1={s.y} x2={leafEnd.x} y2={leafEnd.y} />
            <circle className="jamb" cx={s.x} cy={s.y} r={0.08} />
          </g>
        )
      })}
    </g>
  )
}

function sideOut(w, nrm) {
  const o = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }[w.side]
  return o ?? nrm
}

// ---------- objects ----------

function ObjectGlyph({ o, st, p, onAct, phoneRinging, time }) {
  const active = st.on || (o.kind === 'phone' && phoneRinging) || (o.kind === 'incense' && st.sticks.length > 0)
  const act = (ev) => {
    ev.stopPropagation()
    const a = objectAction(o, st, phoneRinging)
    if (a) onAct(a)
  }
  let body = null
  switch (o.kind) {
    case 'radiator':
      body = (
        <g>
          <rect className="obj-line" x={-0.6} y={-0.16} width={1.2} height={0.32} rx={0.05} />
          {[0, 1, 2].map((i) => (
            <line key={i} className={i < st.level ? 'fin on' : 'fin'} x1={-0.35 + i * 0.35} y1={-0.1} x2={-0.35 + i * 0.35} y2={0.1} />
          ))}
        </g>
      )
      break
    case 'stove':
      body = (
        <g>
          <rect className="obj-line" x={-0.45} y={-0.45} width={0.9} height={0.9} rx={0.08} />
          {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, y], i) => (
            <circle key={i} className={st.on && i === 0 ? 'burner on' : 'burner'} cx={x} cy={y} r={0.12} />
          ))}
        </g>
      )
      break
    case 'extractor':
      body = (
        <g transform={st.on ? `rotate(${(time * 400) % 360})` : undefined}>
          <circle className="obj-line" r={0.3} />
          <path className="obj-line" d="M -0.2 -0.2 L 0.2 0.2 M -0.2 0.2 L 0.2 -0.2" />
        </g>
      )
      break
    case 'phone':
      body = (
        <g>
          <rect className="obj-line" x={-0.3} y={-0.22} width={0.6} height={0.44} rx={0.12} />
          <circle className={phoneRinging ? 'dot on' : 'dot'} r={0.08} />
        </g>
      )
      break
    case 'speaker':
      body = (
        <g>
          <rect className="obj-line" x={-0.3} y={-0.3} width={0.6} height={0.6} rx={0.06} />
          <circle className={st.on ? 'dot on' : 'dot'} r={0.14} />
        </g>
      )
      break
    case 'knocker':
      body = <circle className="obj-line" r={0.16} />
      break
    case 'heavy':
      body = <rect className="obj-line heavy" x={-0.75} y={-0.35} width={1.5} height={0.7} />
      break
    case 'machine':
      body = (
        <g>
          <rect className="obj-line" x={-0.38} y={-0.38} width={0.76} height={0.76} rx={0.06} />
          <circle className="obj-line" r={0.22} />
          {st.on && <line className="spin" x1={0} y1={0} x2={Math.cos(time * (st.disruptive ? 13 : 6)) * 0.2} y2={Math.sin(time * (st.disruptive ? 13 : 6)) * 0.2} />}
        </g>
      )
      break
    case 'incense':
      body = (
        <g>
          <line className="obj-line" x1={0} y1={0.25} x2={0} y2={-0.25} />
          <circle className={st.sticks.length ? 'dot on' : 'dot'} cy={-0.27} r={0.06} />
        </g>
      )
      break
    case 'flowers':
      body = (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} className={st.on ? 'petal on' : 'petal'} cx={Math.cos((i * 2 * Math.PI) / 5) * 0.16} cy={Math.sin((i * 2 * Math.PI) / 5) * 0.16} r={0.08} />
          ))}
        </g>
      )
      break
    default:
      break
  }
  return (
    <g className={`object kind-${o.kind} ${active ? 'active' : ''}`} transform={`translate(${p.x} ${p.y})`} onClick={act}>
      <circle className="hit" r={0.7} />
      {body}
      {active && o.kind !== 'radiator' && <circle className="active-ring" r={0.62} />}
    </g>
  )
}

function objectAction(o, st, phoneRinging) {
  switch (o.kind) {
    case 'radiator':
      return { type: 'setRadiator', id: o.id, level: (st.level + 1) % 4 }
    case 'phone':
      return { type: 'phone' }
    case 'knocker':
      return { type: 'knock' }
    case 'heavy':
      return { type: 'shift', id: o.id }
    case 'incense':
      return { type: 'incense' }
    case 'flowers':
      return { type: 'flowers' }
    default:
      return { type: 'toggle', id: o.id }
  }
}

// ---------- phenomena ----------

function Phenomena({ env, lattice, roomPolys, fx, time, now }) {
  const out = []
  for (const room of ROOMS) {
    const r = env.rooms[room.id]
    const poly = roomPolys[room.id]
    const c = roomPoint(room, lattice, 0.5, 0.5)
    // heat: wavering lines rising; cold: a fine grain settling
    const hot = Math.max(0, (r.felt - 22) / 6)
    const cold = Math.max(0, (COMFORT.lo + 1 - r.felt) / 7)
    if (hot > 0.05) {
      for (let i = 0; i < 4; i++) {
        const u = 0.2 + i * 0.2
        const base = roomPoint(room, lattice, u, 0.8)
        const k = (time * 0.25 + i * 0.27) % 1
        const y0 = base.y - k * 3.2
        let d = `M ${base.x} ${y0}`
        for (let s = 1; s <= 6; s++) d += ` L ${base.x + Math.sin(time * 2 + s + i) * 0.18} ${y0 - s * 0.35}`
        out.push(<path key={`h${room.id}${i}`} className="heat" d={d} opacity={Math.min(0.7, hot) * Math.sin(k * Math.PI)} />)
      }
    }
    if (cold > 0.05) out.push(<polygon key={`c${room.id}`} className="cold" points={poly} opacity={Math.min(0.85, cold * 1.4)} />)
    // moving air: particles streaming with the flow
    const m = r.air.mag
    if (m > 0.035) {
      const n = Math.min(14, Math.round(m * 40) + 2)
      const dir = { x: r.air.vx / m, y: r.air.vy / m }
      for (let i = 0; i < n; i++) {
        const seed = (i * 0.618 + room.col * 0.31 + room.row * 0.17) % 1
        const across = (seed - 0.5) * 4.2
        const k = ((time * (0.4 + m * 2) + i / n) % 1) - 0.5
        const x = c.x + dir.x * k * 5 - dir.y * across
        const y = c.y + dir.y * k * 5 + dir.x * across
        out.push(
          <line key={`a${room.id}${i}`} className={m > DRAFT ? 'air draft' : 'air'} x1={x} y1={y} x2={x - dir.x * (0.25 + m)} y2={y - dir.y * (0.25 + m)} opacity={Math.sin((k + 0.5) * Math.PI) * Math.min(1, m * 4)} />,
        )
      }
    }
    // scent: slow particles drifting
    for (const [type, conc] of Object.entries(r.scent)) {
      if (conc < 0.04) continue
      const n = Math.min(12, Math.round(conc * 16) + 1)
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + type.length
        const rad = 0.6 + ((i * 0.37) % 1) * 2
        const drift = time * 0.12 + i
        const x = c.x + Math.cos(a + drift * 0.3) * rad + (r.air.vx || 0) * Math.sin(drift) * 2
        const y = c.y + Math.sin(a + drift * 0.27) * rad * 0.85 + (r.air.vy || 0) * Math.sin(drift) * 2
        out.push(<circle key={`s${room.id}${type}${i}`} className={`scent scent-${type}`} cx={x} cy={y} r={type === 'smoke' ? 0.16 : 0.08} opacity={Math.min(0.8, conc * 1.2) * (0.5 + 0.5 * Math.sin(drift * 2))} />)
      }
    }
  }
  // sound: restrained arcs from every audible source (the hidden chime is not drawn)
  for (const s of env.sounds) {
    if (s.hidden || s.kind === 'hum' || s.kind === 'pipes') continue
    if (s.outside) continue
    const room = ROOMS.find((x) => x.id === s.room)
    const p = roomPoint(room, lattice, s.u ?? 0.5, s.v ?? 0.5)
    const age = env.t - s.start
    if (s.pattern === 'ring' && age % 4 > 1.6) continue
    for (let i = 0; i < 3; i++) {
      const k = ((age * 0.9 + i / 3) % 1)
      out.push(<circle key={`w${s.id}${i}`} className="wave" cx={p.x} cy={p.y} r={0.4 + k * (2 + s.level * 3)} opacity={(1 - k) * Math.min(1, s.level * 1.6)} />)
    }
  }
  // tremor: brief ripples spreading from where it started
  for (const e of fx) {
    if (e.type !== 'vibration') continue
    const age = now - e.t
    if (age > 1.4 || age < 0) continue
    const room = ROOMS.find((x) => x.id === e.room)
    const p = e.subtype === 'thunder' ? { x: SIZE / 2, y: SIZE / 2 } : roomPoint(room, lattice, 0.5, 0.5)
    for (let i = 0; i < 2; i++) {
      const k = Math.min(1, age / 1.4 + i * 0.15)
      out.push(<circle key={`v${e.id}${i}`} className="ripple" cx={p.x} cy={p.y} r={0.5 + k * (3 + e.intensity * 6)} opacity={(1 - k) * Math.min(1, e.intensity * 1.6)} />)
    }
  }
  return <g className="phenomena" pointerEvents="none">{out}</g>
}

// ---------- the view ----------

export default function HouseView({ world, lattice, regions, selected, onSelect, onAct, ending, time }) {
  const svgRef = useRef(null)
  const [view, setView] = useState(INITIAL_VIEW)
  const touched = useRef(false)
  const home = useRef(INITIAL_VIEW)
  const drag = useRef(null)
  const pointers = useRef(new Map())
  const env = world.env

  const toBoard = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }, [])

  const zoom = useCallback((factor, about) => {
    touched.current = true
    setView((v) => {
      const w = Math.max(6, Math.min(34, v.w * factor))
      const k = w / v.w
      const a = about ?? { x: v.x, y: v.y }
      return { w, x: a.x + (v.x - a.x) * k, y: a.y + (v.y - a.y) * k }
    })
  }, [])

  // Fit on load and on resize, until the visitor zooms or pans themselves.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const fit = () => {
      home.current = fitView(svg)
      if (!touched.current) setView(home.current)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    const onWheel = (e) => {
      e.preventDefault()
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, toBoard(e.clientX, e.clientY))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoom, toBoard])

  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, moved: false, view }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      drag.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), view, moved: true }
    }
  }
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const d = drag.current
    if (d.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const w = Math.max(6, Math.min(34, (d.view.w * d.pinch) / dist))
      setView({ ...d.view, w })
      return
    }
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    if (!d.moved) svgRef.current.setPointerCapture?.(e.pointerId)
    d.moved = true
    touched.current = true
    const scale = d.view.w / svgRef.current.getBoundingClientRect().width
    const s = Math.max(scale, d.view.w / svgRef.current.getBoundingClientRect().height)
    setView({ ...d.view, x: d.view.x - dx * s, y: d.view.y - dy * s })
  }
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setTimeout(() => (drag.current = null), 0)
  }
  const wasDrag = () => drag.current?.moved

  const onKeyDown = (e) => {
    const step = view.w * 0.08
    const pan = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (e.key === '+' || e.key === '=') zoom(1 / 1.15)
    else if (e.key === '-' || e.key === '_') zoom(1.15)
    else if (e.key === '0') {
      touched.current = false
      setView(home.current)
    } else if (pan) {
      touched.current = true
      setView((v) => ({ ...v, x: v.x + pan[0], y: v.y + pan[1] }))
    } else return
    e.preventDefault()
  }

  const explodeK = ending?.kind === 'awakened' ? ending.k : 0
  const roomPolys = {}
  const roomShift = {}
  for (const room of ROOMS) {
    const off = explodeOffset(room, explodeK)
    roomShift[room.id] = off
    roomPolys[room.id] = pts(roomCorners(room).map((k) => lattice[k]))
  }
  const restPts = []
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) restPts.push({ x: IDEAL[i], y: IDEAL[j] })
  const wallList = walls(lattice, env)
  const phoneRinging = !!(env.objects.phone.sound && env.t < env.objects.phone.sound.until)
  const guard = (fn) => (a) => {
    if (!wasDrag()) fn(a)
  }
  const vb = `${view.x - view.w / 2} ${view.y - view.w / 2} ${view.w} ${view.w}`
  const restoredGlow = ending?.kind === 'restored' ? ending.k : 0

  return (
    <div className="house-view">
      <svg
        ref={svgRef}
        className={`plan ${ending ? `ending-${ending.kind}` : ''}`}
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => !wasDrag() && onSelect(null)}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="application"
        aria-label="House plan. Arrow keys pan, plus and minus zoom, 0 resets. Number keys 1 to 9 select rooms."
      >
        <defs>
          <pattern id="frost" width="0.45" height="0.45" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <line x1="0" y1="0" x2="0" y2="0.45" className="frost-line" />
          </pattern>
        </defs>
        {/* the mandala beneath the house: 9 × 9 padas */}
        <g className="ground-mandala" opacity={0.5 + restoredGlow * 0.5}>
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i}>
              <line className={i % 3 === 0 ? 'm-line strong' : 'm-line'} x1={i * 2} y1={0} x2={i * 2} y2={SIZE} />
              <line className={i % 3 === 0 ? 'm-line strong' : 'm-line'} x1={0} y1={i * 2} x2={SIZE} y2={i * 2} />
            </g>
          ))}
          <rect className="m-centre" x={6} y={6} width={6} height={6} />
          {[['N', 9, -1.3], ['E', SIZE + 1.3, 9], ['S', 9, SIZE + 1.3], ['W', -1.3, 9]].map(([t, x, y]) => (
            <Label key={t} className="compass" x={x} y={y}>{t}</Label>
          ))}
        </g>
        {/* the plan at rest, faintly, so deformation reads */}
        <g className="rest-ghost">
          {ROOMS.map((room) => (
            <polygon key={room.id} points={pts(roomCorners(room).map((k) => restPts[k]))} />
          ))}
        </g>
        {ROOMS.map((room) => {
          const off = roomShift[room.id]
          const rs = regions?.[room.region]
          const lit = rs?.lit ?? 0
          const isSel = selected === room.id
          const c = roomPoint(room, lattice, 0.5, 0.5)
          const r = env.rooms[room.id]
          return (
            <g
              key={room.id}
              className={`room ${isSel ? 'selected' : ''}`}
              transform={explodeK ? `translate(${off.x} ${off.y}) rotate(${off.rot} ${c.x} ${c.y})` : undefined}
              onClick={(e) => {
                e.stopPropagation()
                if (!wasDrag()) onSelect(room.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(room.id)
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={isSel}
              aria-label={`${room.name}, ${Math.round(r.felt)} degrees felt`}
            >
              <polygon className={`floor floor-${r.floor}`} points={roomPolys[room.id]} />
              {lit > 0.02 && <polygon className="body-echo" points={roomPolys[room.id]} opacity={lit} />}
              {Math.abs(rs?.tension ?? 0) > 0.15 && <polygon className="tension-echo" points={roomPolys[room.id]} opacity={Math.min(0.6, Math.abs(rs.tension) * 0.6)} />}
              <Label className="room-name" x={c.x} y={c.y - 0.35}>{room.name}</Label>
              <Label className="room-temp" x={c.x} y={c.y + 0.55}>
                {r.felt.toFixed(1)}°{r.air.mag > DRAFT ? ' · draft' : ''}
              </Label>
            </g>
          )
        })}
        <Phenomena env={env} lattice={lattice} roomPolys={roomPolys} fx={world.fx} time={time} now={env.t} />
        <g className={`walls ${explodeK ? 'exploding' : ''}`}>
          {wallList.map((w, i) => (
            <Wall key={i} wall={w} lattice={lattice} onToggle={guard(onAct)} time={time} />
          ))}
          {/* the courtyard's roof lantern */}
          {(() => {
            const court = ROOMS.find((r) => r.id === 'court')
            const p = roomPoint(court, lattice, 0.5, 0.5)
            const open = env.windows.lantern
            return (
              <g className={`lantern ${open ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); if (!wasDrag()) onAct({ type: 'toggleWindow', id: 'lantern' }) }}>
                <rect className="hit" x={p.x - 1.4} y={p.y + 1.1} width={2.8} height={1.2} />
                <rect className="lantern-frame" x={p.x - 1.2} y={p.y + 1.3} width={2.4} height={0.8} strokeDasharray={open ? '0.2 0.2' : undefined} />
              </g>
            )
          })()}
        </g>
        <g className="objects">
          {OBJECTS.map((o) => {
            const room = ROOMS.find((r) => r.id === o.room)
            const p = o.kind === 'knocker' ? along(sideSegment(room, lattice, 'N'), 0.5) : roomPoint(room, lattice, o.u, o.v)
            return <ObjectGlyph key={o.id} o={o} st={env.objects[o.id]} p={o.kind === 'knocker' ? { x: p.x + 1.1, y: p.y - 0.5 } : p} onAct={guard(onAct)} phoneRinging={phoneRinging} time={time} />
          })}
        </g>
      </svg>
      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoom(1 / 1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { touched.current = false; setView(home.current) }} aria-label="Reset view">⟲</button>
      </div>
    </div>
  )
}
