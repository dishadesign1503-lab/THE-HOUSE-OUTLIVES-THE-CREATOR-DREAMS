// Turns the daemon's inner state (and the house's upgrades) into a mix of sound layers, 0..1.
// This is where "what the daemon believes" becomes "what the house sounds like".

const clamp = (v) => Math.max(0, Math.min(1, v))

export function soundscapeFor(view, rooms, features = {}) {
  if (!view.started) return { hum: 0.15, wind: 0.08, creak: 0.15 }
  const act = view.activity
  const m = view.mood
  const h = m.coherent
  const t = m.tense
  const l = m.loss
  const conf = Math.max(view.confusion, m.unstable)
  const decay = m.forgotten // silence and abandonment
  // Silence drains the human sounds first; the machines are the last thing to go.
  const alive = 1 - decay * 0.9
  const has = (type) => rooms.some((r) => r.type === type && !r.dormant)
  const kitchenish = has('kitchen') || has('dining') ? 1 : 0.3
  const open = has('garden') || features.basin ? 1 : 0

  return {
    // household
    voices: act * alive * (h * 0.5 + 0.05),
    laughter: act * alive * Math.max(0, h - 0.25) * 1.3,
    children: act * alive * Math.max(0, h - 0.35) * (open ? 1.2 : 0.6),
    footsteps: act * alive * (h * 0.6 + t * 0.5 + 0.1),
    clinks: act * alive * h * 0.8 * kitchenish,
    birds: open ? alive * (0.2 + h * 0.8) * Math.min(1, act + 0.3) : 0,
    wind: (0.1 + h * 0.4 + open * 0.2) * act * alive + decay * 0.35,
    house: act * alive * (0.3 + h * 0.5),
    water: features.basin ? alive * 0.25 : 0,
    // conflict
    argument: alive * Math.min(1, act * 1.3) * Math.max(0, t - 0.15) * 1.5 * (features.jali ? 0.65 : 1),
    sigh: alive * Math.max(0, t - 0.2) * 0.9,
    tension: Math.max(0, t - 0.1) * 0.9 * alive,
    // loss
    crying: alive * Math.max(0, l - 0.15) * 1.3 * (0.4 + act),
    fadingVoice: alive * Math.max(0, l - 0.3),
    clock: Math.max(0, l - 0.1) * 0.9 + decay * 0.35,
    mourning: Math.max(0, l - 0.2) * 0.8,
    // the abandoned building underneath
    hum: view.dormant ? 0.25 : 0.25 + act * 0.6,
    vent: features.ventilation ? 0.2 + act * 0.25 : act * 0.4 * alive + conf * 0.3,
    ventRattle: features.ventilation ? 0 : 0.3 + decay * 0.5,
    creak: 0.08 + decay * 0.7 + conf * 0.3,
    drip: features.pipes ? 0 : 0.12 + decay * 0.6,
    pipes: features.pipes ? 0 : 0.08 + conf * 0.4 + decay * 0.3,
    resonance: 0.08 + decay * 0.5 + t * 0.2,
    doorsMoving: decay * 0.5,
    clicks: view.dormant ? 0.02 : act * 0.15 + conf * 0.5,
    // confusion
    distortion: Math.max(0, conf - 0.35) * 1.3,
    mechanics: Math.max(0, conf - 0.4) * 1.5,
    interrupt: Math.max(0, conf - 0.5) * 1.4,
    muffle: Math.max(0, conf - 0.45) * 0.9 + (view.dormant ? 0.35 : 0),
    instability: view.confusion,
    // outside
    city: features.city ? alive * 0.35 : 0,
    bells: features.city ? alive * (0.2 + h * 0.4) : 0,
  }
}

// The five sound families, for the soundscape meter.
export const FAMILIES = {
  household: ['voices', 'laughter', 'children', 'clinks', 'birds', 'house'],
  conflict: ['argument', 'sigh', 'tension'],
  loss: ['crying', 'fadingVoice', 'clock', 'mourning'],
  building: ['hum', 'vent', 'creak', 'drip', 'pipes', 'resonance', 'doorsMoving'],
  confusion: ['distortion', 'mechanics', 'interrupt', 'muffle'],
}

export function familyLevels(levels) {
  return Object.fromEntries(Object.entries(FAMILIES).map(([k, names]) => [k, clamp(Math.max(...names.map((n) => levels[n] ?? 0)))]))
}
