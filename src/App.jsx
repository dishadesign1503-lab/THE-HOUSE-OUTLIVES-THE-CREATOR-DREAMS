import { useCallback, useEffect, useState } from 'react'
import CityMap from './map/CityMap.jsx'
import GamePanel from './game/GamePanel.jsx'
import { useGeolocation } from './game/useGeolocation.js'
import { useHotColdGame } from './game/useHotColdGame.js'
import { distanceMetres } from './game/heat.js'
import './game/game.css'

// Farther than this from the kit centre, a GPS position is treated as "not in Weimar".
const FAR_FROM_AREA_M = 3000

// The city kit map of central Weimar, with the "Weimar: Hot & Cold" game on top.
export default function App() {
  const [kit, setKit] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('pin') // 'pin' | 'gps'
  const [pin, setPin] = useState(null)
  const [gpsNotice, setGpsNotice] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/kit.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`data/kit.json: ${r.status}`)
        return r.json()
      })
      .then(setKit)
      .catch((e) => setError(e.message))
  }, [])

  const gps = useGeolocation(mode === 'gps')
  const player = mode === 'gps' ? gps.position : pin
  const game = useHotColdGame(player)

  // If GPS can't be used, fall back to the map pin and say why.
  useEffect(() => {
    if (mode === 'gps' && ['denied', 'unsupported', 'unavailable'].includes(gps.status)) {
      setGpsNotice(
        {
          denied: 'Location permission was denied, so you are using the map pin. Allow location in your browser settings to try GPS again.',
          unsupported: 'Location isn’t available here (it needs https or localhost), so you are using the map pin.',
          unavailable: 'Your position couldn’t be found, so you are using the map pin.',
        }[gps.status],
      )
      setMode('pin')
    }
  }, [mode, gps.status])

  const center = kit && { lon: kit.center[0], lat: kit.center[1] }

  const changeMode = useCallback(
    (next) => {
      setGpsNotice(null)
      // Leave the pin where GPS last saw you, if that is in the area.
      if (next === 'pin' && gps.position && center && distanceMetres(gps.position, center) < FAR_FROM_AREA_M) {
        setPin(gps.position)
      }
      setMode(next)
    },
    [gps.position, center],
  )

  const startGame = useCallback(() => {
    if (!pin && center) setPin(center)
    game.start()
  }, [pin, center, game])

  if (error) {
    return (
      <main>
        <h1>Weimar: Hot &amp; Cold</h1>
        <p className="error">The city kit didn't load ({error}).</p>
      </main>
    )
  }
  if (!kit) return <div className="loading">Loading the map of Weimar…</div>

  const farFromArea = mode === 'gps' && gps.position && distanceMetres(gps.position, center) > FAR_FROM_AREA_M

  return (
    <div className="app">
      <CityMap
        bbox={kit.bbox}
        player={game.status === 'idle' ? null : player}
        heatColor={game.status === 'playing' ? game.heat?.color : null}
        movable={mode === 'pin' && game.status === 'playing'}
        onMove={setPin}
        found={game.found}
        distanceFromTarget={game.distanceFromTarget}
      />
      <div
        className={`heat-glow ${game.status === 'playing' && game.heat ? 'on' : ''}`}
        style={{ '--heat': game.heat?.color }}
        aria-hidden="true"
      />
      <GamePanel
        game={{ ...game, start: startGame }}
        location={{ mode, onModeChange: changeMode, gps, gpsNotice, farFromArea }}
      />
    </div>
  )
}
