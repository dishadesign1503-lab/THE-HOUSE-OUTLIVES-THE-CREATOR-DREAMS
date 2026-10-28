import { useEffect, useRef, useState } from 'react'

// THE WARNING — shown once after Start, before calibration.
// The words appear one letter at a time, like an old typewriter, pausing at each sentence, over a
// quiet "shhhh" (audio.hushStart). A click or key press shows the rest at once; a second one, or a
// short wait once it is all written, fades into the game and lets the hiss die away.

const TEXT = 'A word, a whisper, a knock against the wall… the daemon hears it all.\n\nBe careful what you say. Be careful what you disturb.'
const HOLD = 2800 // ms the finished text stays before the game begins
const FADE = 900 // ms of the fade into the game

// how long to wait after a character before the next one
function pauseAfter(ch) {
  if (ch === '…') return 900
  if (ch === '.') return 1100
  if (ch === ',') return 380
  if (ch === '\n') return 700
  return 60 + Math.random() * 45
}

export default function Disclaimer({ audio, onDone }) {
  const instant = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [count, setCount] = useState(instant ? TEXT.length : 0)
  const [stage, setStage] = useState(instant ? 'hold' : 'typing') // typing | hold | leaving
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // the hiss starts with the warning (the Start tap has already unlocked the sound)
  useEffect(() => {
    audio.hushStart()
    return () => audio.hushStop()
  }, [audio])

  useEffect(() => {
    if (stage === 'typing') {
      if (count >= TEXT.length) {
        setStage('hold')
        return
      }
      const id = setTimeout(() => setCount((c) => c + 1), count === 0 ? 700 : pauseAfter(TEXT[count - 1]))
      return () => clearTimeout(id)
    }
    if (stage === 'hold') {
      const id = setTimeout(() => setStage('leaving'), HOLD)
      return () => clearTimeout(id)
    }
    audio.hushStop(FADE / 1000 + 0.4)
    const id = setTimeout(() => doneRef.current(), FADE)
    return () => clearTimeout(id)
  }, [stage, count, audio])

  // first press: the whole text at once; second press: on into the game
  const advance = () => {
    if (stage === 'typing') {
      setCount(TEXT.length)
      setStage('hold')
    } else if (stage === 'hold') setStage('leaving')
  }
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return
      e.preventDefault()
      advanceRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`hs-disclaimer ${stage === 'leaving' ? 'leaving' : ''}`} onClick={advance}>
      <p className="hs-disclaimer-sr">{TEXT}</p>
      <p className="hs-disclaimer-text" aria-hidden="true">
        {TEXT.slice(0, count)}
        <span className={`hs-disclaimer-caret ${stage === 'typing' ? '' : 'idle'}`} />
      </p>
      <p className="hs-disclaimer-skip small hs-dim" aria-hidden="true">
        {stage === 'typing' ? 'click or press any key to skip' : 'click or press any key to enter'}
      </p>
    </div>
  )
}
