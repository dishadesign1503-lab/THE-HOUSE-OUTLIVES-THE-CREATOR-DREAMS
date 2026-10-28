import { useState } from 'react'

// DEVELOPER INSPECTOR (debug mode only): what the house is thinking and why, what its walls are
// doing, and what the wind and sun do inside. With controls to poke the simulation.

const f = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : '–')

const LABEL = { PRESERVE_STABILITY: 'stay still', INVESTIGATE: 'twitch', ADAPT: 'adjust a limb', RECONFIGURE: 'roll / stretch', DEFEND: 'guard', RESTORE_ORDER: 'return to stable' }

function Step({ ok, label, children }) {
  return (
    <div>
      <span className={ok ? 'hs-ok' : 'hs-dim'}>{ok ? '●' : '○'}</span> {label}: {children}
    </div>
  )
}

function Bar({ label, value, max = 1.5, accent }) {
  return (
    <div className="hs-bar">
      <span>{label}</span>
      <i style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} className={accent ? 'accent' : ''} />
      <b>{f(value)}</b>
    </div>
  )
}

// the hypnosis, link by link: what was heard, what object, what it is like, what he chose and
// why, which parts of him move, which rooms, how far the transformation has got, how it ended
function HypnosisTab({ h, tx, moving, pose }) {
  if (!h) return <div className="hs-dim">No hypnosis yet. Press HYPNOTIZE and say “You are a …”.</div>
  return (
    <>
      <Step ok={!!h.sentence} label="recognised sentence">
        “{h.sentence}” ({h.source})
      </Step>
      <Step ok={!!h.object && !h.error} label="extracted object">
        {h.error ? <span className="hs-warn">{h.error}</span> : `${h.object} (${h.read === 'lexicon' ? 'known object' : 'read from its description'})`}
      </Step>
      <Step ok={!!h.attributes} label="semantic attributes">
        {h.attributes ? Object.entries(h.attributes).filter(([, v]) => v >= 0.1).map(([k, v]) => `${k} ${v}`).join(' · ') : '–'}
      </Step>
      <Step ok={!!h.currentPose} label="sleeping pose before">
        {h.currentPose ?? '–'} · receptivity {h.receptivity ?? '–'} · contrariness {h.contrariness ?? '–'} · heard before {h.repeats ?? 0}×
      </Step>
      <Step ok={!!h.decision} label="agent decision">
        {h.decision ? `${h.decision.goal}: ${h.decision.reason}` : 'interpreting…'}
      </Step>
      {h.candidates?.length > 0 && <div className="hs-dim">candidates: {h.candidates.map((c) => `${c.pose}${c.rooms ? ` [${c.rooms}]` : ''} ${c.score}${c.invalid ? ` ✕ ${c.invalid}` : ''}`).join(' · ')}</div>}
      <Step ok={!!h.targetPose} label="target pose">
        {h.targetPose ?? '–'}
      </Step>
      <Step ok={!!h.regions} label="body regions moving">
        {h.regions?.join(', ') ?? '–'}
      </Step>
      <Step ok={!!h.config} label="architectural configuration">
        {h.config ?? '–'}
      </Step>
      <Step ok={h.stage > 0} label="transformation">
        {h.stage ? `stage ${h.stage}/3 · ${tx} · ${moving} walls moving · body now ${pose}` : '–'}
      </Step>
      {h.stages?.map((s) => (
        <div key={s.k} className="hs-dim">
          {s.k}/3 · {s.pose} · {s.walls} walls, {s.lines} grid lines · rooms {s.rooms}
        </div>
      ))}
      <Step ok={!!h.result?.done} label="result">
        {h.result ? (h.result.done ? `${h.result.pose} · rooms ${h.result.rooms} · walls moved ${h.result.wallsMoved.join(' + ')} · plan ${h.result.validPlan ? 'valid' : 'INVALID'} · exit ${h.result.routeToExit ?? 'unreachable'} cells away` : h.result.why) : '–'}
      </Step>
    </>
  )
}

