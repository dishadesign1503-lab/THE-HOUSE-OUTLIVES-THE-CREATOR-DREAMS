import { ZONES } from '../vastu/reference.js'
import { STATUS } from '../vastu/responses.js'

const zoneText = (z) => `${ZONES[z].dir} · ${ZONES[z].name}`
const MODE = { placing: 'placing…', selected: 'selected', moved: 'last moved' }

// Live Vastu reading of the room being placed, selected or last moved.
export default function VastuPanel({ assessment, mode, occupied, counts, onApplySuggestion, onOpenReference, toggles }) {
  const a = assessment
  return (
    <section className="panel vastu" aria-label="Vastu analysis" aria-live="polite">
      <h2 className="panel-title">
        Vastu analysis
        <button className="link small-link" onClick={onOpenReference}>
          reference guide
        </button>
      </h2>

      {a ? (
        <div className={`va status-${a.status}`}>
          <div className="va-head">
            <span className={`va-badge status-${a.status}`}>
              <span aria-hidden="true">{STATUS[a.status].symbol}</span> {STATUS[a.status].label}
            </span>
            <span className="dim va-mode">{occupied ? 'space taken' : MODE[mode]}</span>
          </div>
          <p className="va-room">
            {a.label} <span className="dim">· {a.ref}</span>
          </p>
          <dl className="va-facts">
            <dt>Zone</dt>
            <dd>
              {zoneText(a.primary)}
              {a.secondary.length > 0 && <span className="dim"> · also {a.secondary.map((z) => ZONES[z].dir.toLowerCase()).join(', ')}</span>}
            </dd>
            <dt>Recommended</dt>
            <dd>{a.recommended.map((z) => `${ZONES[z].dir} (${ZONES[z].name})`).join(', ')}</dd>
            <dt>Body region</dt>
            <dd>{a.regionLabel}</dd>
          </dl>
          <p className="va-why">{a.explanation}</p>
          {a.suggestion && (
            <div className="va-suggest">
              <span>
                <span className="dim">Alternative</span> {a.suggestion.ref}, {ZONES[a.suggestion.zone].dir.toLowerCase()}
              </span>
              {mode !== 'placing' && (
                <button className="btn small" onClick={() => onApplySuggestion(a)}>
                  Move there
                </button>
              )}
            </div>
          )}
          {a.status !== 'aligned' && !a.suggestion && <p className="note">No free aligned position at the moment. Make space in the recommended zone.</p>}
        </div>
      ) : (
        <p className="note">Move, drop or select a room to read its position against the Vastu reference.</p>
      )}

      <p className="va-counts">
        <span className="status-aligned">✓ {counts.aligned} aligned</span>
        <span className="status-review">~ {counts.review} needs review</span>
        <span className="status-conflict">✕ {counts.conflict} conflicting</span>
      </p>
      <div className="va-toggles">
        {toggles.map((t) => (
          <button key={t.label} className={`btn small ${t.on ? 'active' : ''}`} onClick={t.onToggle} aria-pressed={t.on}>
            {t.label}
          </button>
        ))}
      </div>
    </section>
  )
}
