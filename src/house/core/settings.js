// Settings and progress, remembered in this browser only (and harmless if storage is blocked).

const SETTINGS_KEY = 'house-outlives:settings'
const PROGRESS_KEY = 'house-outlives:progress'

export const DEFAULT_SETTINGS = {
  sensitivity: 1, // 0.5 .. 2, how hard tilt pushes
  deadzone: 0.045, // slope below which tilt is ignored (~2.6°)
  haptics: true,
  sound: true,
  mic: false, // the hearing mechanic is off until the player turns it on
  micSensitivity: 0.5,
  agentMemory: true, // the house's learning is kept between visits (in this browser)
  dream3d: true, // his dreams are entered in 3D (off: the dream stays on the plan, as before)
  debug: false,
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private mode or blocked storage: the game still works, it just forgets
  }
}

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) ?? {}) }
  s.mic = false // permission is asked again each visit, only when the player chooses
  if (typeof location !== 'undefined' && /[?&#]debug\b/.test(location.search + location.hash)) s.debug = true
  return s
}

export const saveSettings = (s) => write(SETTINGS_KEY, s)

export function loadProgress() {
  return { reached: 0, endings: [], ...(read(PROGRESS_KEY) ?? {}) }
}

export const saveProgress = (p) => write(PROGRESS_KEY, p)
