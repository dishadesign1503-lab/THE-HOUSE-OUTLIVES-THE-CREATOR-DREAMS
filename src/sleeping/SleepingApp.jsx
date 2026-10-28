import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorld, begin, stepWorld, act } from './sim/world.js'
import { deformLattice } from './house/bodyMap.js'
import { ROOMS } from './house/plan.js'
import { ENDINGS, objectiveFor } from './story/progression.js'
import { HouseAudio } from './audio/houseAudio.js'
import HouseView from './components/HouseView.jsx'
import PurushaPanel from './components/PurushaPanel.jsx'
import Inspector from './components/Inspector.jsx'
import { EndingCard, Intro, Notices, ObjectiveBar, Observations } from './components/Overlays.jsx'
import './sleeping.css'

const ENDING_REVEAL_S = 6
const SEEN_KEY = 'sleeping-house-endings'

function loadSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? []
  } catch {
    return []
  }
}
function saveSeen(list) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(list))
  } catch {
    // private mode: endings are remembered for this visit only
  }
}

export default function SleepingApp() {
  const [world, setWorld] = useState(() => createWorld())
  const worldRef = useRef(world)
  worldRef.current = world
  const audioRef = useRef(null)
  if (!audioRef.current) audioRef.current = new HouseAudio()
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)
  const [sound, setSound] = useState(true)
  const [, setTick] = useState(0)
  const [selected, setSelected] = useState(null)
  const [obsOpen, setObsOpen] = useState(true)
  const [seen, setSeen] = useState(loadSeen)
  const [cardHidden, setCardHidden] = useState(false)

  // ---------- the loop ----------
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let frame = 0
    let lastAudio = 0
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const w = worldRef.current
      if (startedRef.current) stepWorld(w, dt * (import.meta.env.DEV ? (window.__sleepingSpeed ?? 1) : 1))
      else w.body.update(dt)
      if (now - lastAudio > 90) {
        lastAudio = now
        audioRef.current.sync(w)
      }
      frame += 1
      if (frame % 2 === 0) setTick((t) => t + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const start = useCallback(async (withSound) => {
    setSound(withSound)
    if (withSound) {
      try {
        await audioRef.current.start()
      } catch {
        setSound(false)
      }
    }
    begin(worldRef.current)
    startedRef.current = true
    setStarted(true)
  }, [])

  const toggleSound = useCallback(async () => {
    const next = !sound
    setSound(next)
    if (next && !audioRef.current.ready) await audioRef.current.start().catch(() => setSound(false))
    audioRef.current.setMuted(!next)
  }, [sound])

  const onAct = useCallback((a) => act(worldRef.current, a), [])

  // In development, expose the world for debugging in the browser console.
  useEffect(() => {
    if (import.meta.env.DEV) window.__sleeping = { world: () => worldRef.current, act: onAct }
  }, [onAct])

  const replay = useCallback(() => {
    const w = createWorld()
    begin(w)
    worldRef.current = w
    setWorld(w)
    setSelected(null)
    setCardHidden(false)
  }, [])

  // remember which endings have been found
  const ending = world.story.ending
  useEffect(() => {
    if (ending && !seen.includes(ending.kind)) {
      const next = [...seen, ending.kind]
      setSeen(next)
      saveSeen(next)
    }
  }, [ending, seen])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
        setSelected(ROOMS[Number(e.key) - 1].id)
      } else if (e.key === 'Escape') setSelected(null)
      else if (e.key === 'o' || e.key === 'O') setObsOpen((v) => !v)
      else if (e.key === 'm' || e.key === 'M') toggleSound()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSound])

  const { story, body } = world
  const regions = body.regionState()
  const endingInfo = ending ? { kind: ending.kind, k: Math.min(1, (story.t - ending.t) / ENDING_REVEAL_S) } : null
  const lattice = deformLattice(regions, endingInfo)
  const objective = started ? objectiveFor(world) : null
  const time = performance.now() / 1000

  return (
    <div className={`sleeping ${endingInfo ? `is-ending ending-${endingInfo.kind}` : ''} ${world.env.outside.storm ? 'storm' : ''}`}>
      <main className="stage">
        <HouseView world={world} lattice={lattice} regions={regions} selected={selected} onSelect={setSelected} onAct={onAct} ending={endingInfo} time={time} />
        <ObjectiveBar phase={story.phase} objective={objective} />
        {started && !ending && (
          <Inspector world={world} roomId={selected} onAct={onAct} onClose={() => setSelected(null)} canSearch={story.phase === 'locate' && !story.pending} />
        )}
        <Notices notices={story.notices} now={story.t} />
        {endingInfo && endingInfo.k < 1 && (
          <p className="ending-title" style={{ opacity: Math.sin(endingInfo.k * Math.PI) }} aria-hidden="true">
            {ENDINGS[endingInfo.kind].title}
          </p>
        )}
        {endingInfo && (
          <div className="dawn-wash" style={{ opacity: endingInfo.k * (endingInfo.kind === 'restored' ? 0.25 : 0.4) }} aria-hidden="true" />
        )}
      </main>
      <div className="side">
        <header className="topbar">
          <span className="brand">The Sleeping House</span>
          <div className="top-actions">
            <button type="button" className="ghost-btn" onClick={toggleSound} aria-pressed={sound} title="Sound (M)">
              {sound ? 'Sound on' : 'Sound off'}
            </button>
            {started && (
              <button type="button" className="ghost-btn" onClick={replay} title="Begin a new night">
                Restart
              </button>
            )}
          </div>
        </header>
        <PurushaPanel world={world} regions={regions} />
        <Observations discoveries={world.discoveries} open={obsOpen} onToggle={() => setObsOpen((v) => !v)} />
      </div>
      {!started && <Intro onStart={start} />}
      <EndingCard ending={ending} seen={seen} onReplay={replay} visible={endingInfo?.k >= 1} hidden={cardHidden} onHide={setCardHidden} />
    </div>
  )
}
