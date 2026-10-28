import { useEffect, useState } from 'react'

// Follows the browser's GPS position while `enabled` is true.
// status: 'off' | 'unsupported' | 'locating' | 'active' | 'denied' | 'unavailable' | 'timeout'
export function useGeolocation(enabled) {
  const [state, setState] = useState({ status: 'off', position: null, accuracy: null })

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'off', position: null, accuracy: null })
      return
    }
    // Browsers only allow geolocation on https:// pages and on localhost.
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setState({ status: 'unsupported', position: null, accuracy: null })
      return
    }

    setState({ status: 'locating', position: null, accuracy: null })
    const watchId = navigator.geolocation.watchPosition(
      (p) =>
        setState({
          status: 'active',
          position: { lat: p.coords.latitude, lon: p.coords.longitude },
          accuracy: p.coords.accuracy,
        }),
      (error) => {
        const status =
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable'
        // A timeout after a first fix keeps the last known position.
        setState((s) => (status === 'timeout' && s.position ? s : { status, position: null, accuracy: null }))
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled])

  return state
}
