import { useEffect, useRef, useState } from 'react'
import { keyDirection } from '../sensors/tilt.js'

// Hold the phone comfortably, set that as level, and try the tilt and the vibration
// before entering the house.

export default function Calibration({ services, settings, onDone, onBack }) {
  const { sensors, tilt, haptics } = services
  const [status, setStatus] = useState(sensors.status)
  const [calibrated, setCalibrated] = useState(tilt.calibrated)
  const [vibrated, setVibrated] = useState(null)
  const dot = useRef(null)

  // live preview: the same tilt the game will use, shown as a dot in a ring
  useEffect(() => {
    let raf
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      tilt.deadzone = settings.deadzone
      const v = tilt.read(sensors.active ? sensors.gravity : null, dt)
      if (dot.current) dot.current.style.transform = `translate(${v.x * 52}px, ${v.y * 52}px)`
      setStatus(sensors.status)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const kd = (e) => {
      const d = keyDirection(e.code)
      if (d) tilt.keys.add(d)
    }
    const ku = (e) => {
      const d = keyDirection(e.code)
      if (d) tilt.keys.delete(d)
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      tilt.keys.clear()
    }
  }, [sensors, tilt, settings.deadzone])

  const enable = async () => {
    setStatus(await sensors.request())
  }

  const calibrate = () => {
    if (tilt.calibrate(sensors.gravity)) {
      setCalibrated(true)
      haptics.play('tap')
    }
  }

  const testVibration = () => {
    const ok = haptics.play('test')
    setVibrated(haptics.supported ? (ok ? 'Requested. Did you feel it?' : 'The browser refused the request.') : 'This browser cannot vibrate. The game shows a flash instead.')
  }

  const active = status === 'active'
  const fallback = ['unsupported', 'insecure', 'denied', 'no-data'].includes(status)

  return (
    <div className="hs-screen hs-calibrate">
      <h2>Before you enter</h2>
      <ul className="hs-rules">
        <li>Tilt the phone to roll the blue circle.</li>
        <li>Avoid the walls. A body sleeps beneath them; every knock reaches him.</li>
        <li>When he changes how he lies, the walls follow. While the frame is orange, hold still.</li>
        <li>Draughts push you. Sunlit floor is slippery.</li>
      </ul>

      <div className="hs-tiltbox" aria-hidden="true">
        <div className="hs-tiltring" />
        <div className="hs-tiltdot" ref={dot} />
      </div>

      {active ? (
        <>
          <p className="hs-dim small">Hold the phone the way you want to play, then set that as level. Tilting from there moves the circle.</p>
          <button type="button" className="hs-btn" onClick={calibrate}>
            {calibrated ? 'Set level again' : 'Set this as level'}
          </button>
          {calibrated && <p className="hs-ok small">Level set.</p>}
        </>
      ) : fallback ? (
        <p className="hs-fallback">
          {status === 'insecure'
            ? 'Motion sensors need a secure (https) page.'
            : status === 'denied'
              ? 'Motion permission was denied.'
              : 'No motion sensors are sending data here.'}{' '}
          <strong>Fallback controls:</strong> arrow keys / WASD, or press and drag on the plan.
        </p>
      ) : (
        <button type="button" className="hs-btn" onClick={enable}>
          Enable motion sensors
        </button>
      )}

      <div className="hs-row center">
        <button type="button" className="hs-btn small" onClick={testVibration}>
          Test vibration
        </button>
      </div>
      {vibrated && <p className="hs-dim small center">{vibrated}</p>}

      <div className="hs-actions">
        <button type="button" className="hs-btn primary" onClick={() => onDone()} disabled={active && !calibrated}>
          Enter the house
        </button>
        <button type="button" className="hs-btn ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
