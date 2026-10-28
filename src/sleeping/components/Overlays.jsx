import { ENDINGS, PHASES } from '../story/progression.js'
import { REGION_LABEL } from '../entity/skeleton.js'

export function ObjectiveBar({ phase, objective }) {
  if (!objective) return null
  return (
    <section className="objective" aria-live="polite" aria-label="Current objective">
      <p className="phase">{PHASES[phase]?.label}</p>
      <h1>{objective.title}</h1>
      <p className="obj-text">{objective.text}</p>
      {objective.checks && (
        <ul className="checks">
          {objective.checks.map(([label, done]) => (
            <li key={label} className={done ? 'done' : ''}>
              <span aria-hidden="true">{done ? '●' : '○'}</span> {label}
              <span className="sr-only">{done ? ' (felt)' : ' (not yet)'}</span>
            </li>
          ))}
        </ul>
      )}
      {objective.progress && <p className="progress">{objective.progress}</p>}
      {objective.hint && <p className="hint">{objective.hint}</p>}
      {objective.dawn !== undefined && (
        <div className="dawn" aria-label={`Night ${Math.round(objective.dawn * 100)}% gone`}>
          <span style={{ width: `${objective.dawn * 100}%` }} />
          <em>dawn</em>
        </div>
      )}
    </section>
  )
}

export function Notices({ notices, now }) {
  const live = notices.filter((n) => now - n.t < 4.5).slice(-2)
  return (
    <div className="notices" aria-live="assertive">
      {live.map((n) => (
        <p key={n.id} className={`notice ${n.kind}`}>
          {n.text}
        </p>
      ))}
    </div>
  )
}

const SENSE_MARK = { sound: '◠', vibration: '≋', thermal: '°', airflow: '~', scent: '∴', texture: '▦' }

export function Observations({ discoveries, open, onToggle }) {
  const list = [...discoveries].reverse()
  return (
    <section className={`observations ${open ? 'open' : ''}`} aria-label="Observations">
      <button type="button" className="obs-head" onClick={onToggle} aria-expanded={open}>
        <span>Observations</span>
        <span className="count">{discoveries.length}</span>
      </button>
      {open && (
        <ol className="obs-list">
          {list.length === 0 && <li className="obs-empty">Nothing observed yet. Change something in the house.</li>}
          {list.map((d) => (
            <li key={d.key} className={`obs sense-${d.sense}`}>
              <span className="mark" aria-hidden="true">{SENSE_MARK[d.sense] ?? '·'}</span>
              <span>{d.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function Intro({ onStart }) {
  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-card">
        <p className="eyebrow">Vastu Purusha</p>
        <h1 id="intro-title">The Sleeping House</h1>
        <p>
          Under this house sleeps a body. His head lies in the north-east, his feet in the south-west; every room rests
          on part of him.
        </p>
        <p>
          He is blind. He cannot see you, the house, or anything on this screen. He knows only what reaches his body:
          warmth and cold, moving air, sound, tremor, scent, the floor against his skin.
        </p>
        <p className="muted">One night, until dawn. Use headphones if you can.</p>
        <div className="intro-actions">
          <button type="button" className="primary" onClick={() => onStart(true)} autoFocus>
            Enter the house
          </button>
          <button type="button" className="ghost-btn" onClick={() => onStart(false)}>
            Enter without sound
          </button>
        </div>
      </div>
    </div>
  )
}

export function EndingCard({ ending, seen, onReplay, visible, hidden, onHide }) {
  if (!ending || !visible) return null
  const E = ENDINGS[ending.kind]
  if (hidden) {
    return (
      <div className="ending-chip">
        <span>{E.title}</span>
        <button type="button" className="ghost-btn" onClick={() => onHide(false)}>
          Show the ending
        </button>
        <button type="button" className="ghost-btn" onClick={onReplay}>
          Another night
        </button>
      </div>
    )
  }
  const s = ending.stats
  return (
    <div className={`ending-card ending-${ending.kind}`} role="dialog" aria-modal="true" aria-labelledby="ending-title">
      <div className="ending-inner">
        <p className="eyebrow">IV · Dawn</p>
        <h1 id="ending-title">{E.title}</h1>
        <p className="ending-line">{E.line}</p>
        <dl className="ending-stats">
          <div>
            <dt>Night</dt>
            <dd>{s.minutes.toFixed(1)} min</dd>
          </div>
          <div>
            <dt>Disturbances he felt</dt>
            <dd>{s.disturbance.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Closest to waking</dt>
            <dd>{Math.round(Math.min(1, s.maxWake) * 100)}%</dd>
          </div>
          <div>
            <dt>Most disturbed</dt>
            <dd>{s.region ? `his ${REGION_LABEL[s.region]}` : '—'}</dd>
          </div>
        </dl>
        <p className="rule">
          <strong>Why this ending:</strong> {E.rule}
        </p>
        <ul className="endings-found" aria-label="Endings found">
          {Object.entries(ENDINGS).map(([k, e]) => (
            <li key={k} className={seen.includes(k) ? 'found' : ''}>
              <span>{seen.includes(k) ? e.title : '· · ·'}</span>
              <small>{seen.includes(k) ? e.rule : 'Not yet found'}</small>
            </li>
          ))}
        </ul>
        <div className="intro-actions">
          <button type="button" className="primary" onClick={onReplay} autoFocus>
            Another night
          </button>
          <button type="button" className="ghost-btn" onClick={() => onHide(true)}>
            See the house
          </button>
        </div>
      </div>
    </div>
  )
}
