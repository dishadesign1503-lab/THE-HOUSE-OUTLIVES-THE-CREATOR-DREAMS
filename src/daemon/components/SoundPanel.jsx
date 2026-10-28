const FAMILY_LABEL = { household: 'Home', conflict: 'Conflict', loss: 'Loss', building: 'Building', confusion: 'Confused' }
const SCAPE_LABEL = { harmony: 'Harmony', tension: 'Tension', isolation: 'Isolation', confusion: 'Confusion', abandonment: 'Abandonment', listening: 'Listening' }

// Master, ambience and event volume, mute, an immediate stop, and what the house sounds like now.
export default function SoundPanel({ volume, onVolume, ambience, onAmbience, events, onEvents, muted, onMute, stopped, onStop, outcome, families }) {
  return (
    <section className="panel sound" aria-label="Sound">
      <h2 className="panel-title">
        What it produces <span className="dim">sound</span>
      </h2>
      <div className="scape" aria-live="polite">
        <span className="scape-name">
          <span className="dim">Soundscape</span> {SCAPE_LABEL[outcome] ?? 'Listening'}
        </span>
        <div className="scape-bars">
          {Object.entries(families).map(([k, v]) => (
            <div key={k} className={`scape-bar fam-${k}`} title={`${FAMILY_LABEL[k]}: ${Math.round(v * 100)}%`}>
              <span style={{ height: `${Math.max(4, v * 100)}%` }} />
              <i>{FAMILY_LABEL[k]}</i>
            </div>
          ))}
        </div>
      </div>
      <label className="slider">
        <span>Master volume</span>
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => onVolume(+e.target.value)} />
      </label>
      <div className="slider-pair">
        <label className="slider">
          <span>Ambience</span>
          <input type="range" min="0" max="1" step="0.01" value={ambience} onChange={(e) => onAmbience(+e.target.value)} />
        </label>
        <label className="slider">
          <span>Events</span>
          <input type="range" min="0" max="1" step="0.01" value={events} onChange={(e) => onEvents(+e.target.value)} />
        </label>
      </div>
      <div className="btn-row">
        <button className={`btn ${muted ? 'active' : ''}`} onClick={onMute}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button className={`btn ${stopped ? 'active warn' : ''}`} onClick={onStop}>
          {stopped ? 'Resume sound' : 'Stop all sound'}
        </button>
      </div>
    </section>
  )
}
