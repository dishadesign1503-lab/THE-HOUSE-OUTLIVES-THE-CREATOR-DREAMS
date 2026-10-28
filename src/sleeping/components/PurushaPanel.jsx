import { useRef } from 'react'
import { BONES, BONE_REGION, POSTURES, REGION_LABEL } from '../entity/skeleton.js'
import { compass } from '../entity/mind.js'

// The Vastu Purusha: an articulated figure lying across the mandala, head in the north-east.
// Nothing here is seen by him; it is how we see him.

const HALF = 150
const PADA = (HALF * 2) / 9

function Mandala({ calm }) {
  const lines = []
  for (let i = 0; i <= 9; i++) {
    const p = -HALF + i * PADA
    const strong = i % 3 === 0
    lines.push(<line key={`v${i}`} className={strong ? 'pm-line strong' : 'pm-line'} x1={p} y1={-HALF} x2={p} y2={HALF} />)
    lines.push(<line key={`h${i}`} className={strong ? 'pm-line strong' : 'pm-line'} x1={-HALF} y1={p} x2={HALF} y2={p} />)
  }
  return (
    <g className="p-mandala" style={{ opacity: 0.45 + calm * 0.55 }}>
      <rect className="pm-centre" x={-PADA * 1.5} y={-PADA * 1.5} width={PADA * 3} height={PADA * 3} />
      {lines}
      {[['NE', HALF + 14, -HALF - 8], ['NW', -HALF - 14, -HALF - 8], ['SE', HALF + 14, HALF + 16], ['SW', -HALF - 14, HALF + 16]].map(([t, x, y]) => (
        <text key={t} className="pm-label" x={x} y={y}>{t}</text>
      ))}
    </g>
  )
}

