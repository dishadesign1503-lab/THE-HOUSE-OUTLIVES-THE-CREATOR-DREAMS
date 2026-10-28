import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LANDMARKS } from './landmarks.js'
import { FIND_RADIUS_M, distanceMetres, heatFor, trendBetween } from './heat.js'

export const MAX_CLUES = 3

function pickTarget(excludeId) {
  const pool = LANDMARKS.filter((l) => l.id !== excludeId)
  return pool[Math.floor(Math.random() * pool.length)]
}

// The game's rules. The target stays inside this hook: the UI only gets the
// heat level and the trend, never the target or the exact distance, until it is found.
export function useHotColdGame(player) {
  const [status, setStatus] = useState('idle') // 'idle' | 'playing' | 'found'
  const [target, setTarget] = useState(null)
  const [cluesShown, setCluesShown] = useState(0)
  const [trend, setTrend] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [foundAt, setFoundAt] = useState(null)
  const previousDistance = useRef(null)

  const distance = useMemo(
    () => (status === 'playing' && target && player ? distanceMetres(player, target) : null),
    [status, target, player],
  )

  // Warmer or colder than the last position.
  useEffect(() => {
    if (distance == null) return
    setTrend(trendBetween(previousDistance.current, distance))
    previousDistance.current = distance
  }, [distance])

  const start = useCallback(() => {
    setTarget((current) => pickTarget(current?.id))
    setCluesShown(1)
    setTrend(null)
    previousDistance.current = null
    setStartedAt(Date.now())
    setFoundAt(null)
    setStatus('playing')
  }, [])

  const nextClue = useCallback(() => setCluesShown((n) => Math.min(n + 1, MAX_CLUES)), [])

  const nearby = distance != null && distance <= FIND_RADIUS_M

  const confirmFind = useCallback(() => {
    if (!nearby) return
    setFoundAt(Date.now())
    setStatus('found')
  }, [nearby])

  // Lets the map colour buildings by their distance to the target without being told where it is.
  const distanceFromTarget = useMemo(() => (target ? (p) => distanceMetres(p, target) : null), [target])

  return {
    status,
    distanceFromTarget,
    clues: target ? target.clues.slice(0, cluesShown) : [],
    cluesShown,
    canGetClue: status === 'playing' && cluesShown < MAX_CLUES,
    heat: distance == null ? null : heatFor(distance),
    trend,
    nearby,
    found: status === 'found' ? target : null,
    elapsedMs: foundAt && startedAt ? foundAt - startedAt : null,
    start,
    nextClue,
    confirmFind,
  }
}
