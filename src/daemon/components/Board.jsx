import { memo } from 'react'
import { GRID, centroid, cellsOf } from '../engine/layout.js'
import { footprint } from '../engine/rooms.js'
import { RoomDefs, RoomShape } from './RoomGlyph.jsx'
import { FigureOver, FigureUnder } from './VastuPurusha.jsx'
import { zoneBounds } from '../vastu/assess.js'
import { WINGS } from '../progress/house.js'
import { byId as UPGRADE } from '../progress/upgrades.js'

// Board geometry, in SVG units. The 6 × 6 house grid sits inside the circular table, at the
// same overall size as before, so the Vastu Purusha figure and the zones stay aligned.
export const HALF = 279
export const CELL = (HALF * 2) / GRID // 93
export const R_TABLE = 470
const cx = (c) => -HALF + c * CELL
const LETTERS = 'ABCDEF'

const MOOD_COLOUR = {
  coherent: 'var(--gold)',
  tense: 'var(--terracotta)',
  unstable: 'var(--teal)',
  loss: 'var(--mist)',
}

// Convert a pointer position to board units and grid cells.
export function pointerToBoard(svg, clientX, clientY) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const p = pt.matrixTransform(svg.getScreenCTM().inverse())
  return { x: p.x, y: p.y, gx: (p.x + HALF) / CELL, gy: (p.y + HALF) / CELL, r: Math.hypot(p.x, p.y) }
}

// Screen position of a board point (for coin particles and the enter transition).
export function boardToScreen(svg, x, y) {
  const pt = svg.createSVGPoint()
  pt.x = x
  pt.y = y
  const p = pt.matrixTransform(svg.getScreenCTM())
  return { x: p.x, y: p.y }
}

