import { ROOM_TYPES, ROOM_ORDER, footprint } from '../engine/rooms.js'

export const SHORT_LABEL = {
  living: 'Living',
  dining: 'Dining',
  prayer: 'Prayer',
  garden: 'Courtyard',
  staircase: 'Stairs',
  storage: 'Storage',
  bathroom: 'Bath',
  entrance: 'Entrance',
}

// Mix a hex colour toward white (amount > 0) or black (amount < 0).
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)))
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// Gradients and watercolour filters for room blocks. Include once in every <svg> that draws rooms.
export function RoomDefs() {
  return (
    <defs>
      {ROOM_ORDER.map((type) => {
        const c = ROOM_TYPES[type].colour
        return (
          <linearGradient key={type} id={`rg-${type}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={shade(c, 0.22)} />
            <stop offset="0.55" stopColor={c} />
            <stop offset="1" stopColor={shade(c, -0.14)} />
          </linearGradient>
        )
      })}
      {/* pigment pooling: soft darker blotches, like a watercolour wash */}
      <filter id="wc-wash" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="3" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.3" result="a" />
        <feComposite in="SourceGraphic" in2="a" operator="in" />
      </filter>
      {/* paper grain on the pigment */}
      <filter id="wc-grain" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 -0.25" result="a" />
        <feComposite in="a" in2="SourceGraphic" operator="in" />
      </filter>
      {/* the darker rim where a wash dries */}
      <filter id="wc-edge" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
      <pattern id="dormant-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="9" stroke="#242622" strokeWidth="1.2" strokeOpacity="0.35" />
      </pattern>
    </defs>
  )
}

// One room block drawn at (0,0) with the given cell size. Used on the board and under the
// pointer while dragging, so both look identical.
export function RoomShape({ room, type = room?.type, rotation = room?.rotation ?? 0, cell, className = '', showLabel = true }) {
  const t = ROOM_TYPES[type]
  const { w, h } = footprint(type, rotation)
  const W = w * cell
  const H = h * cell
  const inset = cell * 0.07
  const bw = W - inset * 2
  const bh = H - inset * 2
  const iconSize = Math.min(W, H) * 0.36
  const label = SHORT_LABEL[type] ?? t.label
  const fontSize = Math.max(7, Math.min(10.5, cell * 0.11))
  const iconY = showLabel ? H / 2 - iconSize / 2 - fontSize * 0.7 : H / 2 - iconSize / 2
  const notch = {
    0: [W / 2 - cell * 0.12, inset + 2, W / 2 + cell * 0.12, inset + 2],
    90: [W - inset - 2, H / 2 - cell * 0.12, W - inset - 2, H / 2 + cell * 0.12],
    180: [W / 2 - cell * 0.12, H - inset - 2, W / 2 + cell * 0.12, H - inset - 2],
    270: [inset + 2, H / 2 - cell * 0.12, inset + 2, H / 2 + cell * 0.12],
  }[rotation % 360]
  const gilded = room?.gilded
  const dormant = room?.dormant
  return (
    <g className={`room-shape ${className}`} style={{ '--room': t.colour, '--room-ink': t.ink }}>
      <rect className="room-shadow" x={inset + 2} y={inset + 5} width={bw} height={bh} rx={4} />
      <rect className="room-body" x={inset} y={inset} width={bw} height={bh} rx={4} fill={`url(#rg-${type})`} />
      <rect className="room-wash" x={inset} y={inset} width={bw} height={bh} rx={4} filter="url(#wc-wash)" />
      <rect className="room-grain" x={inset} y={inset} width={bw} height={bh} rx={4} filter="url(#wc-grain)" fill={t.colour} />
      <rect className="room-edge" x={inset + 1} y={inset + 1} width={bw - 2} height={bh - 2} rx={4} stroke={shade(t.colour, -0.3)} filter="url(#wc-edge)" />
      <rect className="room-inner" x={inset + 5} y={inset + 5} width={bw - 10} height={bh - 10} rx={2} />
      {gilded && (
        <g className="room-gild">
          <rect x={inset + 2.5} y={inset + 2.5} width={bw - 5} height={bh - 5} rx={3} />
          {[[inset + 7, inset + 7], [W - inset - 7, inset + 7], [inset + 7, H - inset - 7], [W - inset - 7, H - inset - 7]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={2.2} />
          ))}
        </g>
      )}
      <line className="room-notch" x1={notch[0]} y1={notch[1]} x2={notch[2]} y2={notch[3]} />
      <g transform={`translate(${W / 2 - iconSize / 2} ${iconY}) scale(${iconSize / 24})`}>
        <path className="room-icon" d={t.icon} stroke={t.ink} />
      </g>
      {showLabel && (
        <text className="room-label" x={W / 2} y={iconY + iconSize + fontSize * 1.6} fontSize={fontSize} fill={t.ink}>
          {label.toUpperCase()}
        </text>
      )}
      {dormant && (
        <g className="room-dormant">
          <rect x={inset} y={inset} width={bw} height={bh} rx={4} fill="url(#dormant-hatch)" />
          <text x={W / 2} y={H - inset - 6} fontSize={fontSize * 0.85}>
            DORMANT
          </text>
        </g>
      )}
    </g>
  )
}

export function RoomIcon({ type, size = 22 }) {
  const t = ROOM_TYPES[type]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="room-icon-chip" style={{ background: t.colour, borderRadius: 4 }}>
      <path className="room-icon" d={t.icon} stroke={t.ink} transform="translate(3 3) scale(0.75)" />
    </svg>
  )
}
