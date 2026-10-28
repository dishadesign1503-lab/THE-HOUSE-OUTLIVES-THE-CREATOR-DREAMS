import { CATEGORIES, UPGRADES, availability } from '../progress/upgrades.js'
import { ROOM_TYPES } from '../engine/rooms.js'
import { ZONE_NAMES } from '../engine/layout.js'

// Small drawings for each upgrade.
function Preview({ kind }) {
  const gold = 'var(--gold)'
  const ink = 'var(--ink)'
  if (kind.startsWith('type:')) {
    const t = ROOM_TYPES[kind.slice(5)]
    return (
      <svg viewBox="0 0 48 48" className="shop-preview" aria-hidden="true">
        <rect x="6" y="6" width="36" height="36" rx="5" fill={t.colour} />
        <path d={t.icon} transform="translate(12 12)" fill="none" stroke={t.ink} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind.startsWith('wing-')) {
    const side = kind.slice(5)
    const cells = []
    for (let c = 0; c < 6; c++)
      for (let r = 0; r < 6; r++) {
        const core = c > 0 && c < 5 && r > 0 && r < 5
        const hit = (side === 'n' && r === 0 && c > 0 && c < 5) || (side === 's' && r === 5 && c > 0 && c < 5) || (side === 'e' && c === 5 && r > 0 && r < 5) || (side === 'w' && c === 0 && r > 0 && r < 5)
        cells.push(<rect key={`${c}${r}`} x={6 + c * 6} y={6 + r * 6} width="5" height="5" fill={hit ? gold : core ? 'var(--stone)' : 'none'} stroke={ink} strokeOpacity="0.2" strokeWidth="0.5" />)
      }
    return (
      <svg viewBox="0 0 48 48" className="shop-preview" aria-hidden="true">
        {cells}
      </svg>
    )
  }
  const shapes = {
    slots: <path d="M8 14h14v14H8z M26 14h14v14H26z M17 32h14v10H17z" fill="none" stroke={gold} strokeWidth="1.6" />,
    gild: <><rect x="8" y="8" width="32" height="32" rx="4" fill="var(--orange)" /><rect x="11" y="11" width="26" height="26" rx="3" fill="none" stroke={gold} strokeWidth="2.4" /></>,
    restore: <><rect x="8" y="8" width="32" height="32" rx="4" fill="var(--stone)" /><path d="M12 30l8-10 6 6 10-14" fill="none" stroke={ink} strokeWidth="1.6" /></>,
    doorways: <><rect x="4" y="16" width="14" height="16" fill="var(--teal)" /><rect x="30" y="16" width="14" height="16" fill="var(--terracotta)" /><path d="M18 24h12" stroke={gold} strokeWidth="2" strokeDasharray="3 2" /></>,
    jali: <g stroke={gold} strokeWidth="1.2" fill="none">{[0, 1, 2, 3].map((i) => <circle key={i} cx={14 + (i % 2) * 20} cy={14 + Math.floor(i / 2) * 20} r="9" />)}<rect x="6" y="6" width="36" height="36" /></g>,
    lamps: <><path d="M24 8v10" stroke={ink} strokeWidth="1.2" /><path d="M16 18h16l-4 10h-8z" fill={gold} /><circle cx="24" cy="34" r="7" fill="var(--orange)" opacity="0.35" /></>,
    basin: <><circle cx="24" cy="24" r="16" fill="none" stroke={gold} strokeWidth="1.6" /><circle cx="24" cy="24" r="11" fill="var(--mist)" /><circle cx="24" cy="24" r="5" fill="none" stroke="var(--teal)" /></>,
    ventilation: <path d="M8 18c8-6 12 6 20 0s12-4 12-4 M8 26c8-6 12 6 20 0s12-4 12-4 M8 34c8-6 12 6 20 0s12-4 12-4" fill="none" stroke="var(--teal)" strokeWidth="1.8" />,
    pipes: <path d="M8 14h16v20h16" fill="none" stroke={gold} strokeWidth="4" strokeLinejoin="round" />,
    stabilise: <path d="M10 18V10h8 M30 10h8v8 M38 30v8h-8 M18 38h-8v-8" fill="none" stroke={gold} strokeWidth="2.4" />,
    city: <><path d="M24 8c-6 0-9 5-9 12v6l-3 4h24l-3-4v-6c0-7-3-12-9-12z" fill={gold} /><circle cx="24" cy="34" r="3" fill={ink} /></>,
  }
  return (
    <svg viewBox="0 0 48 48" className="shop-preview" aria-hidden="true">
      {shapes[kind] ?? null}
    </svg>
  )
}

const STATE_LABEL = { purchased: 'Purchased', locked: 'Locked', 'needs-target': 'Needs a target', poor: 'Not enough coins', available: 'Available' }

// The house upgrade shop: every purchase spends real coins and changes the house.
export default function UpgradeShop({ house, ctx, onBuy, onClose }) {
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal wide shop" role="dialog" aria-labelledby="shop-title" onPointerDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="shop-head">
          <h2 id="shop-title">Upgrade the house</h2>
          <span className="shop-balance">
            <span className="coin-icon" aria-hidden="true" /> {house.coins} coins
          </span>
        </div>
        <p className="note">
          Coins are the building’s recovered energy: earned when the daemon hears a harmonious house, for challenges and for waking it. They are a
          game economy, not a measure of how auspicious a layout is. Targeted upgrades act on the selected room
          {ctx.selected ? ` (now: ${ROOM_TYPES[ctx.selected.type].label})` : ''}.
          {house.neglected.length > 0 && ` Neglected: ${house.neglected.map((z) => ZONE_NAMES[z]).join(', ')}.`}
        </p>
        <div className="shop-cols">
          {CATEGORIES.map((cat) => (
            <section key={cat.id} className="shop-col">
              <h3>{cat.label}</h3>
              {UPGRADES.filter((u) => u.category === cat.id).map((u) => {
                const a = availability(u, house, ctx)
                return (
                  <article key={u.id} className={`shop-card state-${a.state}`}>
                    <Preview kind={u.preview} />
                    <div className="shop-body">
                      <div className="shop-name">
                        <b>{u.name}</b>
                        <span className="shop-cost">
                          <span className="coin-icon small" aria-hidden="true" />
                          {u.cost}
                        </span>
                      </div>
                      <p>{u.effect}</p>
                      <div className="shop-foot">
                        <span className={`shop-status state-${a.state}`}>{a.state === 'available' ? a.message : a.state === 'purchased' ? '✓ Purchased' : a.message || STATE_LABEL[a.state]}</span>
                        {a.state !== 'purchased' && (
                          <button className="btn small gold" disabled={a.state !== 'available'} onClick={() => onBuy(u.id)}>
                            Buy
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
