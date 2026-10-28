import { useEffect, useMemo, useRef, useState } from 'react'
import { pickArchitect, dreamHouse } from './architects.js'
import { DreamWorld } from './world.js'
import './dream3d.css'

// HE DREAMS HE IS AN ARCHITECT — the overlay over the paused plan.
//   falling   "Ohh no... He's dreaming!" over the plan, as in the 2D dream
//   declare   he names himself: the architect, "I AM …", what that architect believes
//   dream     the plan transforms, seen from above, and the camera comes down into it
//   walk      the player looks for the ANCHOR
//   waking    found: the light fills the screen, and the game returns to the plan (onWake)
// If the plan cannot be rebuilt with the anchor in reach, it says so at once (onFail) and the
// dream goes on in 2D.

const T_FALLING = 2.6
const T_DECLARE = 5.2
const T_WAKING = 1.4
const TOUCH = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export default function DreamWalk({ plan, services, onWake, onFail }) {
  const architect = useMemo(() => pickArchitect(plan.seed), [plan])
  const dream = useMemo(() => dreamHouse(plan, architect), [plan, architect])
  const canvasRef = useRef(null)
  const worldRef = useRef(null)
  const [stage, setStage] = useState('falling')
  const [hint, setHint] = useState(null)
  // the latest callbacks, so a re-render of the game screen never rebuilds the dream
  const cb = useRef({})
  cb.current = { onWake, onFail }

  // the world is built at once (from above, still the plan), behind the cards
  useEffect(() => {
    if (!dream) {
      cb.current.onFail()
      return
    }
    const world = new DreamWorld({
      canvas: canvasRef.current,
      dream,
      architect,
      plan,
      services,
      onWalk: () => {
        setStage('walk')
        setHint(TOUCH ? 'Find the ANCHOR. Left thumb walks, right thumb looks; or lean the phone.' : 'Find the ANCHOR. W A S D to walk, click and move the mouse to look, Shift to run.')
      },
      onLost: () => setHint('The anchor hums. Follow the sound, or the light.'),
      onFound: () => setStage('waking'),
    })
    worldRef.current = world
    return () => world.destroy()
  }, [dream, architect, plan, services])

  // the timeline before the walk, and after it
  useEffect(() => {
    if (!dream) return
    let timer
    if (stage === 'falling') timer = setTimeout(() => setStage('declare'), T_FALLING * 1000)
    else if (stage === 'declare')
      timer = setTimeout(() => {
        setStage('dream')
        worldRef.current?.begin()
      }, T_DECLARE * 1000)
    else if (stage === 'waking') timer = setTimeout(() => cb.current.onWake(), T_WAKING * 1000)
    return () => clearTimeout(timer)
  }, [stage, dream])

  // the walking hint fades after a while
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 9000)
    return () => clearTimeout(t)
  }, [hint])

  if (!dream) return null
  const name = architect.declaration.replace(/^I AM /, '').replace(/\.$/, '')

  return (
    <div className={`dw-root dw-${stage}`} style={{ '--dw-accent': architect.accent }}>
      <canvas ref={canvasRef} className="dw-canvas" />

      {stage === 'falling' && (
        <div className="hs-dream-banner" role="alert">
          <p data-text="Ohh no... He's dreaming!">Ohh no... He's dreaming!</p>
        </div>
      )}

      {stage === 'declare' && (
        <div className="dw-declare" role="alert">
          <p className="dw-who">
            {architect.name} · {architect.years}
          </p>
          <h2 data-text={architect.declaration}>{architect.declaration}</h2>
          <p className="dw-motto">“{architect.motto}”</p>
          <ul>
            {architect.principles.map((p, i) => (
              <li key={p} style={{ animationDelay: `${1.4 + i * 0.5}s` }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage === 'dream' && <p className="dw-caption">The plan becomes {name}'s.</p>}

      {(stage === 'walk' || stage === 'waking') && (
        <div className="dw-hud">
          <span className="hs-chip">DREAM · {name}</span>
          <span className="dw-cross" aria-hidden="true" />
        </div>
      )}
      {stage === 'walk' && hint && (
        <p className="dw-hint" key={hint}>
          {hint}
        </p>
      )}

      {stage === 'waking' && <div className="dw-wake" />}
    </div>
  )
}
