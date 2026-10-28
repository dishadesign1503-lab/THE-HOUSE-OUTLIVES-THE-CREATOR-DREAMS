import { HEAT_GRADIENT, HEAT_LEVELS, LANTERN_FADE_M } from './heat.js'
import { MAX_CLUES } from './useHotColdGame.js'

const TREND_TEXT = {
  warmer: 'Warmer…',
  colder: 'Colder…',
  same: 'No change',
}

const GPS_TEXT = {
  locating: 'Asking for your location… Allow it when the browser asks.',
  timeout: 'GPS is taking too long. Still trying…',
}

function formatTime(ms) {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

// The building gradient. The five bands share the bar equally, so the short distances near the target stay readable.
const LEGEND_BAR = `linear-gradient(to right, ${HEAT_GRADIENT.map(([, c], i) => `${c} ${10 + i * 20}%`).join(', ')})`

function Legend() {
  return (
    <div className="legend" aria-label="Colour legend">
      <div className="legend-bar" style={{ background: LEGEND_BAR }} />
      <div className="legend-ticks">
        {HEAT_LEVELS.slice(0, -1).map((l, i) => (
          <span key={l.key} style={{ left: `${(i + 1) * 20}%` }}>{l.max} m</span>
        ))}
      </div>
      <div className="legend-bands">
        {HEAT_LEVELS.map((l) => (
          <span key={l.key}>{l.label}</span>
        ))}
      </div>
      <p className="hint">
        Buildings within about {LANTERN_FADE_M} m of you take the colour of their own distance to the hidden landmark:
        the redder, the closer. Buildings further away stay pale. Heights are measured (LoD2 3D models).
      </p>
    </div>
  )
}

function LocationControls({ mode, onModeChange, gps, gpsNotice, farFromArea }) {
  return (
    <section className="block">
      <h3>Your position</h3>
      <div className="segmented" role="radiogroup" aria-label="How to move">
        <button role="radio" aria-checked={mode === 'pin'} className={mode === 'pin' ? 'on' : ''} onClick={() => onModeChange('pin')}>
          Map pin
        </button>
        <button role="radio" aria-checked={mode === 'gps'} className={mode === 'gps' ? 'on' : ''} onClick={() => onModeChange('gps')}>
          My GPS
        </button>
      </div>
      {mode === 'pin' && <p className="hint">Click the map or drag the pin to move.</p>}
      <p className="hint">Turn and tilt the 3D view: right-drag, or Ctrl + drag. On touch: two fingers.</p>
      {mode === 'gps' && gps.status === 'active' && (
        <p className="hint">
          Following your GPS, accurate to about {Math.round(gps.accuracy)} m.
          {gps.accuracy > 15 && ' Step into the open for a better fix: the find needs you within 10 m.'}
        </p>
      )}
      {mode === 'gps' && GPS_TEXT[gps.status] && <p className="hint">{GPS_TEXT[gps.status]}</p>}
      {gpsNotice && <p className="hint warn">{gpsNotice}</p>}
      {farFromArea && (
        <p className="hint warn">You seem to be outside the game area in central Weimar. Switch to the map pin to play from here.</p>
      )}
    </section>
  )
}

export default function GamePanel({ game, location }) {
  const { status, heat, trend } = game

  return (
    <aside className="game-panel" style={{ '--heat': heat?.color }}>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Case file · Weimar</p>
          <h1>Weimar: Hot &amp; Cold</h1>
        </div>
        {status === 'playing' && heat && <span className="heat-chip">{heat.label}</span>}
      </header>

      <div className="panel-body">
        {status === 'idle' && (
          <>
            <p className="lede">
              Somewhere in the old town, a statue, monument or fountain is hiding. You have up to three clues and your
              instinct. The map tells you how warm the trail is.
            </p>
            <ol className="steps">
              <li>Read the clue.</li>
              <li>Move around: walk with GPS, or move the pin on the map.</li>
              <li>Follow the heat. Within 10 m, confirm your find.</li>
            </ol>
            <button className="primary" onClick={game.start}>Start Game</button>
          </>
        )}

        {status === 'playing' && (
          <>
            <section className="block">
              <h3>
                Clues <span className="count">Clues used: {game.cluesShown} / {MAX_CLUES}</span>
              </h3>
              <ol className="clues">
                {game.clues.map((c, i) => (
                  <li key={i} className={i === game.clues.length - 1 ? 'latest' : ''}>{c}</li>
                ))}
              </ol>
              <button className="secondary" onClick={game.nextClue} disabled={!game.canGetClue}>
                {game.canGetClue ? 'Get Another Clue' : 'No clues left'}
              </button>
            </section>

            <section className="block heat" aria-live="polite">
              <h3>Trail</h3>
              {heat ? (
                <div className="heat-readout">
                  <span className="heat-dot" />
                  <strong>{heat.label}</strong>
                  {trend && <span className="trend">{TREND_TEXT[trend]}</span>}
                </div>
              ) : (
                <p className="hint">Set your position to pick up the trail.</p>
              )}
              <Legend />
            </section>

            {game.nearby && (
              <section className="block discovery" role="alert">
                <p>You are standing within 10 m of something remarkable. Is this what you were looking for?</p>
                <button className="primary" onClick={game.confirmFind}>Confirm Find</button>
              </section>
            )}

            <LocationControls {...location} />
          </>
        )}

        {status === 'found' && game.found && (
          <section className="solved">
            <span className="stamp">Solved</span>
            <p className="eyebrow">You found</p>
            <h2>{game.found.name}</h2>
            <p>{game.found.fact}</p>
            <p className="meta">
              Source:{' '}
              <a href={game.found.source.url} target="_blank" rel="noreferrer">{game.found.source.label}</a>
              {' · '}Position:{' '}
              <a href={`https://www.openstreetmap.org/${game.found.osm}`} target="_blank" rel="noreferrer">OpenStreetMap</a>
            </p>
            <p className="meta">
              Clues used: {game.cluesShown} / {MAX_CLUES}
              {game.elapsedMs != null && <> · Time: {formatTime(game.elapsedMs)}</>}
            </p>
            <button className="primary" onClick={game.start}>Play Again</button>
          </section>
        )}
      </div>
    </aside>
  )
}
