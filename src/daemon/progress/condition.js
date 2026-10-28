// The house's condition, derived from the daemon model and the house state (never stored).

export const CONDITIONS = {
  active: { label: 'Active', text: 'Rooms are lit and the systems are running.' },
  stable: { label: 'Stable', text: 'The daemon hears a whole house. Everything holds.' },
  disturbed: { label: 'Disturbed', text: 'The daemon hears trouble in the arrangement.' },
  deteriorating: { label: 'Deteriorating', text: 'Layers of sound are dropping out; parts of the house are neglected.' },
  dormant: { label: 'Dormant', text: 'Nothing is heard. The building waits.' },
}

export function houseCondition(view, house, rooms) {
  if (!view.started || view.dormant) return 'dormant'
  const dormantRooms = rooms.filter((r) => r.dormant).length
  if (view.silenceStage >= 1 || ((house.neglected.length || dormantRooms) && view.activity < 0.35)) return 'deteriorating'
  if (['tension', 'isolation', 'confusion'].includes(view.outcome)) return 'disturbed'
  if (view.outcome === 'harmony' && view.stability > 0.5) return 'stable'
  return 'active'
}
