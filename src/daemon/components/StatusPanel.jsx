// What the visitor is allowed to know about the daemon: a word, a pulse, a sentence.
// The numbers stay hidden unless "show inner state" is turned on in Settings.

const HINT = {
  ABANDONED: 'The house has been running alone for years.',
  DORMANT: 'The building is listening. Move a room, or make a sound.',
  'GROWING QUIET': 'It has not heard anything for a while.',
  'SHUTTING DOWN': 'Nothing is moving. The old systems are switching off.',
}

export default function StatusPanel({ view, history, showInner }) {
  const text = HINT[view.phase] ?? view.interpretation?.text
  const points = history.map((v, i) => `${(i / Math.max(1, history.length - 1)) * 100},${22 - v * 20}`).join(' ')
  return (
    <section className="panel status" aria-live="polite">
      <div className="status-row">
        <span className={`status-dot phase-${view.phase.replace(/\s/g, '-').toLowerCase()}`} />
        <h2 className="status-phase">{view.phase}</h2>
      </div>
      <svg className="activity" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="22" x2="100" y2="22" />
        {history.length > 1 && <polyline points={points} />}
      </svg>
      <p className="status-text">{text}</p>
      {showInner && (
        <dl className="inner">
          {['activity', 'stability', 'confusion', 'attachment'].map((k) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                <span style={{ width: `${view[k] * 100}%` }} />
              </dd>
            </div>
          ))}
          {['coherent', 'tense', 'loss', 'unstable', 'forgotten'].map((k) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                <span className="mood" style={{ width: `${Math.min(1, view.mood[k]) * 100}%` }} />
              </dd>
            </div>
          ))}
          <div className="inner-meta">
            action {view.action?.type} · silence {Math.floor(view.timeSinceActivity)}s / {view.silenceThreshold}s · remembers {view.memoryCount} layouts · left alone {view.abandonments}×
          </div>
        </dl>
      )}
    </section>
  )
}
