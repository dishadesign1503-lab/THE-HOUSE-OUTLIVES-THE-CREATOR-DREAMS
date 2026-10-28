import { useEffect, useRef, useState } from 'react'

// HYPNOTIZE — the button under the plan, and the popup that explains and listens.
//
// 1. HYPNOTIZE opens the popup (nothing is recorded yet).
// 2. START SPEAKING asks for the microphone (only now) and listens.
// 3. STOP: the words are recognised on this device (listener.js) and checked: "You are …" + an
//    object he can picture (objects.js, via the game). If they pass, the popup closes and the
//    hypnosis begins; if not, it says what it heard and why, with RETRY.

const EXAMPLES = ['YOU ARE A LAMP STAND', 'YOU ARE A BOAT', 'YOU ARE A TREE', 'YOU ARE A STONE', 'YOU ARE A BRIDGE']

export default function HypnoControl({ services, engineRef, show, disabled }) {
  const v = services.voice
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('ready') // ready | loading | recording | recognizing | heard | error
  const [heard, setHeard] = useState('')
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const [busy, setBusy] = useState(null) // null, or why he cannot be hypnotised now
  const closeTimer = useRef(null)

  // never leave the microphone open behind an overlay or when leaving the game
  useEffect(() => {
    if (disabled && v.status === 'recording') {
      v.cancel()
      engineRef.current?.hypnoCancel()
      setPhase('ready')
    }
  }, [disabled, v, engineRef])
  useEffect(
    () => () => {
      v.cancel()
      clearTimeout(closeTimer.current)
    },
    [v],
  )
  // while the popup is open the game knows the player is hypnotising him
  useEffect(() => {
    engineRef.current?.setListening(open)
    return () => engineRef.current?.setListening(false)
  }, [open, engineRef])

  // the button is unavailable while a hypnosis is still running
  useEffect(() => {
    const id = setInterval(() => {
      const g = engineRef.current?.game
      setBusy(!g ? null : g.dream ? 'He is dreaming. Reach the ANCHOR.' : g.trance || g.hypno?.phase === 'interpreting' ? 'He is under the suggestion…' : null)
    }, 250)
    return () => clearInterval(id)
  }, [engineRef])

  const close = () => {
    if (v.status === 'recording') {
      v.cancel()
      engineRef.current?.hypnoCancel()
    }
    setOpen(false)
    setPhase('ready')
  }

  // hand the words to the game; it checks them and, if they pass, the hypnosis begins
  const submit = (words, meta) => {
    const r = engineRef.current?.hypnotize(words, meta)
    if (!r) return
    setHeard(r.sentence ?? words)
    if (!r.ok) {
      setError(r.error)
      setPhase('error')
      return
    }
    setError('')
    setPhase('heard')
    show(`“${r.sentence}”`)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setPhase('ready')
    }, 1100)
  }

  const start = async () => {
    setError('')
    setHeard('')
    services.audio.init()
    setPhase('loading')
    try {
      await v.start({ onLevel: (l) => (engineRef.current?.hypnoLevel(l), setLevel(l)), onAutoStop: () => stop() })
      engineRef.current?.hypnoStart()
      setPhase('recording')
    } catch {
      engineRef.current?.hypnoCancel()
      setError(v.reason)
      setPhase('error')
    }
  }

  const stop = async () => {
    if (v.status !== 'recording') return
    setPhase('recognizing')
    const { text, loudness, via } = await v.stop()
    setLevel(0)
    if (!text) {
      engineRef.current?.hypnoCancel()
      setHeard('')
      setError('No words could be made out. Speak a little closer, the whole sentence, then press Stop.')
      setPhase('error')
      return
    }
    submit(text, { source: via === 'guided' ? 'voice (guided)' : 'voice', loudness })
  }

  const micOk = v.available
  return (
    <>
      <div className="hs-hypno">
        <button type="button" className="hs-btn hs-hypnotize" disabled={disabled || !!busy} onClick={() => setOpen(true)}>
          <Spiral /> HYPNOTIZE
        </button>
        <span className="hs-hypno-label">{busy ?? 'Tell him what he is.'}</span>
      </div>

      {open && (
        <div className="hs-sheet" role="dialog" aria-modal="true" aria-labelledby="hs-hyp-title">
          <div className="hs-sheet-card">
            <div className="hs-sheet-head">
              <h2 id="hs-hyp-title">HYPNOTIZE THE DEMON</h2>
              <button type="button" className="hs-btn tiny ghost" aria-label="Close" onClick={close}>
                ✕
              </button>
            </div>
            <p className="hs-sheet-em">
              Speak a hypnotic instruction beginning with “YOU ARE…” followed by an object.
            </p>
            <ul className="hs-sheet-examples">
              {EXAMPLES.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>

            {phase !== 'recording' && phase !== 'recognizing' && phase !== 'heard' && (
              <button type="button" className="hs-btn primary hs-speak" disabled={!micOk || phase === 'loading'} onClick={start}>
                <MicIcon /> {phase === 'error' ? 'RETRY — START SPEAKING' : phase === 'loading' ? 'LOADING THE LISTENING MODEL…' : 'START SPEAKING'}
              </button>
            )}
            {phase === 'recording' && (
              <div className="hs-rec">
                <span className="hs-rec-dot" aria-hidden="true" />
                <span className="hs-rec-text">LISTENING — say the whole sentence</span>
                <span className="hs-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(level * 100)}%` }} />
                </span>
                <button type="button" className="hs-btn primary small" onClick={stop}>
                  STOP
                </button>
              </div>
            )}
            {phase === 'recognizing' && <p className="hs-sheet-status">Recognising the words…</p>}
            {phase === 'loading' && <p className="hs-sheet-status small">The listening model (41 MB) loads once, then works offline on this device.</p>}
            {phase === 'heard' && (
              <p className="hs-sheet-status ok">
                Heard: “{heard}”. He takes in the suggestion…
              </p>
            )}
            {phase === 'error' && (
              <div className="hs-sheet-error" role="alert">
                {heard && <p>Heard: “{heard}”</p>}
                <p>{error}</p>
              </div>
            )}
            {!micOk && <p className="hs-sheet-status small">{v.reason}</p>}

            <p className="hs-sheet-note">The demon will interpret your suggestion and attempt to embody it through its sleeping posture. You cannot predict exactly how it will respond.</p>
          </div>
        </div>
      )}
    </>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Spiral() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 12m0 0a1 1 0 0 1 2 0a3 3 0 0 1-5 2a5 5 0 0 1 3-8a7 7 0 0 1 7 7a9 9 0 0 1-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
