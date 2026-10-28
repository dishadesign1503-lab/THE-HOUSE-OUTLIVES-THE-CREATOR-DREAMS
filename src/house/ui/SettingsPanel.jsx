import { useEffect, useState } from 'react'
import { AgentMemory } from '../agent/memory.js'

// Sensor and feedback settings: used on the title screen and in the pause menu.
// Every status shown here is what the browser actually reported, never an assumption.

const SENSOR_TEXT = {
  unknown: 'not started',
  unsupported: 'not available in this browser',
  insecure: 'blocked: needs https (see the README for phone testing)',
  'needs-permission': 'needs permission (tap Enable)',
  denied: 'permission denied: keys or touch fallback',
  waiting: 'waiting for data…',
  active: 'active',
  'no-data': 'no sensor data (desktop?): keys or touch fallback',
}

const MIC_TEXT = {
  off: 'off',
  requesting: 'asking permission…',
  calibrating: 'listening to the room (2 s)…',
  on: 'listening (loudness only, on this device)',
  denied: 'permission denied: play without it',
  unsupported: 'not available in this browser',
  insecure: 'blocked: needs https',
  error: 'could not start',
}

export function Toggle({ label, value, onChange, disabled }) {
  return (
    <button type="button" className={`hs-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} disabled={disabled} aria-pressed={value}>
      <span>{label}</span>
      <span className="hs-toggle-state">{value ? 'on' : 'off'}</span>
    </button>
  )
}

export function Slider({ label, min, max, step, value, onChange, format = (v) => v }) {
  return (
    <label className="hs-slider">
      <span className="hs-slider-head">
        <span>{label}</span>
        <span className="hs-dim">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function SettingsPanel({ settings, update, services, compact = false }) {
  const { sensors, haptics, mic, audio } = services
  const [, tick] = useState(0)
  const [forgot, setForgot] = useState(false)
  // statuses change outside React (sensor events, permission prompts): refresh a few times a second
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const enableMotion = async () => {
    await sensors.request()
    tick((n) => n + 1)
  }

  const setMic = async (on) => {
    if (on) {
      update({ mic: true })
      mic.sensitivity = settings.micSensitivity
      const st = await mic.start()
      if (st !== 'calibrating' && st !== 'on') update({ mic: false })
    } else {
      mic.stop()
      update({ mic: false })
    }
  }

  const micOn = settings.mic && ['on', 'calibrating'].includes(mic.status)

  return (
    <div className="hs-settings">
      <section>
        <h3>Motion</h3>
        <p className="hs-status">
          Tilt sensors: <span className={sensors.active ? 'ok' : 'warn'}>{SENSOR_TEXT[sensors.status] ?? sensors.status}</span>
        </p>
        {!sensors.active && sensors.status !== 'unsupported' && sensors.status !== 'insecure' && (
          <button type="button" className="hs-btn small" onClick={enableMotion}>
            Enable motion sensors
          </button>
        )}
        <Slider label="Tilt sensitivity" min={0.5} max={2} step={0.05} value={settings.sensitivity} onChange={(v) => update({ sensitivity: v })} format={(v) => `${v.toFixed(2)}×`} />
        {!compact && (
          <Slider
            label="Dead zone"
            min={0.015}
            max={0.12}
            step={0.005}
            value={settings.deadzone}
            onChange={(v) => update({ deadzone: v })}
            format={(v) => `${((Math.asin(v) * 180) / Math.PI).toFixed(1)}°`}
          />
        )}
      </section>

      <section>
        <h3>Vibration</h3>
        <p className="hs-status">
          {haptics.supported ? (
            <>
              Browser vibration: <span className="ok">available</span>
              <span className="hs-dim"> · last request {haptics.lastResult}</span>
            </>
          ) : (
            <>
              Browser vibration: <span className="warn">not supported here</span>
              <span className="hs-dim"> (iPhones never vibrate from a web page). The frame around the plan flashes instead.</span>
            </>
          )}
        </p>
        <div className="hs-row">
          <Toggle label="Vibration" value={settings.haptics} onChange={(v) => update({ haptics: v })} disabled={!haptics.supported} />
          <button type="button" className="hs-btn small" onClick={() => haptics.play('test')} disabled={!haptics.supported || !settings.haptics}>
            Test
          </button>
        </div>
      </section>

      <section>
        <h3>Sound</h3>
        <div className="hs-row">
          <Toggle
            label="Sound"
            value={settings.sound}
            onChange={(v) => {
              update({ sound: v })
              audio.init()
              audio.setMuted(!v)
              if (v) audio.test()
            }}
          />
        </div>
      </section>

      <section>
        <h3>Hearing (optional)</h3>
        <p className="hs-dim small">
          With this on, loud or sudden sounds near the phone disturb him. Only the loudness is measured, on this device; nothing is recorded or sent. The game is fully playable
          without it.
        </p>
        <p className="hs-status">
          Microphone: <span className={micOn ? 'ok' : 'warn'}>{MIC_TEXT[mic.status] ?? mic.status}</span>
        </p>
        <div className="hs-row">
          <Toggle label="Microphone" value={micOn || mic.status === 'requesting'} onChange={setMic} disabled={mic.status === 'unsupported' || mic.status === 'insecure'} />
          {micOn && (
            <button type="button" className="hs-btn small" onClick={() => mic.calibrate()}>
              Recalibrate room
            </button>
          )}
        </div>
        {micOn && (
          <>
            <div className="hs-meter" aria-label="microphone level">
              <div style={{ width: `${Math.round(mic.meter() * 100)}%` }} />
              <i style={{ left: `${Math.round((1 / 1.6) * 100)}%` }} />
            </div>
            <Slider
              label="Hearing sensitivity"
              min={0}
              max={1}
              step={0.05}
              value={settings.micSensitivity}
              onChange={(v) => {
                mic.sensitivity = v
                update({ micSensitivity: v })
              }}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </>
        )}
      </section>

      {!compact && (
        <section>
          <h3>The house's memory</h3>
          <p className="hs-dim small">The house learns which of its strategies work against you. It can keep that between visits, in this browser only.</p>
          <div className="hs-row">
            <Toggle label="Remember between visits" value={settings.agentMemory !== false} onChange={(v) => update({ agentMemory: v })} />
            <button
              type="button"
              className="hs-btn small"
              onClick={() => {
                AgentMemory.forget()
                setForgot(true)
              }}
            >
              Forget what it learned
            </button>
          </div>
          {forgot && <p className="hs-ok small">Forgotten.</p>}
        </section>
      )}

      <section>
        <h3>His dream</h3>
        <Toggle label="Enter the dream in 3D" value={settings.dream3d !== false} onChange={(v) => update({ dream3d: v })} />
        <p className="hs-dim small">When he dreams he becomes an architect, and you walk through the house he dreams until you find the ANCHOR. Off: the dream stays on the plan, as before.</p>
      </section>

      {!compact && (
        <section>
          <h3>Development</h3>
          <Toggle label="Debug mode" value={settings.debug} onChange={(v) => update({ debug: v })} />
          <p className="hs-dim small">Shows the house's goals, utilities, memory and decisions, the walls, wind and sunlight, and sensor diagnostics, with controls to test them.</p>
        </section>
      )}
    </div>
  )
}
