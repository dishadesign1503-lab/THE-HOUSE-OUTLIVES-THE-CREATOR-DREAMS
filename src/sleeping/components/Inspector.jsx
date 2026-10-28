import { FLOORS, FLOOR_ORDER, OPENINGS, ROOM, WINDOWS, objectsIn, zoneInfo } from '../house/plan.js'
import { DRAFT } from '../house/environment.js'
import { REGION_LABEL } from '../entity/skeleton.js'
import { compass } from '../entity/mind.js'

const SIDE = { N: 'North', E: 'East', S: 'South', W: 'West', roof: 'Roof' }

// Controls for the selected room. Every control changes the simulated house; nothing here
// reaches him except through the physical changes it causes.
export default function Inspector({ world, roomId, onAct, onClose, canSearch }) {
  if (!roomId) {
    return (
      <aside className="inspector empty">
        <p>Select a room on the plan (or press 1–9) to change its conditions. Doors, windows and objects on the plan can also be clicked directly.</p>
      </aside>
    )
  }
  const env = world.env
  const room = ROOM[roomId]
  const r = env.rooms[roomId]
  const zone = zoneInfo(roomId)
  const windows = WINDOWS.filter((w) => w.room === roomId)
  const doors = OPENINGS.filter((o) => o.kind === 'door' && (o.a === roomId || o.b === roomId))
  const objects = objectsIn(roomId)
  const phone = env.objects.phone
  const phoneRinging = !!(phone.sound && env.t < phone.sound.until)
  const air = r.air.mag > DRAFT ? `draft toward the ${compass({ x: r.air.vx, y: r.air.vy })}` : r.air.mag > 0.04 ? 'moving gently' : 'still'

  return (
    <aside className="inspector" aria-label={`${room.name} controls`}>
      <header>
        <div>
          <h2>{room.name}</h2>
          <p className="zone">
            {zone.dir} · {zone.name} · lies over his {REGION_LABEL[room.region]}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close room controls">×</button>
      </header>
      <dl className="readouts">
        <div>
          <dt>Felt</dt>
          <dd>{r.felt.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Air</dt>
          <dd>{air}</dd>
        </div>
        <div>
          <dt>Floor</dt>
          <dd>{FLOORS[r.floor].label}</dd>
        </div>
      </dl>

      {canSearch && (
        <button type="button" className="search-btn" onClick={() => onAct({ type: 'search', room: roomId })}>
          Search this room for the chime
        </button>
      )}

      <div className="controls">
        {objects.map((o) => {
          const st = env.objects[o.id]
          switch (o.kind) {
            case 'radiator':
              return (
                <div key={o.id} className="ctl">
                  <span className="ctl-label">Radiator</span>
                  <div className="stepper" role="group" aria-label="Radiator level">
                    <button type="button" disabled={st.level <= 0} onClick={() => onAct({ type: 'setRadiator', id: o.id, level: st.level - 1 })} aria-label="Lower radiator">−</button>
                    <span className={`level l${st.level}`} aria-live="polite">{st.level === 0 ? 'off' : st.level}</span>
                    <button type="button" disabled={st.level >= 3} onClick={() => onAct({ type: 'setRadiator', id: o.id, level: st.level + 1 })} aria-label="Raise radiator">+</button>
                  </div>
                </div>
              )
            case 'stove':
              return <Toggle key={o.id} label="Stove" on={st.on} onText="Lit" offText="Off" onClick={() => onAct({ type: 'toggle', id: o.id })} />
            case 'extractor':
              return <Toggle key={o.id} label="Extractor fan" on={st.on} onText="Running" offText="Off" onClick={() => onAct({ type: 'toggle', id: o.id })} />
            case 'speaker':
              return <Toggle key={o.id} label="Radio" on={st.on} onText="Playing" offText="Off" onClick={() => onAct({ type: 'toggle', id: o.id })} />
            case 'machine':
              return <Toggle key={o.id} label={o.label} on={st.on} onText="Running" offText="Off" onClick={() => onAct({ type: 'toggle', id: o.id })} />
            case 'phone':
              return (
                <div key={o.id} className="ctl">
                  <span className="ctl-label">Telephone</span>
                  <button type="button" className={phoneRinging ? 'on' : ''} onClick={() => onAct({ type: 'phone' })}>
                    {phoneRinging ? 'Answer' : 'Make it ring'}
                  </button>
                </div>
              )
            case 'knocker':
              return (
                <div key={o.id} className="ctl">
                  <span className="ctl-label">Front door</span>
                  <button type="button" onClick={() => onAct({ type: 'knock' })}>Knock</button>
                </div>
              )
            case 'heavy':
              return (
                <div key={o.id} className="ctl">
                  <span className="ctl-label">{o.label}</span>
                  <button type="button" onClick={() => onAct({ type: 'shift', id: o.id })}>Shift it</button>
                </div>
              )
            case 'incense': {
              const n = st.sticks.length
              return (
                <div key={o.id} className="ctl">
                  <span className="ctl-label">Incense{n ? ` · ${n} burning` : ''}</span>
                  <button type="button" className={n ? 'on' : ''} onClick={() => onAct({ type: 'incense' })}>Light a stick</button>
                </div>
              )
            }
            case 'flowers':
              return <Toggle key={o.id} label="Flowers" on={st.on} onText="Placed" offText="None" onClick={() => onAct({ type: 'flowers' })} />
            default:
              return null
          }
        })}
        {windows.map((w) => (
          <Toggle
            key={w.id}
            label={w.kind === 'frontdoor' ? 'Front door' : w.kind === 'lantern' ? 'Roof lantern' : `${SIDE[w.side]} window`}
            on={env.windows[w.id]}
            onText="Open"
            offText="Closed"
            onClick={() => onAct({ type: 'toggleWindow', id: w.id })}
          />
        ))}
        {doors.map((o) => {
          const other = ROOM[o.a === roomId ? o.b : o.a]
          return <Toggle key={o.id} label={`Door to ${other.name}`} on={env.doors[o.id]} onText="Open" offText="Closed" onClick={() => onAct({ type: 'toggleDoor', id: o.id })} />
        })}
        <div className="ctl">
          <span className="ctl-label">Floor</span>
          <div className="segmented" role="radiogroup" aria-label="Floor material">
            {FLOOR_ORDER.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={r.floor === f} className={r.floor === f ? 'on' : ''} onClick={() => r.floor !== f && onAct({ type: 'floor', room: roomId, floor: f })}>
                {FLOORS[f].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function Toggle({ label, on, onText, offText, onClick }) {
  return (
    <div className="ctl">
      <span className="ctl-label">{label}</span>
      <button type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={onClick}>
        {on ? onText : offText}
      </button>
    </div>
  )
}