export default function PurushaPanel({ world, regions }) {
  const { body, mind } = world
  const f = body.frame
  const trace = useRef([])
  // breath trace: the last ~16 seconds of his breathing
  trace.current.push(f.breath)
  if (trace.current.length > 240) trace.current.shift()

  const lit = (region) => regions?.[region]?.lit ?? 0
  const I = mind.irritation
  const wake = mind.wake
  const stroke = 1.6 + I * 0.9
  const att = mind.attention
  const posture = POSTURES[mind.posture]
  const recent = world.feed.filter((r) => r.region && mind.t - r.t < 3).slice(-1)[0]

  // torso shapes
  const ribs = [
    [f.clavL.x1, f.clavL.y1],
    [f.chest.x1, f.chest.y1],
    [f.clavR.x1, f.clavR.y1],
    [f.spine.x1, f.spine.y1],
  ]
  const pelvis = [
    [f.hipL.x1, f.hipL.y1],
    [(f.spine.x0 + f.spine.x1) / 2, (f.spine.y0 + f.spine.y1) / 2],
    [f.hipR.x1, f.hipR.y1],
    [f.root.x, f.root.y + 6],
  ]
  const P = (list) => list.map((p) => p.join(',')).join(' ')
  const headDir = { x: f.head.x1 - f.head.x0, y: f.head.y1 - f.head.y0 }
  const hl = Math.hypot(headDir.x, headDir.y) || 1
  const headC = { x: f.head.x0 + (headDir.x / hl) * 20, y: f.head.y0 + (headDir.y / hl) * 20 }

  // where his attention points, drawn as a mark on the mandala's edge (plan directions)
  let attMark = null
  if (att?.dir && (att.dir.x || att.dir.y)) {
    const a = Math.atan2(att.dir.y, att.dir.x)
    const r = HALF + 22
    const spread = 0.12 + (1 - (att.certainty ?? 1)) * 0.5
    const p1 = { x: Math.cos(a - spread) * r, y: Math.sin(a - spread) * r }
    const p2 = { x: Math.cos(a + spread) * r, y: Math.sin(a + spread) * r }
    attMark = <path className="attention" d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`} opacity={0.35 + (att.strength ?? 0.5) * 0.6} />
  }

  const breathPath = trace.current.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / 239) * 100} ${12 - v * 7}`).join(' ')
  const jitter = wake > 0.6 ? Math.sin(mind.t * 31) * (wake - 0.6) * 4 : 0

  return (
    <section className="purusha-panel" aria-label="The Vastu Purusha">
      <svg className="purusha" viewBox="-215 -215 430 430" role="img" aria-label={`The Vastu Purusha, ${posture.label.toLowerCase()}: ${posture.note}`}>
        <Mandala calm={Math.max(0, mind.comfort - I)} />
        {attMark}
        <g transform={`translate(${jitter} 0) rotate(45) scale(0.8)`} style={{ '--stroke': `${stroke}px` }}>
          {Object.keys(REGION_LABEL).map((region) => {
            const k = lit(region)
            if (k < 0.03) return null
            const id = { head: 'head', armN: 'armL', handNW: 'handL', armE: 'armR', handSE: 'handR', navel: 'spine', legW: 'thighL', legS: 'thighR', feet: 'footL' }[region]
            const b = f[id]
            return <circle key={region} className="region-aura" cx={b.x1} cy={b.y1} r={22 + k * 14} opacity={k * 0.55} />
          })}
          <polygon className="torso" points={P(ribs)} />
          <polygon className="torso" points={P(pelvis)} />
          {BONES.map((b) => {
            const k = f[b.id]
            const l = lit(BONE_REGION[b.id])
            return <line key={b.id} className="bone" x1={k.x0} y1={k.y0} x2={k.x1} y2={k.y1} strokeWidth={stroke + l * 1.6} opacity={0.75 + l * 0.25} />
          })}
          {['L', 'R'].map((s) =>
            f.fingers[s].map((fp, i) => (
              <polyline key={`${s}${i}`} className="finger" points={fp.map((p) => `${p.x},${p.y}`).join(' ')} />
            )),
          )}
          {BONES.filter((b) => b.id !== 'head' && b.id !== 'spine').map((b) => (
            <circle key={b.id} className="joint" cx={f[b.id].x0} cy={f[b.id].y0} r={b.id.startsWith('hip') || b.id.startsWith('clav') ? 2.4 : 3.2} />
          ))}
          {['handL', 'handR', 'footL', 'footR'].map((id) => (
            <circle key={id} className="joint end" cx={f[id].x1} cy={f[id].y1} r={2.6} />
          ))}
          <circle className="joint navel" cx={f.spine.x1} cy={f.spine.y1} r={4 + f.breath * 0.6} />
          <circle className="head" cx={headC.x} cy={headC.y} r={15} strokeWidth={stroke + lit('head') * 1.6} />
          <circle className="head-inner" cx={headC.x} cy={headC.y} r={4} />
        </g>
      </svg>
      <div className="purusha-state">
        <div className="posture-line">
          <span className="posture-name">{posture.label}</span>
          <span className="posture-note">{posture.note}</span>
        </div>
        <svg className="breath" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
          <path d={breathPath} />
        </svg>
        <div className="state-words">
          {stateWords(mind).map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className={`reaction-line ${recent ? 'on' : ''}`} aria-live="polite">
          {recent ? recent.regionLabel && `${recent.regionLabel}${att?.kind === 'sound' && recent.sense === 'sound' ? ` · listening ${compass(att.dir)}` : ''}` : ' '}
        </div>
      </div>
    </section>
  )
}

// A few words for his state — no meters.
function stateWords(mind) {
  const P = mind.perception
  const w = []
  const I = mind.irritation
  if (mind.wake > 0.6) w.push('near waking')
  else if (I > 0.6) w.push('agitated')
  else if (I > 0.32) w.push('restless')
  else if (mind.posture === 'mandala' && mind.comfort > 0.7) w.push('deep sleep')
  else w.push('asleep')
  if (P) {
    if (P.cold > 0.06) w.push('cold')
    else if (P.hot > 0.06) w.push('too warm')
    if (P.draft > 0.04) w.push('in a draft')
    if (P.sound.max > 0.2) w.push('listening')
    if (P.vib > 0.12) w.push('trembling')
  }
  const breath = mind.irritation > 0.4 ? 'quick breath' : mind.posture === 'mandala' && I < 0.2 ? 'slow breath' : null
  if (breath) w.push(breath)
  return w
}
