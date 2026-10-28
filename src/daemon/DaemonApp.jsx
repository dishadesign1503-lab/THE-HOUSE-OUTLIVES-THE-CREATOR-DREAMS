import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Daemon, DEFAULT_CONFIG } from './engine/daemon.js'
import { analyse, canPlace, CENTRE, GRID, zoneOfCell } from './engine/layout.js'
import { INITIAL_LAYOUT, ROOM_TYPES, footprint, newRoomId } from './engine/rooms.js'
import { SoundEngine } from './voice/soundEngine.js'
import { familyLevels, soundscapeFor } from './voice/soundscape.js'
import { Microphone } from './hearing/microphone.js'
import { simulatedPerception } from './hearing/simulated.js'
import { DEMO_STEPS } from './demo.js'
import Board, { CELL, R_TABLE, boardToScreen, pointerToBoard, roomCentrePx } from './components/Board.jsx'
import { RoomDefs, RoomShape } from './components/RoomGlyph.jsx'
import RoomTray from './components/RoomTray.jsx'
import StatusPanel from './components/StatusPanel.jsx'
import HearingPanel from './components/HearingPanel.jsx'
import SoundPanel from './components/SoundPanel.jsx'
import DaemonLog from './components/DaemonLog.jsx'
import { DemoBar, Help, Intro } from './components/Overlays.jsx'
import VastuPanel from './components/VastuPanel.jsx'
import VastuReference from './components/VastuReference.jsx'
import UpgradeShop from './components/UpgradeShop.jsx'
// The 3D house loads only when someone enters it (Three.js is large).
const WalkView = lazy(() => import('./components/WalkView.jsx'))
import WalkBoundary from './components/WalkBoundary.jsx'
import { CoinCounter, HouseCondition, PlanBar, RewardFeed, flyCoins } from './components/Hud.jsx'
import { assess, regionStates, statusOf, summary } from './vastu/assess.js'
import { reactionFor } from './vastu/responses.js'
import { initialHouse, layoutOptions, remaining, usableFn, wingOf } from './progress/house.js'
import { purchase } from './progress/upgrades.js'
import { RewardTracker } from './progress/rewards.js'
import { WALK_COINS_PER_VISIT } from './progress/economy.js'
import { houseCondition } from './progress/condition.js'
import { validateLayout } from './walk/validate.js'
import { buildHouse } from './walk/plan.js'
import { chooseScenes, hash } from './walk/scenes.js'
import './daemon.css'

const TICK_MS = 200
const SETTLE_MS = 900 // wait this long after the last placement before the daemon re-hears the house
const CUE_COOLDOWN_S = 0.7 // repeated moves don't stack Vastu cues
const REACTION_MS = 3200
const RESTORE_REWARD_GAP_S = 120
const nowS = () => performance.now() / 1000

const OUTCOME_COLOUR = {
  harmony: 'rgb(217,137,69)',
  tension: 'rgb(196,90,66)',
  isolation: 'rgb(169,200,232)',
  confusion: 'rgb(21,93,99)',
  abandonment: 'rgb(150,144,130)',
  listening: 'rgb(196,161,90)',
}

function useOnce(make) {
  const ref = useRef(null)
  if (ref.current === null) ref.current = make()
  return ref.current
}

// Click-to-place: a free, built cell next to the house, aligned if possible, centre left open.
function findSpot(rooms, type, usable) {
  let best = null
  for (let col = 0; col < GRID; col++) {
    for (let row = 0; row < GRID; row++) {
      const cand = { id: '__new', type, rotation: 0, col, row }
      if (!canPlace(rooms, cand, usable)) continue
      const centre = col >= CENTRE.min && col <= CENTRE.max && row >= CENTRE.min && row <= CENTRE.max
      const touches = rooms.some((r) => Math.abs(r.col - col) + Math.abs(r.row - row) === 1)
      const aligned = statusOf(cand, { usable }) === 'aligned'
      const score = (aligned ? 0 : 3) + (touches ? 0 : 4) + (centre && type !== 'garden' ? 6 : 0) + Math.random() * 0.5
      if (!best || score < best.score) best = { ...cand, score }
    }
  }
  return best
}

