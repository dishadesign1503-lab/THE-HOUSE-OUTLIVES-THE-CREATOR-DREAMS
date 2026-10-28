import { useEffect, useRef } from 'react'
import { SIMULATED_INPUTS, simulatedWave } from '../hearing/simulated.js'

// What the daemon can hear: a microphone (optional) and simulated sounds (always available).
export default function HearingPanel({ mic, onToggleMic, sensitivity, onSensitivity, onSimulate, lastSim, disabled }) {
  const canvasRef = useRef(null)

  // Draw the waveform of what is being heard.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    let raf
    const draw = () => {
      const { width, height } = canvas
      g.clearRect(0, 0, width, height)
      g.strokeStyle = 'rgba(233,224,207,0.12)'
      g.beginPath()
      g.moveTo(0, height / 2)
      g.lineTo(width, height / 2)
      g.stroke()
      let data = mic.instance?.waveform()
      let gainK = 3
      if (!data && lastSim) {
        data = simulatedWave(lastSim.kind, performance.now() / 1000 - lastSim.at)
        gainK = 1
      }
      if (data) {
        const level = mic.instance?.level ?? 0
        g.strokeStyle = level > (mic.instance?.threshold ?? 1) ? '#D8A85D' : 'rgba(216,168,93,0.6)'
        g.lineWidth = 1.2
        g.beginPath()
        const step = data.length / width
        for (let x = 0; x < width; x++) {
          const v = data[Math.floor(x * step)] * gainK
          const y = height / 2 - Math.max(-1, Math.min(1, v)) * (height / 2 - 2)
          x ? g.lineTo(x, y) : g.moveTo(x, y)
        }
        g.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [mic.instance, lastSim])

  return (
    <section className="panel hearing" aria-label="Hearing">
      <h2 className="panel-title">
        Its only sense <span className="dim">hearing</span>
      </h2>
      <canvas ref={canvasRef} className="wave" width={280} height={44} />
      <div className="mic-row">
        <button className={`btn ${mic.status === 'on' ? 'active' : ''}`} onClick={onToggleMic} disabled={disabled || mic.status === 'asking'}>
          <span className={`led ${mic.status === 'on' ? 'on' : ''}`} />
          {mic.status === 'on' ? 'Microphone listening' : mic.status === 'asking' ? 'Asking permission…' : 'Enable microphone'}
        </button>
      </div>
      {mic.status === 'on' && (
        <label className="slider">
          <span>Sensitivity</span>
          <input type="range" min="0" max="1" step="0.05" value={sensitivity} onChange={(e) => onSensitivity(+e.target.value)} />
        </label>
      )}
      {mic.error && <p className="note warn">{mic.error}</p>}
      <p className="note">
        {mic.status === 'on'
          ? 'Analysed live for loudness, length, brightness and rhythm. Nothing is recorded and no words are understood.'
          : 'Or make a sound for it:'}
      </p>
      <div className="sim-grid">
        {SIMULATED_INPUTS.map((s) => (
          <button key={s.kind} className="btn sim" onClick={() => onSimulate(s.kind)} title={s.hint} disabled={disabled}>
            {s.label}
          </button>
        ))}
      </div>
    </section>
  )
}
