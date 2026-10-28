import { ROOM_ORDER, ROOM_TYPES } from '../engine/rooms.js'
import { remaining } from '../progress/house.js'
import { RoomIcon } from './RoomGlyph.jsx'

// The room inventory. Drag a block onto the grid, or click it to place it in the first free cell.
export default function RoomTray({ house, rooms, onPointerDown, selected, onRotate, onRemove, onBuy, onOpenShop, onBlocked }) {
  const slotsLeft = house.maxRooms - rooms.length
  return (
    <section className="panel tray" aria-label="Room blocks">
      <h2 className="panel-title">
        Room blocks
        <span className={`slots ${slotsLeft <= 0 ? 'full' : ''}`}>
          {rooms.length} / {house.maxRooms} rooms
        </span>
      </h2>
      <div className="tray-grid">
        {ROOM_ORDER.map((type) => {
          const t = ROOM_TYPES[type]
          const unlocked = house.types.includes(type)
          const left = remaining(house, rooms, type)
          const usable = unlocked && left > 0 && slotsLeft > 0
          return (
            <button
              key={type}
              className={`tray-item ${unlocked ? '' : 'locked'} ${usable ? '' : 'spent'}`}
              onPointerDown={(e) => {
                if (usable) return onPointerDown(e, type)
                if (!unlocked) return onOpenShop()
                onBlocked(slotsLeft <= 0 ? 'All room slots are used. Buy more in the upgrade shop.' : `No ${t.label.toLowerCase()} blocks left in the inventory.`)
              }}
              title={unlocked ? `${t.label}: ${left} left` : `${t.label}: unlock in the upgrade shop`}
              aria-disabled={!usable}
            >
              <RoomIcon type={type} size={20} />
              <span className="tray-label">{t.label}</span>
              <span className="tray-size">{unlocked ? `×${left}` : '🔒'}</span>
            </button>
          )
        })}
      </div>
      <div className={`selection ${selected ? 'on' : ''}`}>
        {selected ? (
          <>
            <span>
              <span className="dim">Selected</span> {ROOM_TYPES[selected.type].label}
              {selected.dormant && <span className="dim"> · dormant</span>}
            </span>
            <span className="selection-actions">
              <button className="btn small" onClick={() => onRotate(selected.id)} title="Turn the side it faces (the entrance's front door)">
                Turn <kbd>R</kbd>
              </button>
              <button className="btn small" onClick={() => onRemove(selected.id)}>
                Remove <kbd>Del</kbd>
              </button>
              {selected.dormant ? (
                <button className="btn small gold" onClick={() => onBuy('restore')}>
                  Restore · 8
                </button>
              ) : (
                !selected.gilded && (
                  <button className="btn small gold" onClick={() => onBuy('gild')}>
                    Gild · 10
                  </button>
                )
              )}
            </span>
          </>
        ) : (
          <span className="dim">Click a room to select it. Drag it off the table to remove it.</span>
        )}
      </div>
    </section>
  )
}
