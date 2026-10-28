// The Vastu Purusha figure: an illustrative, face-down figure lying diagonally across the
// mandala, head in the north-east (Ishanya), feet in the south-west (Nairitya), arms toward
// the north-west and south-east. Drawn in board units (grid from -279 to 279, north up).
// Each body region is its own group so it can respond on its own.
// The figure never takes pointer events, so room blocks stay draggable through it.

const P = {
  head: [196, -196],
  neck: [150, -150],
  sN: [62, -168],
  sE: [168, -62],
  eN: [-40, -218],
  hN: [-186, -182],
  eE: [218, 40],
  hE: [182, 186],
  hipW: [-99, 21],
  hipS: [-21, 99],
  kW: [-206, 6],
  aW: [-210, 122],
  kS: [-6, 206],
  aS: [-122, 210],
  fW: [-214, 170],
  fS: [-170, 214],
  navel: [0, 0],
}
const pt = (k) => P[k].join(' ')
const line = (...keys) => `M ${keys.map(pt).join(' L ')}`

// Shapes per region: limbs are thick round strokes, the torso and head are filled.
export const REGION_SHAPES = {
  head: [
    { kind: 'limb', d: line('neck', 'head'), w: 30 },
    { kind: 'circle', cx: P.head[0], cy: P.head[1], r: 44 },
  ],
  armN: [{ kind: 'limb', d: line('sN', 'eN'), w: 28 }],
  armE: [{ kind: 'limb', d: line('sE', 'eE'), w: 28 }],
  handNW: [
    { kind: 'limb', d: line('eN', 'hN'), w: 23 },
    { kind: 'circle', cx: P.hN[0], cy: P.hN[1], r: 17 },
  ],
  handSE: [
    { kind: 'limb', d: line('eE', 'hE'), w: 23 },
    { kind: 'circle', cx: P.hE[0], cy: P.hE[1], r: 17 },
  ],
  navel: [{ kind: 'fill', d: 'M 62 -168 L 168 -62 Q 52 8 -21 99 L -99 21 Q -8 -52 62 -168 Z' }],
  legW: [{ kind: 'limb', d: line('hipW', 'kW', 'aW'), w: 32 }],
  legS: [{ kind: 'limb', d: line('hipS', 'kS', 'aS'), w: 32 }],
  feet: [
    { kind: 'limb', d: line('aW', 'fW'), w: 22 },
    { kind: 'limb', d: line('aS', 'fS'), w: 22 },
    { kind: 'ellipse', cx: P.fW[0], cy: P.fW[1], rx: 15, ry: 25, rot: 10 },
    { kind: 'ellipse', cx: P.fS[0], cy: P.fS[1], rx: 25, ry: 15, rot: -10 },
  ],
}

// Thin lines for the "engraved" contour drawn over the rooms.
const SKELETON = [
  line('neck', 'head'),
  line('sN', 'sE'),
  line('sN', 'eN', 'hN'),
  line('sE', 'eE', 'hE'),
  'M 150 -150 L -60 60',
  line('hipW', 'hipS'),
  line('hipW', 'kW', 'aW', 'fW'),
  line('hipS', 'kS', 'aS', 'fS'),
]
// Joints, drawn as small marma-like points (illustrative).
const JOINTS = ['head', 'sN', 'sE', 'eN', 'eE', 'hN', 'hE', 'navel', 'hipW', 'hipS', 'kW', 'kS', 'aW', 'aS']
const SKELETON_REGION = ['head', null, 'armN', 'armE', 'navel', 'navel', 'legW', 'legS']
const JOINT_REGION = { head: 'head', sN: 'armN', sE: 'armE', eN: 'handNW', eE: 'handSE', hN: 'handNW', hE: 'handSE', navel: 'navel', hipW: 'legW', hipS: 'legS', kW: 'legW', kS: 'legS', aW: 'feet', aS: 'feet' }

function Shapes({ id, outline = false }) {
  return REGION_SHAPES[id].map((s, i) => {
    if (s.kind === 'limb') return <path key={i} className="pr-limb" d={s.d} strokeWidth={s.w + (outline ? 6 : 0)} />
    if (s.kind === 'fill') return <path key={i} className="pr-fill" d={s.d} />
    if (s.kind === 'circle') return <circle key={i} className="pr-fill" cx={s.cx} cy={s.cy} r={s.r} />
    return <ellipse key={i} className="pr-fill" cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={`rotate(${s.rot} ${s.cx} ${s.cy})`} />
  })
}

// Under the rooms: the soft silhouette, each region tinted by how the house treats it.
export function FigureUnder({ states }) {
  return (
    <g className="purusha under" aria-hidden="true">
      {Object.keys(REGION_SHAPES).map((id) => (
        <g key={id} className={`pr-region state-${states[id] ?? 'none'}`}>
          <Shapes id={id} />
        </g>
      ))}
    </g>
  )
}

// Over the rooms: the engraved contour, the live hover and the reaction to the last move.
export function FigureOver({ states, hover, reaction }) {
  return (
    <g className="purusha over" aria-hidden="true">
      <g className="pr-skeleton">
        {SKELETON.map((d, i) => (
          <path key={i} d={d} className={`state-${states[SKELETON_REGION[i]] ?? 'none'}`} />
        ))}
        <circle className={`pr-head-outline state-${states.head ?? 'none'}`} cx={P.head[0]} cy={P.head[1]} r={44} />
        {JOINTS.map((k) => (
          <circle key={k} className={`pr-joint state-${states[JOINT_REGION[k]] ?? 'none'}`} cx={P[k][0]} cy={P[k][1]} r={k === 'navel' ? 0 : 3.2} />
        ))}
      </g>
      {hover && (
        <g className={`pr-hover status-${hover.status}`}>
          {hover.secondary?.map((id) => (
            <g key={id} className="pr-secondary">
              <Shapes id={id} />
            </g>
          ))}
          <g className="pr-hover-main">
            <Shapes id={hover.region} />
          </g>
        </g>
      )}
      {reaction && (
        <g key={reaction.key} className={`pr-react status-${reaction.status} visual-${reaction.visual}`}>
          {reaction.secondary?.map((id) => (
            <g key={id} className="pr-secondary">
              <Shapes id={id} />
            </g>
          ))}
          <g className="pr-react-main">
            <Shapes id={reaction.region} outline />
          </g>
        </g>
      )}
    </g>
  )
}
