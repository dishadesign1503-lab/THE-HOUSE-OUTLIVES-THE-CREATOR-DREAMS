import { useState } from 'react'

const stamp = (t, t0) => {
  const s = Math.max(0, Math.floor(t - t0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// The daemon's log: short entries generated from what it actually heard and did.
export default function DaemonLog({ entries, t0 }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`panel log ${open ? 'open' : ''}`} aria-label="Daemon log">
      <button className="panel-title log-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Daemon log <span className="dim">{open ? '−' : `+ ${entries.length}`}</span>
      </button>
      {open && (
        <ol className="log-list">
          {entries.length === 0 && <li className="dim">Nothing yet.</li>}
          {[...entries].reverse().map((e) => (
            <li key={e.id} className={`log-${e.kind}`}>
              <time>{stamp(e.t, t0)}</time>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
