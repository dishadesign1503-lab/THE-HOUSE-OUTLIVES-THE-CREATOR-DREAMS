import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SensorManager } from './sensors/sensors.js'
import { TiltController } from './sensors/tilt.js'
import { MicSensor } from './sensors/mic.js'
import { Haptics } from './feedback/haptics.js'
import { Audio } from './feedback/audio.js'
import { GameEngine } from './engine/engine.js'
import { STAGES, ENDINGS } from './game/stages.js'
import { loadSettings, saveSettings, loadProgress, saveProgress } from './core/settings.js'
import SettingsPanel, { Slider, Toggle } from './ui/SettingsPanel.jsx'
import Calibration from './ui/Calibration.jsx'
import Inspector from './ui/Inspector.jsx'
import HypnoControl from './ui/HypnoControl.jsx'
import Disclaimer from './ui/Disclaimer.jsx'
import { HypnoListener } from './voice/listener.js'
import DreamWalk from './dream3d/DreamWalk.jsx'
import './house.css'

// THE HOUSE OUTLIVES ITS CREATOR — screens (the UI manager).
// title → (how to play | sensor settings) → [warning, after Start] → calibration → stage card → game ⇄ pause → … → ending

const SOURCE_LABEL = { tilt: 'TILT', keys: 'KEYS · fallback', touch: 'TOUCH · fallback', none: 'NO INPUT' }

export default function HouseApp() {
  const services = useMemo(
    () => ({ sensors: new SensorManager(), tilt: new TiltController(), haptics: new Haptics(), audio: new Audio(), mic: new MicSensor(), voice: new HypnoListener() }),
    [],
  )
  const [settings, setSettings] = useState(loadSettings)
  const [progress, setProgress] = useState(loadProgress)
  const [screen, setScreen] = useState('title') // title | how | settings | warning | calibrate | game
  const [startStage, setStartStage] = useState(0)
  const [runId, setRunId] = useState(0)

  const update = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  // feedback follows the settings
  useEffect(() => {
    services.haptics.enabled = settings.haptics
    services.audio.setMuted(!settings.sound)
    services.mic.sensitivity = settings.micSensitivity
  }, [services, settings.haptics, settings.sound, settings.micSensitivity])

  // stop the microphone and sensors when this experience is left
  useEffect(
    () => () => {
      services.mic.stop()
      services.sensors.stop()
      services.audio.close()
    },
    [services],
  )

  const begin = async (stage, warn = false) => {
    // inside the tap: the only moment iOS allows the motion permission and audio to start
    services.audio.init()
    services.audio.setMuted(!settings.sound)
    if (services.sensors.status !== 'active') services.sensors.request()
    setStartStage(stage)
    setScreen(warn ? 'warning' : 'calibrate')
  }

  const record = useCallback((patch) => {
    setProgress((p) => {
      const next = { ...p, ...patch(p) }
      saveProgress(next)
      return next
    })
  }, [])

  if (screen === 'game') {
    return (
      <GameScreen
        key={runId}
        services={services}
        settings={settings}
        update={update}
        stage={startStage}
        onQuit={() => setScreen('title')}
        onRestartAll={() => {
          setStartStage(0)
          setRunId((n) => n + 1)
        }}
        record={record}
      />
    )
  }

  return (
    <div className="hs-root">
      {screen === 'title' && (
        <div className="hs-screen hs-title">
          <div className="hs-title-plan" aria-hidden="true">
            <TitleGlyph />
          </div>
          <h1>
            THE HOUSE
            <br />
            OUTLIVES
            <br />
            ITS CREATOR
          </h1>
          <p className="hs-subtitle">Some rules survive the reason they were made.</p>
          <div className="hs-actions">
            <button type="button" className="hs-btn primary" onClick={() => begin(0, true)}>
              Start
            </button>
            {progress.reached > 0 && (
              <button type="button" className="hs-btn" onClick={() => begin(progress.reached)}>
                Continue · {STAGES[progress.reached].numeral} {STAGES[progress.reached].title}
              </button>
            )}
            <button type="button" className="hs-btn" onClick={() => setScreen('how')}>
              How to play
            </button>
            <button type="button" className="hs-btn" onClick={() => setScreen('settings')}>
              Sensor settings
            </button>
          </div>
          {progress.endings.length > 0 && <p className="hs-dim small">Endings found: {progress.endings.map((e) => ENDINGS[e].title.toLowerCase()).join(', ')}</p>}
        </div>
      )}

      {screen === 'how' && (
        <div className="hs-screen">
          <h2>How to play</h2>
          <ul className="hs-rules">
            <li>Tilt your phone to steer the runner (a blue head, a yellow body) through the house. It gathers speed, and it takes a moment to stop.</li>
            <li>Beneath the plan, faintly, a body sleeps: the Vastu Purusha. The walls are his body made into architecture.</li>
            <li>Every knock against a wall reaches the part of him beneath it. That part glows red; he tolerates a little.</li>
            <li>While he sleeps he snores. Disturbed enough, he wakes and changes how he lies, and the walls glide after his body into a new plan. The room you are in carries you with it. While the frame is orange, every lean you make disturbs him more.</li>
            <li>He remembers you: the passages you use, where you hit him. He turns to close what you rely on.</li>
            <li>The wind and the sun outside never change. As the walls move, draughts and light fall in new places. Draughts push you; sunlit floor is slippery.</li>
            <li>Press HYPNOTIZE and tell him what he is: “You are a lamp stand.” “You are a boat.” “You are a stone.” He repeats it three times as he tries to sleep in that shape, and the house changes with his body. How far he goes, and which way, is his own affair. Nag him, or shout, and he grows irritated.</li>
            <li>Disturb him three times (a hard knock, a burst of knocks, a forceful instruction) and he turns away and moves the exit somewhere else.</li>
            <li>Three stages. The last one asks you something.</li>
          </ul>
          <p className="hs-dim small">
            Without motion sensors (a laptop, or permission denied): arrow keys or WASD, hold Shift to tilt further; or press and drag on the plan. Optional: vibration (Android), sound,
            and a microphone mode in Sensor settings.
          </p>
          <button type="button" className="hs-btn ghost" onClick={() => setScreen('title')}>
            Back
          </button>
        </div>
      )}

      {screen === 'settings' && (
        <div className="hs-screen hs-scroll">
          <h2>Sensor settings</h2>
          <SettingsPanel settings={settings} update={update} services={services} />
          <button type="button" className="hs-btn ghost" onClick={() => setScreen('title')}>
            Back
          </button>
        </div>
      )}

      {screen === 'warning' && <Disclaimer audio={services.audio} onDone={() => setScreen('calibrate')} />}

      {screen === 'calibrate' && (
        <Calibration
          services={services}
          settings={settings}
          onBack={() => setScreen('title')}
          onDone={() => {
            if (!services.tilt.calibrated && services.sensors.gravity) services.tilt.calibrate(services.sensors.gravity)
            setRunId((n) => n + 1)
            setScreen('game')
          }}
        />
      )}
    </div>
  )
}

