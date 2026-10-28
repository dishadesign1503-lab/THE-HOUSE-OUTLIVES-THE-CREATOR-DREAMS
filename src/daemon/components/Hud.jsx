import { useEffect, useRef, useState } from 'react'
import { CONDITIONS } from '../progress/condition.js'

// Coins fly from a point on screen to the counter (or from the counter into the house when spent).
export function flyCoins(from, to, count, { onArrive, reverse = false } = {}) {
  const n = Math.max(3, Math.min(14, count))
  let arrived = 0
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span')
    el.className = 'coin-fly'
    document.body.appendChild(el)
    const start = reverse ? to : from
    const end = reverse ? from : to
    const spread = { x: (Math.random() - 0.5) * 90, y: (Math.random() - 0.5) * 70 - 30 }
    const anim = el.animate(
      [
        { transform: `translate(${start.x}px, ${start.y}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${start.x + spread.x}px, ${start.y + spread.y}px) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(0.55)`, opacity: 0.9 },
      ],
      { duration: 850 + i * 55, easing: 'cubic-bezier(.3,.1,.2,1)', delay: i * 25, fill: 'forwards' },
    )
    anim.onfinish = () => {
      el.remove()
      arrived++
      if (arrived === n) onArrive?.()
    }
  }
}

// The balance, counting up toward the real value when coins land.
export function CoinCounter({ coins, counterRef, onOpenShop, pulse }) {
  const [shown, setShown] = useState(coins)
  const raf = useRef()
  useEffect(() => {
    const from = shown
    const to = coins
    if (from === to) return
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 700)
      setShown(Math.round(from + (to - from) * k))
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    // wait for the flying coins before counting up
    const id = setTimeout(() => (raf.current = requestAnimationFrame(step)), to > from ? 750 : 0)
    return () => {
      clearTimeout(id)
      cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins])
  return (
    <div className={`hud-coins ${pulse ? 'pulse' : ''}`} key={pulse}>
      <span className="coin-icon big" ref={counterRef} aria-hidden="true" />
      <span className="coin-count" aria-live="polite">
        {shown}
      </span>
      <button className="btn small gold" onClick={onOpenShop}>
        Upgrade house
      </button>
    </div>
  )
}

export function RewardFeed({ items }) {
  return (
    <div className="reward-feed" aria-live="polite">
      {items.map((r) => (
        <div key={r.id} className={`reward size-${r.size ?? 'small'} ${r.spent ? 'spent' : ''}`}>
          <span className="reward-amount">{r.spent ? `−${r.amount}` : `+${r.amount}`}</span>
          <span>
            <b>{r.title}</b>
            <span className="reward-detail">{r.detail}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function HouseCondition({ condition, neglected, dormantRooms }) {
  const c = CONDITIONS[condition]
  return (
    <div className={`hud-condition cond-${condition}`} aria-live="polite">
      <svg viewBox="0 0 40 40" className="cond-emblem" aria-hidden="true">
        <circle cx="20" cy="20" r="18" className="cond-ring" />
        <path d="M11 21 L20 12 L29 21 V29 H11 Z" className="cond-house" />
        <rect x="18" y="23" width="4" height="6" className="cond-door" />
      </svg>
      <div>
        <span className="eyebrow">House condition</span>
        <b>{c.label}</b>
        <span className="cond-text">
          {c.text}
          {neglected > 0 && ` ${neglected} neglected zone${neglected > 1 ? 's' : ''}.`}
          {dormantRooms > 0 && ` ${dormantRooms} dormant room${dormantRooms > 1 ? 's' : ''}.`}
        </span>
      </div>
    </div>
  )
}

// Floor-plan stats and the way in.
export function PlanBar({ rooms, emptyCells, unbuilt, interpretation, onEnter, entering, validation }) {
  return (
    <div className="plan-bar">
      <div className="plan-stats">
        <span>
          <b>{rooms}</b> rooms
        </span>
        <span>
          <b>{emptyCells}</b> empty cells
        </span>
        <span>
          <b>{unbuilt}</b> unbuilt
        </span>
        <span className="plan-reading">{interpretation}</span>
      </div>
      <button className="btn enter" onClick={onEnter} disabled={entering}>
        {entering ? 'Opening the door…' : 'Enter the house'}
      </button>
      {validation && !validation.ok && (
        <div className="plan-errors" role="alert">
          {validation.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
    </div>
  )
}