export default function Inspector({ hud, engine }) {
  const [open, setOpenState] = useState(false)
  const setOpen = (v) => {
    engine.inspecting = v
    setOpenState(v)
  }
  const [tab, setTab] = useState('chain')
  const d = hud.debug
  const g = engine.game
  if (!open) {
    return (
      <button type="button" className="hs-debug-tab" onClick={() => setOpen(true)}>
        inspector
      </button>
    )
  }
  const a = d.agent
  return (
    <div className="hs-debug">
      <button type="button" className="hs-debug-close" onClick={() => setOpen(false)} aria-label="Fold the inspector">
        ×
      </button>
      <div className="hs-row hs-tabs">
        {['chain', 'hypnosis', 'agent', 'world', 'walls', 'sensors'].map((t) => (
          <button key={t} type="button" className={`hs-btn tiny ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'chain' && (
        <>
          <div className="hs-dim">collision → cell → region → his state → decision → transformation</div>
          <Step ok={!!d.chain.collision} label="last collision">
            {d.chain.collision ? `${d.chain.collision.t}s at (${d.chain.collision.x}, ${d.chain.collision.y}) · speed ${d.chain.collision.speed} · disturbance +${d.chain.collision.amount}${d.chain.collision.wall ? ` · wall #${d.chain.collision.wall}` : ''}` : 'none yet'}
          </Step>
          <Step ok={!!d.chain.cell} label="grid cell">
            {d.chain.cell ?? '–'}
          </Step>
          <Step ok={!!d.chain.region} label="body region">
            {d.chain.region ?? '–'} · accumulated {d.chain.regionLevel}
          </Step>
          <Step ok label="his state">
            arousal {f(a.state.arousal)} · irritation {f(a.state.irritation)} · posture <b>{d.pose}</b> · mind {a.mode}
          </Step>
          <Step ok label="controller">
            <b>{d.tx}</b>
          </Step>
          <div className="hs-dim">utilities of each response:</div>
          {Object.entries(a.utilities).map(([k, v]) => (
            <Bar key={k} label={LABEL[k] ?? k} value={v} accent={k === a.goal} />
          ))}
          {a.candidates.length > 0 && <div className="hs-dim">candidates: {a.candidates.map((c) => `${c.action} ${c.score}${c.invalid ? ` (${c.invalid})` : ''}`).join(' · ')}</div>}
          <Step ok={!!d.chain.decision} label="selected action">
            {d.chain.decision ? `${d.chain.decision.t}s ${d.chain.decision.action} — ${d.chain.decision.reason}${d.chain.decision.idle ? ' (independent)' : ''}` : '–'}
          </Step>
          <Step ok={!!d.chain.requested} label="transformation requested">
            {d.chain.requested ? `${d.chain.requested.t}s ${d.chain.requested.kind}: ${d.chain.requested.label}, ${d.chain.requested.lines ?? 0} grid lines · ${d.chain.requested.walls} walls${d.chain.requested.topology ? " · rooms reorganise" : ""}` : '–'}
          </Step>
          <Step ok={!!d.chain.completed} label="transformation completed">
            {d.chain.completed ? `${d.chain.completed.t}s, now ${d.chain.completed.pose} · rooms ${d.chain.completed.config}` : d.chain.requested ? `in progress (${d.moving} walls moving)` : '–'}
          </Step>
        </>
      )}

      {tab === 'chain' && (
        <div className="hs-dim">
          dream: {d.dream ? `${d.dream.phase} ${d.dream.t}s · fog ${d.dream.fog} · loose walls ${d.dream.loose} · ${d.dream.cycles} cycles · anchor in the ${d.dream.anchor}` : `none (pressure ${d.dreamPressure})`}
          {d.chain.dream?.result && ` · last: ${d.chain.dream.result.kept ? 'kept' : 'returned'} → ${d.chain.dream.result.rooms}, ${Math.round(d.chain.dream.result.change.baysReassigned * 100)}% bays`}
        </div>
      )}

      {tab === 'hypnosis' && <HypnosisTab h={d.chain.hypnosis} tx={d.tx} moving={d.moving} pose={d.body.pose} />}

      {tab === 'agent' && (
        <>
          <div>
            mode <b>{a.mode}</b> · goal <b>{a.goal ?? '–'}</b>
          </div>
          {Object.entries(a.utilities).map(([k, v]) => (
            <Bar key={k} label={k} value={v} accent={k === a.goal} />
          ))}
          <div className="hs-dim">state: {Object.entries(a.state).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
          {a.plan && (
            <div>
              plan: {a.plan.action} — {a.plan.reason}
              <div className="hs-dim">{a.plan.steps?.join(' → ')}</div>
            </div>
          )}
          {a.candidates.length > 0 && <div className="hs-dim">candidates: {a.candidates.map((c) => `${c.action} ${c.score}`).join(' · ')}</div>}
          {a.lastOutcome && (
            <div>
              last outcome: {a.lastOutcome.goal}/{a.lastOutcome.action} {a.lastOutcome.success ? '✓' : '✗'} {a.lastOutcome.reason}
            </div>
          )}
          <div className="hs-dim">decisions: {a.decisions.map((x) => `${x.t}s ${x.goal}/${x.action}`).join(' · ')}</div>
          <div className="hs-dim">memory: {a.events.map((e) => `${e.t.toFixed(0)}s ${e.type}${e.goal ? ` ${e.goal}` : ''}${e.success !== undefined ? (e.success ? ' ✓' : ' ✗') : ''}`).join(' · ')}</div>
          <div className="hs-dim">
            habits: {a.habits.join(' · ') || '–'} · trust: {Object.entries(a.goalRates).map(([k, v]) => `${k.slice(0, 5)} ${v}`).join(' ')} · air lesson {a.airLesson}
          </div>
          <div className="hs-dim">layouts: {a.layouts.map((l) => `#${l.id} s${l.stability} ${l.heldFor}s`).join(' · ')}</div>
        </>
      )}

      {tab === 'world' && (
        <>
          <div>
            wind {f(d.wind.angle, 0)}° × {f(d.wind.strength)} · sun {f(d.sun.angle, 0)}° elev {f(d.sun.elevation, 0)}° {d.sun.on ? 'on' : 'off'}
          </div>
          <div>
            windows letting wind in: {d.env.windIn} · total inflow {f(d.env.windTotal)} · max interior air {f(d.env.maxAir)} · sunlit cells {d.env.litCells}
          </div>
          <div>
            at the player: air {f(d.air.x)},{f(d.air.y)} · light {f(d.light)} · v {f(d.vx)},{f(d.vy)}
          </div>
          <div className="hs-dim">windows: {d.windows.map((w) => `(${w.at}) ${w.facing} in ${w.inflow}`).join(' · ')}</div>
          <label className="hs-slider">
            <span className="hs-slider-head">
              <span>Wind strength (test)</span>
              <span>{f(d.wind.strength)}</span>
            </span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={d.wind.strength}
              onChange={(e) => {
                g.env.wind.strength = Number(e.target.value)
                g.env.recompute(g.house)
              }}
            />
          </label>
          <button
            type="button"
            className="hs-btn tiny"
            onClick={() => {
              g.env.sunOn = !g.env.sunOn
              g.env.recompute(g.house)
            }}
          >
            Sunlight {d.sun.on ? 'off' : 'on'}
          </button>
        </>
      )}

      {tab === 'walls' && (
        <>
          <div>
            {d.stage} · {d.system} · {d.walls.pieces} walls ({d.walls.bound} partitions) · moving {d.walls.moving} · posture changes {d.shifts}
          </div>
          <div>
            plan: <b>{d.walls.config}</b> · {d.walls.valid ? 'valid architecture' : 'INVALID'}
          </div>
          <div className="hs-dim">rooms: {d.walls.rooms}</div>
          <div className="hs-dim">grid lines: {d.walls.lines}</div>
          <div>
            route to exit: {d.route ?? 'none'} cells · door {d.doorOpen ? 'open' : 'shut'} · controller {d.tx} · sleep {d.sleep}
          </div>
          <div>
            body: <b>{d.body.pose}</b> {d.body.moving ? '(moving)' : ''} · breath {d.body.breath} · under the circle: {d.region}
          </div>
          <div className="hs-dim">disturbed: {Object.entries(d.body.regions).map(([k, v]) => `${k} ${v}`).join(' · ') || '–'}</div>
          {d.walls.bindings.map((s) => (
            <div key={s} className="hs-dim">
              {s}
            </div>
          ))}
          {d.walls.sample.map((s) => (
            <div key={s} className="hs-dim">
              {s}
            </div>
          ))}
          <div className="hs-dim">collisions: {d.log.join(' · ') || '–'}</div>
        </>
      )}

      {tab === 'sensors' && (
        <>
          <div>audio {d.audio?.ready ? 'on' : 'not started (needs a tap)'} · last voice: {d.audio?.voice ? `“${d.audio.voice.words}” (${d.audio.voice.voice}${d.audio.voice.local ? ', on this device' : ''})` : '–'}</div>
          {Object.entries(d.audio?.assets ?? {}).map(([k, a]) => (
            <div key={k} className={a.ok ? 'hs-dim' : 'hs-warn'}>
              {a.ok ? '●' : '✕'} {k}: {a.ok ? `${a.seconds} s` : `failed (${a.error})`} · {a.path}
            </div>
          ))}
          <div>
            pos {f(d.x)},{f(d.y)} ({d.cell}) · v {f(d.vx)},{f(d.vy)} · {Math.round(d.fps)} fps
          </div>
          <div>
            input {hud.source} {f(d.tilt?.x)},{f(d.tilt?.y)} · motion {f(d.motion)}
          </div>
          <div>
            sensor {hud.sensorStatus} · β {f(d.raw.beta, 1)} γ {f(d.raw.gamma, 1)} · rot {f(d.raw.rot, 0)}°/s · acc {f(d.raw.acc)} · events {d.events}
          </div>
          <div>
            vibration {hud.hapticSupported ? hud.hapticResult : 'unsupported'} · mic {hud.micStatus} {f(hud.micLevel)}
          </div>
        </>
      )}

      <label className="hs-slider">
        <span className="hs-slider-head">
          <span>Arousal</span>
          <span>{f(a.state.arousal)}</span>
        </span>
        <input type="range" min="0" max="1" step="0.05" value={a.state.arousal} onChange={(e) => (g.agent.s.arousal = Number(e.target.value))} />
      </label>
      <div className="hs-row">
        <button type="button" className="hs-btn tiny" onClick={() => g.debugCollision()}>
          Collision (C)
        </button>
        <button type="button" className="hs-btn tiny" onClick={() => g.debugEvaluate()}>
          Evaluate (E)
        </button>
        <button type="button" className="hs-btn tiny" onClick={() => g.debugTransform()}>
          Transform (T)
        </button>
        <button type="button" className="hs-btn tiny" onClick={() => g.debugReset()}>
          Reset plan (X)
        </button>
        <button type="button" className="hs-btn tiny" onClick={() => g.noise(0.7)}>
          Sound (N)
        </button>
        <button type="button" className="hs-btn tiny" onClick={() => g.debugDream()}>
          Dream (D)
        </button>
      </div>
    </div>
  )
}