// A small thick-walled plan, one wall lifting out of it, for the title.
function TitleGlyph() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <g className="hs-sleeper" fill="none" stroke="rgba(255, 196, 168, 0.22)" strokeWidth="9" strokeLinecap="round">
        <path d="M84 30l-8 10M76 40l-20 26M56 66l-18 14M38 80l-10 16M60 58l-18-10M42 48l-12 6M70 50l14 14M84 64l2 14M56 66l14 16M70 82l-2 16" />
        <circle cx="88" cy="25" r="7" fill="rgba(255, 196, 168, 0.22)" stroke="none" />
      </g>
      <g fill="#f2f0ea">
        <path d="M10 10h100v6H16v34h-6zM10 70h6v34h94v6H10zM104 16h6v54h-6zM104 86h6v18h-6z" />
        <path d="M16 46h28v3H16zM60 46h44v3H60zM58 49h3v30h-3zM72 80h28v3H72z" className="hs-glide" />
      </g>
      <circle cx="36" cy="88" r="4" fill="#2a6bff" />
    </svg>
  )
}

function GameScreen({ services, settings, update, stage, onQuit, onRestartAll, record }) {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const [hud, setHud] = useState(null)
  const [message, setMessage] = useState(null)
  const [overlay, setOverlay] = useState({ type: 'stageIntro', stage })
  const [ending, setEnding] = useState(null)
  const [trance, setTrance] = useState(null)
  const [dreamBanner, setDreamBanner] = useState(null)
  const messageTimer = useRef(null)
  const tranceTimer = useRef(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const show = useCallback((text, ms = 4200) => {
    setMessage({ text, at: Date.now() })
    clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => setMessage(null), ms)
  }, [])

  useEffect(() => {
    const engine = new GameEngine({
      canvas: canvasRef.current,
      services,
      settings: settingsRef.current,
      stage,
      onUi: (e) => {
        if (e.type === 'hud') setHud(e.data)
        else if (e.type === 'dreamStart') {
          // he dreams he is an architect: the plan pauses and the player walks into his dream
          if (settingsRef.current.dream3d !== false) setOverlay({ type: 'dream3d', plan: engine.game.dreamPlan() })
          else {
            setDreamBanner(Date.now())
            setTimeout(() => setDreamBanner(null), 2800)
          }
        } else if (e.type === 'trance') {
          setTrance({ words: e.words, k: e.k, at: Date.now() })
          clearTimeout(tranceTimer.current)
          tranceTimer.current = setTimeout(() => setTrance(null), 2900)
        }
        else if (e.type === 'message' || e.type === 'toast') show(e.text)
        else if (e.type === 'stageComplete') {
          engine.setPaused(true)
          setOverlay({ type: 'stageDone', stage: e.stage, text: e.text })
        } else if (e.type === 'stageStart') record((p) => ({ reached: Math.max(p.reached, e.stage) }))
        else if (e.type === 'ending') {
          setEnding(e.kind)
          record((p) => ({ endings: [...new Set([...p.endings, e.kind])] }))
        } else if (e.type === 'pauseRequest') {
          setOverlay((o) => (o ? o : { type: 'pause' }))
        }
      },
    })
    engine.setPaused(true)
    engineRef.current = engine
    return () => {
      engine.destroy()
      clearTimeout(messageTimer.current)
    }
  }, [services, stage, show, record])

  // the engine reads settings live
  useEffect(() => {
    if (engineRef.current) engineRef.current.settings = settings
  }, [settings])

  // nothing moves under an overlay
  useEffect(() => {
    engineRef.current?.setPaused(!!overlay)
    // the plan waits, but his dream is heard: its drone, and the anchor's hum
    if (overlay?.type === 'dream3d') services.audio.resume()
    if (!overlay) services.mic.resume?.()
    else if (overlay.type === 'pause') services.mic.pause?.()
  }, [overlay, services])

  const engine = engineRef.current
  const st = hud ? STAGES[hud.stage] : STAGES[stage]
  const red = !!hud?.holding

  return (
    <div className="hs-root hs-game">
      <header className="hs-hud">
        <div className="hs-hud-left">
          <span className="hs-stage">
            {st.numeral} · {st.title}
          </span>
          <span
            className={`hs-breath ${red ? 'red' : ''}`}
            style={{ transform: `scale(${hud ? 0.8 + hud.arousal * 0.9 : 1})`, opacity: hud ? 0.45 + hud.arousal * 0.55 : 0.5 }}
            title="how restless the house is"
            aria-hidden="true"
          />
          {red && <span className="hs-still">STILL</span>}
        </div>
        <div className="hs-hud-right">
          {hud && <span className={`hs-chip ${hud.source === 'tilt' ? '' : 'fallback'}`}>{SOURCE_LABEL[hud.source]}</span>}
          {hud && ['on', 'calibrating'].includes(hud.micStatus) && <span className="hs-chip">MIC</span>}
          {hud && !hud.hapticSupported && (
            <span className="hs-chip dim" title="This browser cannot vibrate">
              NO VIB
            </span>
          )}
          <button
            type="button"
            className={`hs-chip hs-chip-btn ${settings.sound ? '' : 'dim'}`}
            aria-pressed={!settings.sound}
            aria-label={settings.sound ? 'Mute sound' : 'Turn sound on'}
            onClick={() => {
              services.audio.init()
              update({ sound: !settings.sound })
            }}
          >
            {settings.sound ? 'SOUND' : 'MUTED'}
          </button>
          <button type="button" className="hs-pause" aria-label="Pause" onClick={() => setOverlay({ type: 'pause' })}>
            ❚❚
          </button>
        </div>
      </header>

      <div className="hs-board">
        <canvas ref={canvasRef} className="hs-canvas" />
        {dreamBanner && (
          <div className="hs-dream-banner" role="alert" key={dreamBanner}>
            <p data-text="Ohh no... He's dreaming!">Ohh no... He's dreaming!</p>
          </div>
        )}
        {trance && (
          <div className="hs-trance" aria-live="assertive">
            <p key={trance.at}>{trance.words}</p>
            <span>
              {[1, 2, 3].map((i) => (
                <i key={i} className={i <= trance.k ? 'on' : ''} />
              ))}
            </span>
          </div>
        )}
      </div>

      <HypnoControl services={services} engineRef={engineRef} show={show} disabled={!!overlay || !!ending} />

      <footer className="hs-message" aria-live="polite">
        {message && (
          <p key={message.at} className="hs-line">
            {message.text}
          </p>
        )}
      </footer>

      {settings.debug && hud?.debug && engine && <Inspector hud={hud} engine={engine} />}

      {overlay?.type === 'dream3d' && (
        <DreamWalk
          plan={overlay.plan}
          services={services}
          onWake={() => {
            engineRef.current?.game.anchorFound()
            setOverlay(null)
          }}
          onFail={() => {
            // no way to the anchor in any version of his dream: it goes on in the plan, as before
            setOverlay(null)
            setDreamBanner(Date.now())
            setTimeout(() => setDreamBanner(null), 2800)
          }}
        />
      )}

      {overlay?.type === 'stageIntro' && (
        <div className="hs-overlay" onClick={() => setOverlay(null)}>
          <div className="hs-card">
            <p className="hs-numeral">{STAGES[overlay.stage].numeral}</p>
            <h2>{STAGES[overlay.stage].title}</h2>
            <p>{STAGES[overlay.stage].task}</p>
            <button type="button" className="hs-btn primary" onClick={() => setOverlay(null)}>
              Begin
            </button>
          </div>
        </div>
      )}

      {overlay?.type === 'stageDone' && (
        <div className="hs-overlay">
          <div className="hs-card">
            <p className="hs-numeral">{STAGES[overlay.stage].numeral}</p>
            <h2>{STAGES[overlay.stage].title}</h2>
            <p>{overlay.text}</p>
            <button
              type="button"
              className="hs-btn primary"
              onClick={() => {
                engine.nextStage()
                setOverlay({ type: 'stageIntro', stage: overlay.stage + 1 })
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {overlay?.type === 'pause' && (
        <div className="hs-overlay">
          <div className="hs-card hs-scroll">
            <h2>Paused</h2>
            <div className="hs-actions">
              <button type="button" className="hs-btn primary" onClick={() => setOverlay(null)}>
                Resume
              </button>
              <button
                type="button"
                className="hs-btn"
                disabled={!services.sensors.gravity}
                onClick={() => {
                  if (services.tilt.calibrate(services.sensors.gravity)) show('Level set to how you hold the phone now.')
                  setOverlay(null)
                }}
              >
                Recalibrate tilt (hold it as you play)
              </button>
            </div>
            <Slider label="Tilt sensitivity" min={0.5} max={2} step={0.05} value={settings.sensitivity} onChange={(v) => update({ sensitivity: v })} format={(v) => `${v.toFixed(2)}×`} />
            <div className="hs-row">
              <Toggle label="Vibration" value={settings.haptics} onChange={(v) => update({ haptics: v })} disabled={!services.haptics.supported} />
              <Toggle label="Sound" value={settings.sound} onChange={(v) => update({ sound: v })} />
            </div>
            <details className="hs-more">
              <summary>Sensors and hearing</summary>
              <SettingsPanel settings={settings} update={update} services={services} compact />
            </details>
            <div className="hs-actions">
              <button
                type="button"
                className="hs-btn"
                onClick={() => {
                  engine.restartStage()
                  setEnding(null)
                  setOverlay({ type: 'stageIntro', stage: engine.game.stageIndex })
                }}
              >
                Restart this stage
              </button>
              <button type="button" className="hs-btn ghost" onClick={onQuit}>
                Quit to title
              </button>
            </div>
          </div>
        </div>
      )}

      {ending && !overlay && <EndingScreen kind={ending} onAgain={onRestartAll} onTitle={onQuit} />}
    </div>
  )
}

function EndingScreen({ kind, onAgain, onTitle }) {
  const e = ENDINGS[kind]
  return (
    <div className="hs-ending">
      <h2>{e.title}</h2>
      {e.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p className="hs-last">{e.last}</p>
      <div className="hs-actions row">
        <button type="button" className="hs-btn primary" onClick={onAgain}>
          Enter again
        </button>
        <button type="button" className="hs-btn ghost" onClick={onTitle}>
          Title
        </button>
      </div>
    </div>
  )
}
