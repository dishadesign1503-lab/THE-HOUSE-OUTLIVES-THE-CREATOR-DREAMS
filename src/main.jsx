import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import HouseApp from './house/HouseApp.jsx'
import './index.css'

// The House Outlives Its Creator is the current experience. The earlier projects stay available:
// The Sleeping House at #sleeping, The Ghost That Hates Silence at #daemon,
// and Weimar: Hot & Cold at #hot-cold.
const SleepingApp = lazy(() => import('./sleeping/SleepingApp.jsx'))
const DaemonApp = lazy(() => import('./daemon/DaemonApp.jsx'))
const HotCold = lazy(() => import('./App.jsx'))

const TITLES = {
  '#hot-cold': 'Weimar: Hot & Cold',
  '#daemon': 'The Ghost That Hates Silence',
  '#sleeping': 'The Sleeping House',
}

function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    document.title = TITLES[hash] ?? 'The House Outlives Its Creator'
  }, [hash])
  if (hash === '#hot-cold' || hash === '#daemon' || hash === '#sleeping') {
    return (
      <Suspense fallback={null}>
        {hash === '#hot-cold' ? <HotCold /> : hash === '#daemon' ? <DaemonApp /> : <SleepingApp />}
      </Suspense>
    )
  }
  return <HouseApp />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