export default function DaemonApp() {
  const daemon = useOnce(() => new Daemon())
  const engine = useOnce(() => new SoundEngine())
  const tracker = useOnce(() => new RewardTracker())
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const counterRef = useRef(null)

  // ---------- house and layout state ----------
  const [house, setHouseState] = useState(initialHouse)
  const houseRef = useRef(house)
  const setHouse = useCallback((next) => {
    const h = typeof next === 'function' ? next(houseRef.current) : next
    houseRef.current = h
    setHouseState(h)
  }, [])
  const [rooms, setRooms] = useState(INITIAL_LAYOUT)
  const roomsRef = useRef(rooms)
  const usable = useMemo(() => usableFn(house), [house])
  const usableRef = useRef(usable)
  usableRef.current = usable
  const layoutOpts = useMemo(() => layoutOptions(house), [house])
  const analysis = useMemo(() => analyse(rooms, layoutOpts), [rooms, layoutOpts])
  const lastChangeAt = useRef(-99)

  const [view, setView] = useState(() => daemon.view())
  const [history, setHistory] = useState([])
  const [log, setLog] = useState([])
  const [started, setStarted] = useState(false)
  const [audioError, setAudioError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const [ripples, setRipples] = useState([])
  const [toast, setToast] = useState(null)
  const [feed, setFeed] = useState([])
  const [coinPulse, setCoinPulse] = useState(0)

  const [volume, setVolume] = useState(0.5)
  const [ambienceVol, setAmbienceVol] = useState(0.75)
  const [eventsVol, setEventsVol] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [families, setFamilies] = useState({ household: 0, conflict: 0, loss: 0, building: 0, confusion: 0 })
  const [mic, setMic] = useState({ status: 'off', instance: null, error: null })
  const [sensitivity, setSensitivity] = useState(0.5)
  const [withMic, setWithMic] = useState(false)
  const [lastSim, setLastSim] = useState(null)

  const [silence, setSilenceState] = useState(DEFAULT_CONFIG.silenceThreshold)
  const silenceRef = useRef(silence)
  const [showHelp, setShowHelp] = useState(false)
  const [showInner, setShowInner] = useState(false)
  const [showShop, setShowShop] = useState(false)
  const [theme, setTheme] = useState('day')
  const [confirmReset, setConfirmReset] = useState(false)
  const [demo, setDemo] = useState(null)
  const demoRef = useRef(null)
  const t0 = useRef(nowS())

  // Vastu layer
  const [focusId, setFocusId] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [cueSound, setCueSound] = useState(true)
  const cueSoundRef = useRef(true)
  cueSoundRef.current = cueSound
  const lastCue = useRef(0)
  const [showFigure, setShowFigure] = useState(true)
  const [showZoneNames, setShowZoneNames] = useState(true)
  const [showRef, setShowRef] = useState(false)

  // build / walk
  const [mode, setMode] = useState('plan') // plan | entering | walk | leaving
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [walk, setWalk] = useState(null)
  const [validation, setValidation] = useState(null)
  const enterCount = useRef(0)

  // The daemon hears the house as it is now: upgrades and the open wings change its analysis.
  useEffect(() => {
    daemon.config.features = house.features
    daemon.config.layoutOptions = layoutOpts
  }, [daemon, house.features, layoutOpts])

  const setSilence = useCallback(
    (v) => {
      daemon.config.silenceThreshold = v
      silenceRef.current = v
      setSilenceState(v)
    },
    [daemon],
  )

  const addRipple = useCallback((rp) => {
    const id = `${performance.now()}-${Math.random()}`
    setRipples((rs) => [...rs.slice(-10), { ...rp, id }])
    setTimeout(() => setRipples((rs) => rs.filter((r) => r.id !== id)), 2600)
  }, [])

  const flash = useCallback((text) => setToast({ text, id: Math.random() }), [])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  const pushFeed = useCallback((item) => {
    const id = `${performance.now()}${Math.random()}`
    setFeed((f) => [...f.slice(-3), { ...item, id }])
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4800)
  }, [])

  // Where a room (or the board centre) is on screen.
  const screenOf = useCallback((roomId) => {
    const svg = svgRef.current
    const room = roomsRef.current.find((r) => r.id === roomId)
    if (!svg || modeRef.current === 'walk') return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const c = room ? roomCentrePx(room) : { x: 0, y: 0 }
    return boardToScreen(svg, c.x, c.y)
  }, [])
  const counterPoint = () => {
    const el = modeRef.current === 'walk' ? document.querySelector('.walk-coins .coin-icon') : counterRef.current

    const r = el?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2 - 9, y: r.y + r.height / 2 - 9 } : { x: 40, y: 40 }
  }

  // Coins earned: the real balance changes, coins fly, a soft sound, a note says why.
  const grant = useCallback(
    (rewards) => {
      const list = rewards.filter(Boolean)
      if (!list.length) return
      const total = list.reduce((s, r) => s + r.amount, 0)
      setHouse((h) => ({ ...h, coins: h.coins + total }))
      for (const r of list) {
        pushFeed(r)
        flyCoins(screenOf(r.at), counterPoint(), r.amount, { onArrive: () => setCoinPulse((p) => p + 1) })
      }
      engine.play('coin', { size: total >= 15 ? 'big' : 'small', force: true })
    },
    [engine, pushFeed, screenOf, setHouse],
  )
  const grantRef = useRef(grant)
  grantRef.current = grant

  // ---------- daemon events → log, sound, ripples, rewards, dormancy ----------
  const lastRestoreReward = useRef(-Infinity)
  useEffect(
    () =>
      daemon.on((ev) => {
        if (ev.type === 'log') setLog((l) => [...l.slice(-80), ev.entry])
        else if (ev.type === 'reset') setLog([])
        else if (ev.type === 'sound') engine.play(ev.name, ev)
        else if (ev.type === 'heard' && !['magnet', 'footsteps'].includes(ev.perception.kind)) addRipple({ kind: 'heard', r: 120 })
        else if (ev.type === 'action') {
          const a = ev.action
          addRipple({ kind: `react ${a.type.toLowerCase()}`, r: 40 })
          const target = roomsRef.current.find((r) => r.id === a.rooms?.[0])
          if (target) addRipple({ kind: 'room', ...roomCentrePx(target), r: 50 })
          const t = nowS()
          // The daemon approves of a change the visitor just made.
          if ((a.type === 'SETTLE' || a.type === 'RECALL') && t - lastChangeAt.current < 6 && daemon.view().interpretation.mood === 'coherent') {
            grantRef.current([tracker.harmony(daemon.s.lastAnalysis?.signature, t, a.rooms?.[0])])
          }
          // Waking after a dormancy restores the building's activity.
          if (a.type === 'WAKE' && daemon.s.memory.abandonments > 0 && t - lastRestoreReward.current > RESTORE_REWARD_GAP_S) {
            lastRestoreReward.current = t
            grantRef.current([tracker.restoredActivity()])
          }
          // Going dormant: the rooms it had stopped hearing go dormant too.
          if (a.type === 'DORMANT') {
            const an = daemon.s.lastAnalysis
            const live = roomsRef.current.filter((r) => !r.dormant)
            let victims = an ? an.isolated.map((r) => r.id).filter((id) => live.some((r) => r.id === id)) : []
            if (!victims.length && live.length > 3 && an) {
              const leastConnected = [...an.rooms].sort((x, y) => x.neighbours.length - y.neighbours.length)[0]
              if (leastConnected && leastConnected.type !== 'entrance') victims = [leastConnected.id]
            }
            victims = victims.slice(0, 2)
            if (victims.length) {
              const next = roomsRef.current.map((r) => (victims.includes(r.id) ? { ...r, dormant: true } : r))
              roomsRef.current = next
              setRooms(next)
              for (const id of victims) daemon.narrate('DORMANT_ROOM', { room: ROOM_TYPES[next.find((r) => r.id === id).type].label.toLowerCase() })
            }
          }
        }
      }),
    [daemon, engine, tracker, addRipple],
  )

  // ---------- the clock ----------
  const prevStage = useRef(0)
  useEffect(() => {
    let last = nowS()
    let mixAt = 0
    let histAt = 0
    const id = setInterval(() => {
      const t = nowS()
      daemon.tick(t - last)
      last = t
      const v = daemon.view()
      setView(v)
      if (t - mixAt > 0.6) {
        mixAt = t
        if (modeRef.current === 'plan') engine.setLayers(soundscapeFor(v, roomsRef.current, houseRef.current.features))
        setFamilies(familyLevels(engine.levels ?? {}))
      }
      if (t - histAt > 1 && v.started) {
        histAt = t
        setHistory((h) => [...h.slice(-59), v.activity])
        grantRef.current([tracker.stability(v, daemon.s.lastAnalysis?.signature, t)])
      }
      // Shutting down: one zone of the house falls into neglect.
      if (v.silenceStage === 2 && prevStage.current < 2) {
        const h = houseRef.current
        const zones = [...new Set(roomsRef.current.map((r) => zoneOfCell(r.col, r.row)))].filter((z) => !h.neglected.includes(z) && !h.stabilised.includes(z))
        const isolatedZones = (daemon.s.lastAnalysis?.isolated ?? []).map((r) => zoneOfCell(r.col, r.row)).filter((z) => zones.includes(z))
        const zone = isolatedZones[0] ?? zones[Math.floor(Math.random() * zones.length)]
        if (zone) {
          setHouse((hh) => ({ ...hh, neglected: [...hh.neglected, zone] }))
          daemon.narrate('NEGLECT', { zone: { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west', C: 'centre' }[zone] })
        }
      }
      prevStage.current = v.silenceStage
    }, TICK_MS)
    return () => clearInterval(id)
  }, [daemon, engine, tracker, setHouse])

  // ---------- the board is heard after each settled change; challenges are checked ----------
  const vastuOf = useCallback((id) => {
    const r = roomsRef.current.find((x) => x.id === id)
    return r ? assess(r, [], { usable: usableRef.current }) : {}
  }, [])
  useEffect(() => {
    const id = setTimeout(() => {
      daemon.considerLayout(rooms.filter((r) => !r.dormant))
      if (daemon.s.started) grantRef.current(tracker.challenges(analyse(rooms, layoutOpts), vastuOf))
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [rooms, layoutOpts, daemon, tracker, vastuOf])

  const commit = useCallback(
    (next, touched) => {
      roomsRef.current = next
      setRooms(next)
      lastChangeAt.current = nowS()
      if (touched) {
        const c = roomCentrePx(touched)
        engine.play('magnet', { x: c.x / 420 })
        addRipple({ kind: 'place', ...c, r: 40 })
        daemon.hear({ kind: 'magnet', intensity: 0.4, source: 'board' })
      }
    },
    [engine, daemon, addRipple],
  )

  // The Vastu Purusha answers the room that just landed: one body region, one cue.
  const respond = useCallback(
    (room, next) => {
      const r = reactionFor(assess(room, next, { usable: usableRef.current }))
      setFocusId(room.id)
      setReaction({ ...r, key: `${room.id}-${performance.now()}` })
      const t = nowS()
      if (cueSoundRef.current && t - lastCue.current > CUE_COOLDOWN_S) {
        lastCue.current = t
        engine.vastuCue({ ...r, pan: roomCentrePx(room).x / 420 })
      }
    },
    [engine],
  )
  useEffect(() => {
    if (!reaction) return
    const id = setTimeout(() => setReaction(null), REACTION_MS)
    return () => clearTimeout(id)
  }, [reaction])

  const place = useCallback(
    (room, { quiet = false } = {}) => {
      const all = roomsRef.current
      const h = houseRef.current
      const existing = all.find((r) => r.id === room.id)
      if (!existing) {
        if (all.length >= h.maxRooms) {
          if (!quiet) flash('All room slots are used. Buy more in the upgrade shop.')
          return false
        }
        if (remaining(h, all, room.type) <= 0) {
          if (!quiet) flash(`No ${ROOM_TYPES[room.type].label.toLowerCase()} blocks left in the inventory.`)
          return false
        }
      }
      if (!canPlace(all, room, usableRef.current)) return false
      const before = existing ? statusOf(existing, { usable: usableRef.current }) : null
      const placed = existing ? { ...existing, col: room.col, row: room.row, rotation: room.rotation } : room
      const next = existing ? all.map((r) => (r.id === room.id ? placed : r)) : [...all, placed]
      commit(next, placed)
      respond(placed, next)
      const a = assess(placed, next, { usable: usableRef.current })
      const rewards = [tracker.placement(placed, before, a.status, a.primary)]
      const wing = wingOf(placed.col, placed.row)
      if (wing && a.status !== 'conflict') rewards.push(tracker.wing(wing, placed))
      grantRef.current(rewards)
      return true
    },
    [commit, respond, flash, tracker],
  )

  const remove = useCallback(
    (id) => {
      commit(roomsRef.current.filter((r) => r.id !== id))
      engine.play('lift')
      setSelectedId((s) => (s === id ? null : s))
    },
    [commit, engine],
  )

  // Single-cell rooms turn in place: rotation is the side they face (the entrance's front door).
  const rotate = useCallback(
    (id) => {
      const r = roomsRef.current.find((x) => x.id === id)
      if (r) place({ ...r, rotation: (r.rotation + 90) % 360 })
    },
    [place],
  )

  // ---------- upgrades ----------
  const buy = useCallback(
    (id) => {
      const selected = roomsRef.current.find((r) => r.id === selectedId)
      const result = purchase(id, houseRef.current, { selected, rooms: roomsRef.current })
      if (result.error) return flash(result.error)
      setHouse(result.house)
      // apply immediately so the daemon re-hears the upgraded house
      daemon.config.features = result.house.features
      daemon.config.layoutOptions = layoutOptions(result.house)
      if (result.roomPatch) {
        const next = roomsRef.current.map((r) => (r.id === result.roomPatch.id ? { ...r, ...result.roomPatch } : r))
        roomsRef.current = next
        setRooms(next)
      }
      const log = result.log
      if (typeof log === 'string') daemon.log(log)
      else if (log?.key && log.ctx) daemon.narrate(log.key, log.ctx)
      else if (log?.text) daemon.log(log.text)
      if (daemon.s.started && !daemon.s.dormant) setTimeout(() => daemon.reconsider(), 400)
      const targetRoom = result.roomPatch?.id ?? null
      flyCoins(screenOf(targetRoom), counterPoint(), Math.min(10, result.upgrade.cost / 3), { reverse: true })
      pushFeed({ amount: result.upgrade.cost, title: result.upgrade.name, detail: 'Upgrade applied to the house.', spent: true })
      engine.play('upgrade', { force: true })
    },
    [selectedId, daemon, engine, flash, pushFeed, screenOf, setHouse],
  )

  // ---------- sound controls ----------
  useEffect(() => engine.setVolume(volume), [engine, volume])
  useEffect(() => engine.setBusVolume('ambience', ambienceVol), [engine, ambienceVol])
  useEffect(() => engine.setBusVolume('events', eventsVol), [engine, eventsVol])
  useEffect(() => engine.setMuted(muted), [engine, muted])
  const toggleStop = useCallback(async () => {
    if (stopped) {
      await engine.resume()
      setStopped(false)
    } else {
      engine.stop()
      setStopped(true)
    }
  }, [engine, stopped])

  // ---------- hearing ----------
  const simulate = useCallback(
    (kind) => {
      engine.playInput(kind)
      daemon.hear(simulatedPerception(kind))
      setLastSim({ kind, at: nowS() })
    },
    [engine, daemon],
  )

  const toggleMic = useCallback(async () => {
    if (mic.instance) {
      mic.instance.stop()
      setMic({ status: 'off', instance: null, error: null })
      return
    }
    if (!Microphone.supported()) {
      setMic({ status: 'off', instance: null, error: 'This browser has no microphone access here (it needs localhost or https). Use the simulated sounds.' })
      return
    }
    const m = new Microphone({ onPerception: (p) => daemon.hear(p), getOutputLevel: () => engine.outputLevel() })
    m.sensitivity = sensitivity
    setMic({ status: 'asking', instance: null, error: null })
    try {
      await m.start()
      setMic({ status: 'on', instance: m, error: null })
    } catch (err) {
      setMic({
        status: 'off',
        instance: null,
        error: err?.name === 'NotAllowedError' ? 'Microphone permission was refused. The simulated sounds still work.' : 'No microphone could be opened. The simulated sounds still work.',
      })
    }
  }, [mic.instance, daemon, engine, sensitivity])
  useEffect(() => {
    if (mic.instance) mic.instance.sensitivity = sensitivity
  }, [mic.instance, sensitivity])
  useEffect(() => () => mic.instance?.stop(), [mic.instance])

  // ---------- start / reset ----------
  const start = useCallback(async () => {
    try {
      await engine.init()
      engine.setVolume(volume)
    } catch (e) {
      setAudioError(e.message)
    }
    t0.current = nowS()
    daemon.considerLayout(roomsRef.current.filter((r) => !r.dormant))
    daemon.start()
    setStarted(true)
    if (withMic) toggleMic()
  }, [engine, daemon, volume, withMic, toggleMic])

  // A new session: initial layout, initial balance, no upgrades, a daemon with no memory.
  const resetTo = useCallback(
    (layout) => {
      const fresh = layout.map((r) => ({ ...r, id: newRoomId(r.type) }))
      const h = initialHouse()
      setHouse(h)
      daemon.config.features = h.features
      daemon.config.layoutOptions = layoutOptions(h)
      tracker.reset()
      daemon.reset()
      daemon.considerLayout(fresh)
      roomsRef.current = fresh
      setRooms(fresh)
      setSelectedId(null)
      setFocusId(null)
      setReaction(null)
      setHistory([])
      setValidation(null)
      t0.current = nowS()
      daemon.start()
    },
    [daemon, tracker, setHouse],
  )

  // ---------- enter and leave the house ----------
  const enterHouse = useCallback(async () => {
    if (modeRef.current !== 'plan') return
    if (!daemon.s.started) await start()
    const all = roomsRef.current
    const h = houseRef.current
    const v = validateLayout(all, { corridors: !!h.features.doorways })
    setValidation(v)
    if (!v.ok) {
      flash('The house cannot be entered yet. See what needs correcting under the board.')
      return
    }
    // Opening the front door is a sound: a dormant daemon starts to wake as the visitor comes in.
    if (daemon.s.dormant) {
      engine.playInput('tap')
      daemon.hear({ kind: 'tap', intensity: 0.8, source: 'front door' })
      daemon.hear({ kind: 'tap', intensity: 0.8, source: 'front door' })
    }
    // The daemon reads the submitted house now, not in a second.
    daemon.considerLayout(all.filter((r) => !r.dormant))
    const snapshot = daemon.view()
    const an = analyse(all, layoutOptions(h))
    enterCount.current++
    const scenes = chooseScenes(all, {
      analysis: an,
      view: snapshot,
      house: h,
      vastuOf: (id) => assess(all.find((r) => r.id === id), [], { usable: usableRef.current }),
      seed: hash(`${an.signature}|${snapshot.memoryCount}|${snapshot.abandonments}|${snapshot.recentTensions}|${enterCount.current}`),
      maxCoins: WALK_COINS_PER_VISIT,
      coinTaken: (id) => tracker.hasWalkCoin(an.signature, id),
    })
    const building = buildHouse(all, { corridors: !!h.features.doorways, entrance: v.entrance, door: v.door, reachable: v.reachable })
    if (snapshot.outcome === 'harmony') grantRef.current([tracker.approvedHouse(an.signature)])
    daemon.narrate('ENTERED')
    // zoom toward the entrance
    const wrap = wrapRef.current?.getBoundingClientRect()
    const door = screenOf(v.entrance.id)
    if (wrap) {
      wrapRef.current.style.setProperty('--zx', `${door.x - wrap.x}px`)
      wrapRef.current.style.setProperty('--zy', `${door.y - wrap.y}px`)
    }
    setSelectedId(null)
    setMode('entering')
    setWalk({ building, scenes, outcome: snapshot.outcome, signature: an.signature, baseMix: soundscapeFor(snapshot, all, h.features), entranceId: v.entrance.id })
    setTimeout(() => setMode('walk'), 1300)
  }, [daemon, engine, start, flash, tracker, screenOf])

  const leaveHouse = useCallback(() => {
    if (modeRef.current !== 'walk') return
    setMode('leaving')
    daemon.narrate('LEFT')
    setTimeout(() => {
      setMode('plan')
      setWalk(null)
      engine.setLayers(soundscapeFor(daemon.view(), roomsRef.current, houseRef.current.features), 1.2)
    }, 700)
  }, [daemon, engine])

  // If the house falls dormant while someone is inside, the daemon re-imagines every room.
  useEffect(() => {
    if (mode !== 'walk' || !view.dormant || walk?.dormantApplied) return
    const all = roomsRef.current
    const h = houseRef.current
    const an = analyse(all, layoutOptions(h))
    setWalk((w) => ({
      ...w,
      dormantApplied: true,
      outcome: 'abandonment',
      scenes: chooseScenes(all, { analysis: an, view: daemon.view(), house: h, vastuOf: () => ({}), seed: hash(`${an.signature}|dormant`), maxCoins: 0, coinTaken: () => true }),
    }))
  }, [mode, view.dormant, walk, daemon])

  const walkSteps = useRef(0)
  const onStep = useCallback(() => {
    engine.playInput('step')
    walkSteps.current++
    // the daemon hears the visitor's footsteps, which keeps the house awake
    if (walkSteps.current % 3 === 0) daemon.hear({ kind: 'footsteps', intensity: 0.3, source: 'visitor' })
  }, [engine, daemon])
  const onWalkCoin = useCallback(
    (roomId) => {
      const room = roomsRef.current.find((r) => r.id === roomId)
      if (room && walk) grantRef.current([tracker.walkCoin(walk.signature, roomId, room.type)])
    },
    [tracker, walk],
  )

  // ---------- demo ----------
  const stopDemo = useCallback(() => {
    if (!demoRef.current) return
    demoRef.current.cancelled = true
    demoRef.current = null
    setDemo(null)
    if (demoRef.savedSilence && silenceRef.current !== demoRef.savedSilence) setSilence(demoRef.savedSilence)
  }, [setSilence])

  const runDemo = useCallback(async () => {
    if (demoRef.current) return
    if (!started) await start()
    if (modeRef.current === 'walk') leaveHouse()
    const token = { cancelled: false }
    demoRef.current = token
    demoRef.savedSilence = silenceRef.current
    const wait = (s) => new Promise((resolve, reject) => setTimeout(() => (token.cancelled ? reject(new Error('cancelled')) : resolve()), s * 1000))
    const api = {
      clear: () => resetTo([]),
      place: (type, col, row, rotation = 0) => place({ id: newRoomId(type), type, col, row, rotation }),
      move: (type, col, row) => {
        const r = roomsRef.current.find((x) => x.type === type)
        if (r) place({ ...r, col, row })
      },
      hear: (kind) => simulate(kind),
      buy: (id) => buy(id),
      openShop: (v) => setShowShop(v),
      enter: () => enterHouse(),
      leave: () => leaveHouse(),
      setSilence: (s) => setSilence(s),
      restoreSilence: () => setSilence(demoRef.savedSilence ?? DEFAULT_CONFIG.silenceThreshold),
    }
    try {
      for (let i = 0; i < DEMO_STEPS.length; i++) {
        if (token.cancelled) return
        setDemo({ step: i + 1, total: DEMO_STEPS.length, caption: DEMO_STEPS[i].caption })
        await DEMO_STEPS[i].run(api, wait)
      }
    } catch {
      return
    }
    if (demoRef.current === token) {
      demoRef.current = null
      setDemo(null)
    }
  }, [started, start, resetTo, place, simulate, buy, enterHouse, leaveHouse, setSilence])

  // ---------- dragging (tray → board, board → board, board → away) ----------
  const preview = useMemo(() => {
    if (!drag?.moved || !svgRef.current) return null
    const p = pointerToBoard(svgRef.current, drag.clientX, drag.clientY)
    const col = Math.floor(p.gx)
    const row = Math.floor(p.gy)
    const onTable = p.r < R_TABLE + 10
    const cand = { id: drag.id ?? '__new', type: drag.type, rotation: drag.rotation, col, row }
    return { ...cand, onTable, valid: onTable && canPlace(roomsRef.current, cand, usableRef.current) }
  }, [drag])
  const previewRef = useRef(null)
  previewRef.current = preview

  const beginDrag = useCallback(
    (e, info) => {
      if (!started || e.button > 0 || modeRef.current !== 'plan') return
      e.preventDefault()
      e.stopPropagation()
      stopDemo()
      const rect = svgRef.current.getBoundingClientRect()
      const d = { ...info, clientX: e.clientX, clientY: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, cellPx: (rect.width / 1000) * CELL }
      dragRef.current = d
      setDrag(d)
    },
    [started, stopDemo],
  )

  const onTrayPointerDown = useCallback((e, type) => beginDrag(e, { source: 'tray', type, rotation: 0, grabX: 0.5, grabY: 0.5 }), [beginDrag])
  const onRoomPointerDown = useCallback(
    (e, room) => {
      const p = pointerToBoard(svgRef.current, e.clientX, e.clientY)
      beginDrag(e, { source: 'board', id: room.id, type: room.type, rotation: room.rotation, grabX: p.gx - room.col, grabY: p.gy - room.row, room })
    },
    [beginDrag],
  )

  const dragging = !!drag
  useEffect(() => {
    if (!dragging) return
    const moveFn = (e) => {
      const d = dragRef.current
      if (!d) return
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5
      if (moved && !d.moved) engine.play('lift')
      dragRef.current = { ...d, clientX: e.clientX, clientY: e.clientY, moved }
      setDrag(dragRef.current)
    }
    const up = () => {
      const d = dragRef.current
      const pv = previewRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (!d.moved) {
        if (d.source === 'board') setSelectedId((s) => (s === d.id ? null : d.id))
        else {
          const spot = findSpot(roomsRef.current, d.type, usableRef.current)
          if (spot) {
            const room = { id: newRoomId(d.type), type: d.type, col: spot.col, row: spot.row, rotation: 0 }
            if (place(room)) setSelectedId(room.id)
          } else flash('There is no free built cell left.')
        }
        return
      }
      if (pv?.valid) {
        const room = d.source === 'board' ? { ...d.room, col: pv.col, row: pv.row, rotation: d.rotation } : { id: newRoomId(d.type), type: d.type, col: pv.col, row: pv.row, rotation: d.rotation }
        if (place(room)) setSelectedId(room.id)
      } else if (d.source === 'board' && pv && !pv.onTable) {
        remove(d.id)
      } else if (pv?.onTable) {
        flash(usableRef.current(pv.col, pv.row) ? 'That cell is taken.' : 'That part of the house is not built yet. Open it in the upgrade shop.')
      }
    }
    const key = (e) => {
      if (e.key.toLowerCase() !== 'r' || !dragRef.current) return
      dragRef.current = { ...dragRef.current, rotation: (dragRef.current.rotation + 90) % 360 }
      setDrag(dragRef.current)
    }
    window.addEventListener('pointermove', moveFn)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', moveFn)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
    }
  }, [dragging, engine, place, remove, flash])

  // Keyboard on a selected room.
  useEffect(() => {
    const onKey = (e) => {
      if (dragRef.current || modeRef.current !== 'plan' || e.target.closest?.('input, textarea')) return
      if (e.key === 'Escape') {
        setSelectedId(null)
        setShowHelp(false)
        setShowRef(false)
        setShowShop(false)
      }
      if (!selectedId) return
      if (e.key.toLowerCase() === 'r') rotate(selectedId)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        remove(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, rotate, remove])

  useEffect(() => {
    if (!confirmReset) return
    const id = setTimeout(() => setConfirmReset(false), 3500)
    return () => clearTimeout(id)
  }, [confirmReset])

  const selected = rooms.find((r) => r.id === selectedId)

  // ---------- Vastu: live reading of the room being placed, selected or last moved ----------
  const vOpts = useMemo(() => ({ usable }), [usable])
  const vastuStates = useMemo(() => regionStates(rooms, vOpts), [rooms, vOpts])
  const vastuCounts = useMemo(() => summary(rooms, vOpts), [rooms, vOpts])
  const reading = useMemo(() => {
    if (drag?.moved && preview?.onTable) {
      if (preview.col < 0 || preview.row < 0 || preview.col >= GRID || preview.row >= GRID) return null
      const cand = { id: drag.id ?? '__new', type: drag.type, col: preview.col, row: preview.row, rotation: drag.rotation }
      return { a: assess(cand, roomsRef.current, vOpts), mode: 'placing', occupied: !preview.valid }
    }
    const room = selected ?? rooms.find((r) => r.id === focusId)
    return room ? { a: assess(room, rooms, vOpts), mode: selected ? 'selected' : 'moved' } : null
  }, [drag, preview, rooms, selected, focusId, vOpts])
  const applySuggestion = useCallback(
    (a) => {
      const room = roomsRef.current.find((r) => r.id === a.id)
      if (!room || !a.suggestion) return
      if (place({ ...room, col: a.suggestion.col, row: a.suggestion.row })) setSelectedId(room.id)
    },
    [place],
  )
  const vastu = {
    showFigure,
    showZoneNames,
    states: vastuStates,
    focus: reading?.a ?? null,
    hover: reading?.mode === 'placing' ? { region: reading.a.region, secondary: reading.a.secondaryRegions, status: reading.a.status } : null,
    reaction: drag?.moved ? null : reaction,
    suggestion: reading && reading.mode !== 'placing' && reading.a.suggestion ? { ...reading.a.suggestion, type: reading.a.type } : null,
  }

  const condition = houseCondition(view, house, rooms)
  const light = !view.started ? 0.16 : view.dormant ? 0.22 : condition === 'deteriorating' ? 0.25 + view.activity * 0.4 : 0.32 + view.activity * 0.68
  const glow = !view.started || view.dormant ? OUTCOME_COLOUR.abandonment : OUTCOME_COLOUR[view.outcome] ?? OUTCOME_COLOUR.listening
  const occupiedCells = rooms.length
  let builtCells = 0
  for (let c = 0; c < GRID; c++) for (let r = 0; r < GRID; r++) if (usable(c, r)) builtCells++
  const ghost =
    drag?.moved &&
    (() => {
      const { w, h } = footprint(drag.type, drag.rotation)
      const s = drag.cellPx
      return (
        <svg
          className={`drag-ghost ${preview?.valid ? 'over-valid' : ''} ${drag.source === 'board' && preview && !preview.onTable ? 'removing' : ''}`}
          width={w * s}
          height={h * s}
          viewBox={`0 0 ${w * CELL} ${h * CELL}`}
          style={{ left: drag.clientX - drag.grabX * s, top: drag.clientY - drag.grabY * s }}
        >
          <RoomDefs />
          <RoomShape room={drag.room} type={drag.type} rotation={drag.rotation} cell={CELL} />
        </svg>
      )
    })()

  return (
    <div className={`ghost theme-${theme} ${started ? 'is-started' : ''} ${drag?.moved ? 'is-dragging' : ''} cond-${condition}`} style={{ '--glow': glow }}>
      <aside className="side left">
        <header className="masthead">
          <p className="eyebrow">Pandaemonium · Daemons for Weimar</p>
          <h1>The Ghost That Hates Silence</h1>
          <p className="tagline">Arrange the house. Hear what it becomes.</p>
        </header>
        <RoomTray house={house} rooms={rooms} onPointerDown={onTrayPointerDown} selected={selected} onRotate={rotate} onRemove={remove} onBuy={buy} onOpenShop={() => setShowShop(true)} onBlocked={flash} />
        <VastuPanel
          assessment={reading?.a}
          mode={reading?.mode}
          occupied={reading?.occupied}
          counts={vastuCounts}
          onApplySuggestion={applySuggestion}
          onOpenReference={() => setShowRef(true)}
          toggles={[
            { label: 'Figure', on: showFigure, onToggle: () => setShowFigure(!showFigure) },
            { label: 'Zone names', on: showZoneNames, onToggle: () => setShowZoneNames(!showZoneNames) },
            { label: 'Cue sounds', on: cueSound, onToggle: () => setCueSound(!cueSound) },
          ]}
        />
        <nav className="utilities">
          <button className={`btn ${demo ? 'active' : ''}`} onClick={demo ? stopDemo : runDemo}>
            {demo ? 'Exit demo' : 'Demo mode'}
          </button>
          <button
            className={`btn ${confirmReset ? 'active warn' : ''}`}
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true)
              setConfirmReset(false)
              stopDemo()
              resetTo(INITIAL_LAYOUT)
              flash('New session: the first house, the starting coins, a daemon with no memory.')
            }}
            disabled={!started}
          >
            {confirmReset ? 'Click again: new session' : 'Reset house'}
          </button>
          <button className="btn" onClick={() => setShowRef(true)}>
            Vastu guide
          </button>
          <button className="btn" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}>
            {theme === 'day' ? 'Night mode' : 'Day mode'}
          </button>
          <button className="btn wide" onClick={() => setShowHelp(true)}>
            Help &amp; settings
          </button>
        </nav>
        <p className="fiction-note">
          The Vastu analysis follows common traditional associations, which vary; the body mapping is illustrative. The daemon, its scenes and its coins
          are fiction, not claims about real houses. <button className="link" onClick={() => setShowHelp(true)}>More</button>
        </p>
      </aside>

      <main className="stage">
        <div className="hud-row">
          <div className="hud-left">
            <CoinCounter coins={house.coins} counterRef={counterRef} onOpenShop={() => setShowShop(true)} pulse={coinPulse} />
            <RewardFeed items={feed} />
          </div>
          <HouseCondition condition={condition} neglected={house.neglected.length} dormantRooms={rooms.filter((r) => r.dormant).length} />
        </div>
        <div className="board-area">
          <div ref={wrapRef} className={`board-wrap ${mode === 'entering' ? 'zooming' : ''}`}>
            <Board
              svgRef={svgRef}
              rooms={rooms}
              analysis={analysis}
              view={view}
              selectedId={selectedId}
              drag={drag?.moved ? drag : null}
              preview={preview?.onTable && preview.col >= 0 && preview.row >= 0 && preview.col < GRID && preview.row < GRID ? preview : null}
              ripples={ripples}
              light={light}
              glow={glow}
              vastu={vastu}
              house={house}
              usable={usable}
              entering={mode === 'entering' ? walk?.entranceId : null}
              onRoomPointerDown={onRoomPointerDown}
              onBackgroundPointerDown={() => setSelectedId(null)}
              onRotate={rotate}
              onRemove={remove}
            />
            {!started && <Intro onStart={start} withMic={withMic} setWithMic={setWithMic} micSupported={Microphone.supported()} />}
            {demo && <DemoBar {...demo} onExit={stopDemo} />}
            {toast && (
              <p className="toast" key={toast.id}>
                {toast.text}
              </p>
            )}
            {audioError && <p className="toast persistent">Sound could not start: {audioError}</p>}
          </div>
        </div>
        <PlanBar
          rooms={occupiedCells}
          emptyCells={builtCells - occupiedCells}
          unbuilt={GRID * GRID - builtCells}
          interpretation={view.started ? `The daemon: ${view.phase.toLowerCase()} · ${view.outcome}` : 'The daemon is dormant.'}
          onEnter={enterHouse}
          entering={mode !== 'plan'}
          validation={validation}
        />
      </main>

      <aside className="side right">
        <StatusPanel view={view} history={history} showInner={showInner} />
        <HearingPanel mic={mic} onToggleMic={toggleMic} sensitivity={sensitivity} onSensitivity={setSensitivity} onSimulate={simulate} lastSim={lastSim} disabled={!started} />
        <SoundPanel
          volume={volume}
          onVolume={setVolume}
          ambience={ambienceVol}
          onAmbience={setAmbienceVol}
          events={eventsVol}
          onEvents={setEventsVol}
          muted={muted}
          onMute={() => setMuted(!muted)}
          stopped={stopped}
          onStop={toggleStop}
          outcome={view.started ? view.outcome : 'abandonment'}
          families={families}
        />
        <DaemonLog entries={log} t0={t0.current} />
        <a className="other-app" href="#hot-cold">
          Weimar: Hot &amp; Cold →
        </a>
      </aside>

      {ghost}
      {(mode === 'walk' || mode === 'leaving') && walk && (
        <WalkBoundary onExit={() => (setMode('plan'), setWalk(null))}>
        <Suspense fallback={<div className="walk walk-loading">Building the house…</div>}>
        <WalkView
          house={walk.building}
          scenes={walk.scenes}
          outcome={walk.outcome}
          features={house.features}
          baseMix={walk.baseMix}
          engine={engine}
          lastLog={log[log.length - 1]}
          coins={house.coins}
          onExit={leaveHouse}
          onCoin={onWalkCoin}
          onStep={onStep}
          onEnterRoom={() => {}}
          fading={mode === 'leaving'}
        />
        </Suspense>
        </WalkBoundary>
      )}
      {(mode === 'walk' || mode === 'leaving') && (
        <div className="walk-feed">
          <RewardFeed items={feed} />
        </div>
      )}
      {showShop && <UpgradeShop house={house} ctx={{ selected, rooms }} onBuy={buy} onClose={() => setShowShop(false)} />}
      {showRef && <VastuReference onClose={() => setShowRef(false)} />}
      {showHelp && <Help onClose={() => setShowHelp(false)} silence={silence} setSilence={setSilence} showInner={showInner} setShowInner={setShowInner} />}
    </div>
  )
}