// The static engraving: rings, compass, mandala grid. Drawn once.
const Engraving = memo(function Engraving({ zoneNames }) {
  const ticks = []
  for (let i = 0; i < 360; i += 5) {
    const major = i % 45 === 0
    const a = ((i - 90) * Math.PI) / 180
    const r1 = 452
    const r2 = major ? 432 : i % 15 === 0 ? 442 : 447
    ticks.push(<line key={i} className={major ? 'tick major' : 'tick'} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} />)
  }
  const lines = []
  for (let i = 0; i <= GRID; i++) {
    const p = cx(i)
    const strong = i % 2 === 0
    lines.push(<line key={`v${i}`} className={strong ? 'grid strong' : 'grid'} x1={p} y1={-HALF} x2={p} y2={HALF} />)
    lines.push(<line key={`h${i}`} className={strong ? 'grid strong' : 'grid'} x1={-HALF} y1={p} x2={HALF} y2={p} />)
  }
  const dirs = [
    ['NORTH', 0, -408],
    ['EAST', 408, 0],
    ['SOUTH', 0, 408],
    ['WEST', -408, 0],
  ]
  return (
    <g className="engraving">
      <circle className="ring outer" r={R_TABLE} />
      <circle className="ring" r={456} />
      <circle className="ring" r={426} />
      <circle className="ring faint" r={HALF * Math.SQRT2 + 4} />
      <circle className="ring faint" r={HALF * 1.12} />
      {ticks}
      {dirs.map(([label, x, y]) => (
        <text key={label} className="dir" x={x} y={y} transform={label === 'EAST' ? `rotate(90 ${x} ${y})` : label === 'WEST' ? `rotate(-90 ${x} ${y})` : undefined}>
          {label}
        </text>
      ))}
      {[
        ['NE', 45],
        ['SE', 135],
        ['SW', 225],
        ['NW', 315],
      ].map(([label, deg]) => {
        const a = ((deg - 90) * Math.PI) / 180
        return (
          <text key={label} className="dir minor" x={Math.cos(a) * 463} y={Math.sin(a) * 463}>
            {label}
          </text>
        )
      })}
      <path className="north-arrow" d="M0 -470 L-7 -486 L0 -481 L7 -486 Z" />
      {/* the mandala's rings: outer ring of 20 cells, inner ring of 12, Brahmasthan of 4 */}
      <rect className="band ring-outer" x={-HALF} y={-HALF} width={HALF * 2} height={HALF * 2} />
      <rect className="band ring-human" x={cx(1)} y={cx(1)} width={CELL * 4} height={CELL * 4} />
      <rect className="centre-field" x={cx(2)} y={cx(2)} width={CELL * 2} height={CELL * 2} />
      {lines}
      <line className="diag" x1={-HALF} y1={-HALF} x2={HALF} y2={HALF} />
      <line className="diag" x1={HALF} y1={-HALF} x2={-HALF} y2={HALF} />
      <line className="sutra" x1={0} y1={-HALF} x2={0} y2={HALF} />
      <line className="sutra" x1={-HALF} y1={0} x2={HALF} y2={0} />
      {[CELL, CELL * 2, HALF].flatMap((d) =>
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => <circle key={`${d}${sx}${sy}`} className="marma" cx={d * sx} cy={d * sy} r={2.6} />),
      )}
      <circle className="ring faint" r={CELL} />
      <circle className="ring faint" r={CELL * 0.5} />
      {zoneNames && (
        <g className="zone-names">
          {[
            ['ISHANYA', 45, 45],
            ['AGNEYA', 135, -45],
            ['NAIRITYA', 225, 45],
            ['VAYAVYA', 315, -45],
          ].map(([label, deg, rot]) => {
            const a = ((deg - 90) * Math.PI) / 180
            const x = Math.cos(a) * 418
            const y = Math.sin(a) * 418
            return (
              <text key={label} className="zone-name" x={x} y={y} transform={`rotate(${rot} ${x} ${y})`}>
                {label}
              </text>
            )
          })}
          <text className="zone-name minor" x={0} y={-384}>UTTARA · KUBERA</text>
          <text className="zone-name minor" x={0} y={388}>DAKSHINA · YAMA</text>
          <text className="zone-name minor" x={386} y={0} transform="rotate(90 386 0)">PURVA · INDRA</text>
          <text className="zone-name minor" x={-386} y={0} transform="rotate(-90 -386 0)">PASCHIMA · VARUNA</text>
        </g>
      )}
      {[...LETTERS].map((l, i) => (
        <text key={l} className="coord" x={cx(i) + CELL / 2} y={-HALF - 9}>
          {l}
        </text>
      ))}
      {[...LETTERS].map((_, i) => (
        <text key={i} className="coord" x={-HALF - 12} y={cx(i) + CELL / 2 + 3}>
          {i + 1}
        </text>
      ))}
      <text className="annot" x={HALF + 6} y={HALF + 14} textAnchor="end">
        6 × 6 HOUSE GRID · 1 CELL = 1 ROOM
      </text>
      <text className="annot" x={0} y={cx(2) + 12}>
        BRAHMASTHAN
      </text>
      <text className="annot" x={-HALF - 6} y={HALF + 14} textAnchor="start">
        VASTU PURUSHA · ILLUSTRATIVE
      </text>
    </g>
  )
})

// Built, unbuilt (locked) and free cells; wing labels with their price.
function Ground({ usable, occupied, dragging, neglected, stabilised }) {
  const cells = []
  for (let c = 0; c < GRID; c++) {
    for (let r = 0; r < GRID; r++) {
      const k = `${c},${r}`
      const open = usable(c, r)
      const cls = !open ? 'cell-locked' : occupied.has(k) ? 'cell-occupied' : dragging ? 'cell-free target' : 'cell-free'
      cells.push(<rect key={k} className={`cell ${cls}`} x={cx(c) + 1.5} y={cx(r) + 1.5} width={CELL - 3} height={CELL - 3} rx={3} />)
    }
  }
  const wingLabels = Object.entries(WINGS)
    .filter(([, w]) => !usable(w.cells[0][0], w.cells[0][1]))
    .map(([id, w]) => {
      const xs = w.cells.map(([c]) => cx(c) + CELL / 2)
      const ys = w.cells.map(([, r]) => cx(r) + CELL / 2)
      const x = (Math.min(...xs) + Math.max(...xs)) / 2
      const y = (Math.min(...ys) + Math.max(...ys)) / 2
      const vertical = w.zone === 'E' || w.zone === 'W'
      return (
        <text key={id} className="wing-label" x={x} y={y} transform={vertical ? `rotate(${w.zone === 'E' ? 90 : -90} ${x} ${y})` : undefined}>
          {w.label.toUpperCase()} · UNBUILT · {UPGRADE[`wing-${id}`].cost} ◉
        </text>
      )
    })
  const zoneRect = (z, cls, label) => {
    const b = zoneBounds(z)
    return (
      <g key={`${cls}${z}`} className={cls}>
        <rect x={cx(b.col) + 3} y={cx(b.row) + 3} width={CELL * b.w - 6} height={CELL * b.h - 6} rx={4} />
        {label && (
          <text x={cx(b.col) + (CELL * b.w) / 2} y={cx(b.row) + CELL * b.h - 10}>
            {label}
          </text>
        )}
      </g>
    )
  }
  return (
    <g className="ground" aria-hidden="true">
      {cells}
      {wingLabels}
      {neglected.map((z) => zoneRect(z, 'neglect', 'NEGLECTED'))}
      {stabilised.map((z) => {
        const b = zoneBounds(z)
        const x0 = cx(b.col) + 4
        const y0 = cx(b.row) + 4
        const x1 = cx(b.col + b.w) - 4
        const y1 = cx(b.row + b.h) - 4
        const L = 14
        return (
          <path
            key={`s${z}`}
            className="brace"
            d={`M${x0} ${y0 + L}V${y0}H${x0 + L} M${x1 - L} ${y0}H${x1}V${y0 + L} M${x1} ${y1 - L}V${y1}H${x1 - L} M${x0 + L} ${y1}H${x0}V${y1 - L}`}
          />
        )
      })}
    </g>
  )
}

