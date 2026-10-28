// REWARDS — decides when coins are earned. It never changes the balance itself; the app adds
// whatever it returns. Every rule pays once per room, layout, challenge or wing, so moving a
// block back and forth earns nothing.

import { REWARDS, CHALLENGES, HARMONY_COOLDOWN_S, STABLE_SECONDS } from './economy.js'
import { ZONES } from '../vastu/reference.js'
import { ROOM_TYPES } from '../engine/rooms.js'
import { WINGS } from './house.js'

const reward = (size, title, detail, at) => ({ amount: REWARDS[size], size, title, detail, at })

export class RewardTracker {
  constructor() {
    this.reset()
  }

  reset() {
    this.alignedRooms = new Set()
    this.claimed = new Set()
    this.harmonyLayouts = new Set()
    this.stableLayouts = new Set()
    this.approvedHouses = new Set()
    this.walkCoins = new Set()
    this.inhabitedWings = new Set()
    this.lastHarmony = -Infinity
    this.settledSince = null
  }

  // A room was placed or moved. `before`/`after` are Vastu statuses.
  placement(room, before, after, zone) {
    if (after !== 'aligned' || before === 'aligned' || this.alignedRooms.has(room.id)) return null
    this.alignedRooms.add(room.id)
    return reward('small', `${ROOM_TYPES[room.type].label} aligned`, `Placed in ${ZONES[zone].name} (${ZONES[zone].dir.toLowerCase()}), as the reference recommends.`, room.id)
  }

  // The daemon settled on a layout it judges harmonious.
  harmony(signature, t, roomId) {
    if (this.harmonyLayouts.has(signature) || t - this.lastHarmony < HARMONY_COOLDOWN_S) return null
    this.harmonyLayouts.add(signature)
    this.lastHarmony = t
    return reward('small', 'The daemon approves', 'It hears this arrangement as a whole house.', roomId)
  }

  // Challenges, checked whenever the house settles.
  challenges(analysis, vastuOf) {
    const out = []
    for (const c of CHALLENGES) {
      if (this.claimed.has(c.id)) continue
      if (!c.detect(analysis, vastuOf)) continue
      this.claimed.add(c.id)
      out.push(reward(c.reward, c.name, c.hint, null))
    }
    return out
  }

  // A harmonious house kept unchanged for a while.
  stability(view, signature, t) {
    if (view.outcome !== 'harmony') {
      this.settledSince = null
      return null
    }
    if (this.settledSince === null || this.settledSince.sig !== signature) this.settledSince = { sig: signature, t }
    if (t - this.settledSince.t < STABLE_SECONDS || this.stableLayouts.has(signature)) return null
    this.stableLayouts.add(signature)
    return reward('medium', 'A stable house', `The house held its harmony for ${STABLE_SECONDS} seconds.`, null)
  }

  // The house woke after having gone dormant.
  restoredActivity() {
    return reward('medium', 'Activity restored', 'The dormant building is active again.', null)
  }

  // First room the daemon accepts in a newly opened wing.
  wing(wingId, room) {
    if (!wingId || this.inhabitedWings.has(wingId)) return null
    this.inhabitedWings.add(wingId)
    return reward('medium', `${WINGS[wingId].label} inhabited`, 'A room now lives in the new part of the house.', room.id)
  }

  // Entering a house the daemon judges harmonious.
  approvedHouse(signature) {
    if (this.approvedHouses.has(signature)) return null
    this.approvedHouses.add(signature)
    return reward('small', 'A house worth entering', 'The daemon believes this house is lived in happily.', null)
  }

  // A coin found inside a harmonious room in the walkthrough.
  walkCoin(signature, roomId, type) {
    const key = `${signature}#${roomId}`
    if (this.walkCoins.has(key)) return null
    this.walkCoins.add(key)
    return reward('small', 'Recovered energy', `Found in the ${ROOM_TYPES[type].label.toLowerCase()}.`, roomId)
  }

  hasWalkCoin(signature, roomId) {
    return this.walkCoins.has(`${signature}#${roomId}`)
  }
}