// The zones touched by the room in focus.
function ZoneHighlights({ focus }) {
  if (!focus) return null
  const rect = (zone, cls) => {
    const b = zoneBounds(zone)
    return <rect key={zone} className={cls} x={cx(b.col)} y={cx(b.row)} width={CELL * b.w} height={CELL * b.h} />
  }
  return (
    <g className="zone-highlights" aria-hidden="true">
      {focus.secondary.map((z) => rect(z, 'zone-hl secondary'))}
      {rect(focus.primary, `zone-hl primary status-${focus.status}`)}
    </g>
  )
}

export default function Board({
  svgRef,
  rooms,
  analysis,
  view,
  selectedId,
  drag,
  preview,
  ripples,
  light,
  glow,
  vastu,
  house,
  usable,
  entering,
  onRoomPointerDown,
  onBackgroundPointerDown,
  onRotate,
  onRemove,
}) {
  const unstable = view.started && (view.confusion > 0.55 || view.mood.unstable > 0.4)
  const marks = view.roomMarks
  const roomMoods = view.interpretation?.roomMoods ?? {}
  const byId = new Map(rooms.map((r) => [r.id, r]))
  const centre = (r) => {
    const c = centroid(r)
    return { x: -HALF + c.x * CELL, y: -HALF + c.y * CELL }
  }
  const draggingId = drag?.id
  const silence = view.started && !view.dormant ? Math.min(1, view.timeSinceActivity / view.silenceThreshold) : view.dormant && view.started ? 1 : 0
  const phantom = view.phantom
  const linkHidden = (p) => phantom?.kind === 'hidden' && ((phantom.a === p.a && phantom.b === p.b) || (phantom.a === p.b && phantom.b === p.a))
  const occupied = new Set(rooms.filter((r) => r.id !== draggingId).flatMap((r) => cellsOf(r).map(([c, rr]) => `${c},${rr}`)))
  const basinShown = house.features.basin && analysis.centreCells === 0

  return (
    <svg
      ref={svgRef}
      className={`board ${unstable ? 'is-unstable' : ''} ${view.dormant ? 'is-dormant' : ''} ${!view.started ? 'is-idle' : ''} outcome-${view.outcome}`}
      viewBox="-500 -500 1000 1000"
      onPointerDown={onBackgroundPointerDown}
      style={{ '--light': light, '--glow': glow }}
      role="application"
      aria-label="Circular architectural board with a 6 by 6 house grid. Drag rooms onto the grid."
    >
      <RoomDefs />
      <defs>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.14  0 0 0 0 0.15  0 0 0 0 0.13  0 0 0 0.07 0" />
        </filter>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(480)">
          <stop offset="0" stopColor={glow} stopOpacity="0.5" />
          <stop offset="0.55" stopColor={glow} stopOpacity="0.16" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="table" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(480)">
          <stop offset="0" style={{ stopColor: 'var(--table-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--table-2)' }} />
        </radialGradient>
        <pattern id="locked-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: 'var(--gold)' }} strokeWidth="1" strokeOpacity="0.35" />
        </pattern>
        <pattern id="dust" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="0.9" fill="#77746d" fillOpacity="0.5" />
          <circle cx="10" cy="9" r="0.7" fill="#77746d" fillOpacity="0.4" />
          <path d="M0 13 L5 10" stroke="#77746d" strokeOpacity="0.35" strokeWidth="0.7" />
        </pattern>
        <filter id="pr-distort" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="2" seed="4" result="noise">
            <animate attributeName="baseFrequency" values="0.03;0.06;0.025;0.03" dur="0.7s" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" />
        </filter>
        <clipPath id="table-clip">
          <circle r={R_TABLE} />
        </clipPath>
      </defs>

      <circle r={R_TABLE + 14} className="table-edge" />
      <circle r={R_TABLE} fill="url(#table)" />
      <g clipPath="url(#table-clip)">
        <circle className="ambient" r={R_TABLE} fill="url(#glow)" />
        <rect x={-500} y={-500} width={1000} height={1000} filter="url(#grain)" />
      </g>

      <Engraving zoneNames={vastu.showZoneNames} />
      <Ground usable={usable} occupied={occupied} dragging={!!drag} neglected={house.neglected} stabilised={house.stabilised} />
      <ZoneHighlights focus={vastu.focus} />
      {vastu.showFigure && <FigureUnder states={vastu.states} />}

      {/* the courtyard basin, while the centre is open */}
      {basinShown && (
        <g className="basin" aria-hidden="true">
          <circle r={CELL * 0.62} className="basin-rim" />
          <circle r={CELL * 0.5} className="basin-water" />
          <circle r={CELL * 0.3} className="basin-ripple" />
          <circle r={CELL * 0.18} className="basin-ripple late" />
        </g>
      )}

      {/* the centre pulse: the house's heartbeat, as strong as its activity */}
      <circle className="centre-pulse" r={CELL * 0.4} />

      {/* silence gathering around the perimeter */}
      <circle className={`silence-arc ${silence > 0.5 ? 'late' : ''}`} r={477} pathLength={1} strokeDasharray={`${silence} 1`} transform="rotate(-90)" />

      {/* the house's wiring: every room is connected to the system at the centre */}
      <g className="wiring">
        {rooms.map((r) => {
          if (r.id === draggingId || r.dormant) return null
          const c = centre(r)
          return <line key={r.id} x1={0} y1={0} x2={c.x} y2={c.y} />
        })}
      </g>

      {/* connections: shared walls (doors) and open doorways (corridors) */}
      <g className="links">
        {analysis.pairs.map((p) => {
          if (p.a === draggingId || p.b === draggingId) return null
          const a = byId.get(p.a)
          const b = byId.get(p.b)
          if (!a || !b) return null
          const ca = centre(a)
          const cb = centre(b)
          const disturbed = marks[p.a]?.mark === 'disturbed' || marks[p.b]?.mark === 'disturbed'
          const faded = marks[p.a]?.mark === 'fading' || marks[p.b]?.mark === 'fading' || a.dormant || b.dormant
          const mid = p.edges[Math.floor(p.edges.length / 2)]
          const dx = cx(mid.c + 1)
          const dy = cx(mid.r + 1)
          const door = mid.dc ? [dx, dy - CELL * 0.68, dx, dy - CELL * 0.32] : [dx - CELL * 0.68, dy, dx - CELL * 0.32, dy]
          return (
            <g key={`${p.a}|${p.b}`} className={`link ${p.kind} ${disturbed ? 'disturbed' : ''} ${faded ? 'faded' : ''} ${linkHidden(p) ? 'hidden' : ''}`}>
              <line x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} />
              {p.kind === 'door' && <line className="door" x1={door[0]} y1={door[1]} x2={door[2]} y2={door[3]} />}
            </g>
          )
        })}
        {phantom?.kind === 'ghost' && byId.get(phantom.a) && byId.get(phantom.b) && (
          <line className="phantom" x1={centre(byId.get(phantom.a)).x} y1={centre(byId.get(phantom.a)).y} x2={centre(byId.get(phantom.b)).x} y2={centre(byId.get(phantom.b)).y} />
        )}
      </g>

      {/* drop preview */}
      {preview && (
        <rect
          className={`preview ${preview.valid ? 'valid' : 'invalid'}`}
          x={cx(preview.col)}
          y={cx(preview.row)}
          width={footprint(preview.type, preview.rotation).w * CELL}
          height={footprint(preview.type, preview.rotation).h * CELL}
          rx={4}
        />
      )}

      {/* rooms */}
      <g className="rooms">
        {rooms.map((r) => {
          const mark = marks[r.id]?.mark
          const mood = roomMoods[r.id]
          const isDragged = r.id === draggingId
          return (
            <g
              key={r.id}
              className={`room ${mark ? `is-${mark}` : ''} ${mood ? `mood-${mood}` : ''} ${selectedId === r.id ? 'is-selected' : ''} ${isDragged ? 'is-origin' : ''} ${r.dormant ? 'is-dormant-room' : ''} ${r.gilded ? 'is-gilded' : ''} ${entering === r.id ? 'is-entering' : ''}`}
              transform={`translate(${cx(r.col)} ${cx(r.row)})`}
              style={{ '--mood': mood ? MOOD_COLOUR[mood] : 'transparent' }}
              onPointerDown={(e) => onRoomPointerDown(e, r)}
            >
              <g className="room-lift">
                <RoomShape room={r} cell={CELL} />
                <rect className="room-mood" x={CELL * 0.07} y={CELL * 0.07} width={CELL * 0.86} height={CELL * 0.86} rx={4} />
              </g>
            </g>
          )
        })}
      </g>

      {/* the figure's contour and its responses, over the rooms but never catching the pointer */}
      {vastu.showFigure && <FigureOver states={vastu.states} hover={vastu.hover} reaction={vastu.reaction} />}

      {vastu.suggestion && (
        <g className="suggestion" aria-hidden="true">
          <rect x={cx(vastu.suggestion.col) + 3} y={cx(vastu.suggestion.row) + 3} width={CELL - 6} height={CELL - 6} rx={4} />
          <text x={cx(vastu.suggestion.col) + 6} y={cx(vastu.suggestion.row) - 5}>
            SUGGESTED
          </text>
        </g>
      )}

      {/* selected room controls */}
      {selectedId && byId.get(selectedId) && !drag && (() => {
        const r = byId.get(selectedId)
        const x = cx(r.col) + CELL - 2
        const y = cx(r.row) + 4
        return (
          <g className="room-tools" transform={`translate(${x} ${y})`}>
            <g className="tool" onPointerDown={(e) => (e.stopPropagation(), onRotate(r.id))}>
              <title>Turn (R)</title>
              <circle r={13} cx={-36} cy={-16} />
              <path transform="translate(-43 -23)" d="M11 4.5a5.5 5.5 0 1 1-5.3 4 M5.5 3.5v5h5" />
            </g>
            <g className="tool" onPointerDown={(e) => (e.stopPropagation(), onRemove(r.id))}>
              <title>Remove (Delete)</title>
              <circle r={13} cx={-6} cy={-16} />
              <path transform="translate(-13 -23)" d="M3.5 3.5l7 7 M10.5 3.5l-7 7" />
            </g>
          </g>
        )
      })()}

      {/* the house's underlying system */}
      <g className="core">
        <circle className="core-halo" r={18 + view.activity * 26} />
        <circle className="core-ring" r={11} />
        <circle className="core-dot" r={4.5} />
      </g>

      <g className="ripples">
        {ripples.map((rp) => (
          <circle key={rp.id} className={`ripple ${rp.kind}`} cx={rp.x ?? 0} cy={rp.y ?? 0} r={rp.r ?? 60} />
        ))}
      </g>

      {view.started && view.dormant && (
        <text className="annot listening" x={0} y={352}>
          THE BUILDING IS LISTENING
        </text>
      )}
    </svg>
  )
}

export function roomCentrePx(room) {
  const cells = cellsOf(room)
  const c = cells.reduce((acc, [x, y]) => ({ x: acc.x + x + 0.5, y: acc.y + y + 0.5 }), { x: 0, y: 0 })
  return { x: -HALF + (c.x / cells.length) * CELL, y: -HALF + (c.y / cells.length) * CELL }
}
