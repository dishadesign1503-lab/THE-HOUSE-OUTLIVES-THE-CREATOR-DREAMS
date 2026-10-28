// THE NIGHT — a small state machine for the experience's phases, objectives and endings.
//
//   intro → discovery → locate → warmth → stillness → final → ending
//
// Every objective is checked against the real simulation (the house and his state), never
// against which buttons were pressed. Mistakes have consequences in the house and in his body;
// only accumulated disturbance can wake him.

import { COMFORT, DRAFT, addSound, bang, syncHums, thunder } from '../house/environment.js'
import { ROOM, ROOM_IDS } from '../house/plan.js'

export const FINAL_SECONDS = 240 // from the storm to dawn
export const SETTLE_SECONDS = 12 // how long he must rest in the mandala to be restored
const WARM_HOLD = 8

export const PHASES = {
  discovery: { label: 'I · Discovery' },
  locate: { label: 'II · Listening' },
  warmth: { label: 'II · Warmth' },
  stillness: { label: 'II · Stillness' },
  final: { label: 'III · The storm' },
  ending: { label: 'IV · Dawn' },
}

export const ENDINGS = {
  restored: {
    title: 'Restored',
    line: 'He lies in his own shape again. The house falls back into the mandala.',
    rule: 'Before dawn, he held the mandala posture for 12 seconds while warm, comfortable and calm — which in the storm takes warmth, quiet, stillness and something familiar.',
  },
  awakened: {
    title: 'Awakened',
    line: 'Too much reached him. He rises, and the house he was sleeping in comes apart.',
    rule: 'The disturbances you caused — loud or repeated sounds and tremors while he was already irritated — reached the waking point, or left him close to waking (over 60%) when dawn came. What the house does by itself can never wake him.',
  },
  unsettled: {
    title: 'Unsettled',
    line: 'Dawn comes before he settles. The house keeps the shape of his discomfort.',
    rule: 'Dawn arrived (4 minutes after the storm began) before he could settle into the mandala posture.',
  },
}

export function createStory(rng) {
  return {
    rng,
    phase: 'intro',
    since: 0,
    t: 0,
    notices: [],
    pending: null,
    ending: null,
    discovery: { sound: false, thermal: false, vibration: false },
    locate: null,
    warmth: { hold: 0, ok: 0 },
    stillness: null,
    final: null,
    completed: [],
    maxWake: 0,
  }
}

function notice(story, text, kind = 'objective') {
  story.notices.push({ t: story.t, text, kind, id: `${story.t.toFixed(2)}-${story.notices.length}` })
  if (story.notices.length > 20) story.notices.shift()
}

export function startStory(world) {
  enter(world, 'discovery')
}

function enter(world, phase) {
  const { story, env, mind } = world
  story.phase = phase
  story.since = story.t
  story.pending = null
  if (phase === 'locate') {
    const room = story.rng.pick(['guest', 'prayer', 'dining', 'study', 'bedroom', 'store', 'kitchen'])
    const clock = addSound(env, {
      kind: 'chime', room, level: 0.5, pattern: 'chime', period: 6.5, u: story.rng.range(0.25, 0.75), v: story.rng.range(0.25, 0.75), cause: 'house', hidden: true,
    })
    story.locate = { room, clock, wrong: 0, searched: [] }
  }
  if (phase === 'warmth') {
    env.outside.temp = 1
    env.outside.wind = 1.2
    for (const id of ['w-guest-n', 'w-guest-w']) {
      if (!env.windows[id]) {
        env.windows[id] = true
        env.dirty = true
      }
    }
    bang(env, 'w-guest-n', 'house')
    story.warmth = { hold: 0, ok: 0 }
  }
  if (phase === 'stillness') {
    const machine = story.rng.pick(['washer', 'pump', 'fridge'])
    for (const id of ['washer', 'pump', 'fridge']) {
      const st = env.objects[id]
      st.disruptive = id === machine
      if (!st.on) {
        st.on = true
        st.since = env.t
      }
    }
    env.objects[machine].nextThump = env.t + 1.5
    syncHums(env)
    story.stillness = { machine, wrongOff: [] }
  }
  if (phase === 'final') {
    env.outside.storm = true
    env.outside.temp = -1
    env.outside.wind = 1.5
    env.dirty = true
    if (!env.windows['w-study-e']) {
      env.windows['w-study-e'] = true
      bang(env, 'w-study-e', 'house')
    }
    mind.unease = 0.32
    mind.mandalaComfort = 0.75
    mind.irritation = Math.max(mind.irritation, 0.55)
    mind.calmSince = mind.t
    mind.lastDisturbed = mind.t
    mind.peakIrritation = Math.max(mind.peakIrritation, 0.55)
    mind.force('curled', 2)
    story.final = { start: story.t, nextThunder: story.t + 14 }
  }
}

function complete(world, id, text, next) {
  const { story } = world
  story.completed.push({ id, t: story.t })
  notice(story, text, 'complete')
  story.pending = { next, at: story.t + 3.5 }
}

// Called by the world after every simulation step. `reactions` are what his body did this step.
export function updateStory(world, dt, reactions) {
  const { story, env, mind } = world
  story.t += dt
  story.maxWake = Math.max(story.maxWake, mind.wake)
  if (story.phase === 'intro' || story.phase === 'ending') return
  if (mind.awake) return end(world, 'awakened')
  if (story.pending) {
    if (story.t >= story.pending.at) enter(world, story.pending.next)
    return
  }

  switch (story.phase) {
    case 'discovery': {
      for (const r of reactions) {
        if (r.cause !== 'user') continue
        if (r.sense === 'sound') story.discovery.sound = true
        if (r.sense === 'thermal' || r.sense === 'airflow') story.discovery.thermal = true
        if (r.sense === 'vibration') story.discovery.vibration = true
      }
      const d = story.discovery
      if (d.sound && d.thermal && d.vibration) complete(world, 'discovery', 'He has felt sound, temperature and tremor through the house.', 'locate')
      break
    }
    case 'locate': {
      const L = story.locate
      if (L.found) complete(world, 'locate', `Found — the chime was in the ${ROOM[L.room].name}.`, 'warmth')
      break
    }
    case 'warmth': {
      let ok = 0
      for (const id of ROOM_IDS) {
        const r = env.rooms[id]
        if (r.felt >= COMFORT.lo && r.felt <= COMFORT.hi && r.air.mag < DRAFT) ok += 1
      }
      story.warmth.ok = ok
      story.warmth.hold = ok === ROOM_IDS.length ? story.warmth.hold + dt : 0
      if (story.warmth.hold >= WARM_HOLD) complete(world, 'warmth', 'Every room he lies in is warm and still.', 'stillness')
      break
    }
    case 'stillness': {
      const S = story.stillness
      if (!env.objects[S.machine].on) complete(world, 'stillness', `The ${machineName(S.machine)} was shaking him. It is quiet now.`, 'final')
      break
    }
    case 'final': {
      const F = story.final
      if (story.t >= F.nextThunder) {
        thunder(env)
        F.nextThunder = story.t + story.rng.range(22, 35)
      }
      if (mind.settledFor >= SETTLE_SECONDS) return end(world, 'restored')
      if (story.t - F.start >= FINAL_SECONDS) return end(world, mind.wake > 0.6 ? 'awakened' : 'unsettled')
      break
    }
    default:
      break
  }
}

function machineName(id) {
  return { washer: 'washing machine', pump: 'water pump', fridge: 'refrigerator' }[id]
}

// Searching a room for the hidden chime. Searching makes noise of its own.
export function searchRoom(world, roomId) {
  const { story, env } = world
  if (story.phase !== 'locate' || story.pending) return null
  const L = story.locate
  L.searched.push(roomId)
  if (roomId === L.room) {
    L.clock.until = env.t
    L.found = true
    return 'found'
  }
  L.wrong += 1
  L.clock.level = Math.min(0.85, L.clock.level + 0.08) // it chimes more insistently
  notice(story, `Nothing in the ${ROOM[roomId].name}. The search disturbed him.`, 'mistake')
  return 'nothing'
}

// Called when a machine is switched off, to tell the visitor it was the wrong one.
export function machineToggled(world, id, on) {
  const { story } = world
  if (story.phase !== 'stillness' || on || story.pending) return
  if (id !== story.stillness.machine && !story.stillness.wrongOff.includes(id)) {
    story.stillness.wrongOff.push(id)
    notice(story, `The ${machineName(id)} stops, but the tremor goes on.`, 'mistake')
  }
}

export function end(world, kind) {
  const { story, mind, env } = world
  if (story.phase === 'ending') return
  story.phase = 'ending'
  story.since = story.t
  const regions = Object.entries(mind.disturbedRegions).sort((a, b) => b[1] - a[1])
  story.ending = {
    kind,
    t: story.t,
    stats: {
      minutes: story.t / 60,
      disturbance: mind.disturbance,
      maxWake: story.maxWake,
      region: regions[0][1] > 0.5 ? regions[0][0] : null,
      actions: env.stats.userActions,
      completed: story.completed.length,
    },
  }
  env.sounds = env.sounds.filter((s) => s.kind === 'hum' && kind !== 'awakened')
  mind.frozen = true
  if (kind === 'restored') {
    env.outside.wind = 0.4
    env.outside.storm = false
    mind.force('mandala', 5)
    mind.body.setBreath({ rate: 0.1, depth: 1.5, irregular: 0 })
  } else if (kind === 'awakened') {
    mind.awake = true
    mind.force('awake', 2.2)
  } else {
    env.outside.storm = false
    mind.force(mind.posture === 'mandala' ? 'turned' : mind.posture, 3)
  }
}

// The one line of context shown under the current objective.
export function objectiveFor(world) {
  const { story, mind } = world
  const P = mind.perception
  const age = story.t - story.since
  switch (story.phase) {
    case 'discovery': {
      const d = story.discovery
      return {
        title: 'Something troubles his sleep',
        text: 'He cannot see you. Change the house — make a sound, change the warmth, cause a tremor — and watch how he feels it.',
        checks: [
          ['Sound', d.sound],
          ['Temperature or air', d.thermal],
          ['Vibration', d.vibration],
        ],
        hint: age > 45 ? 'Try the telephone in the Hall, a radiator or window, or shift the wardrobe in the Bedroom.' : null,
      }
    }
    case 'locate': {
      const L = story.locate
      return {
        title: 'Locate the sound',
        text: 'Somewhere a forgotten clock chimes. Watch where his head turns and which part of him twitches, then search that room.',
        progress: L.wrong ? `${L.wrong} wrong ${L.wrong === 1 ? 'search' : 'searches'}` : null,
        hint:
          L.wrong >= 2 || age > 50
            ? 'The body part lying under the chime twitches with each chime. Silence other sounds — they pull his head away.'
            : null,
        action: 'search',
      }
    }
    case 'warmth':
      return {
        title: 'Restore warmth',
        text: 'The wind has opened the north-west. Bring every room to a comfortable warmth (18–24.5° felt) with no drafts.',
        progress: `${story.warmth.ok} of 9 rooms comfortable${story.warmth.hold > 0 ? ' — holding' : ''}`,
        hint: age > 50 ? 'Close windows that let the wind in. Radiators warm a room; open doors share warmth; stone feels colder than wool.' : null,
      }
    case 'stillness':
      return {
        title: 'Find the tremor',
        text: 'A rhythm is shaking him from inside the walls. Find the machine that causes it and switch it off.',
        progress: story.stillness.wrongOff.length ? `${story.stillness.wrongOff.length} wrong ${story.stillness.wrongOff.length === 1 ? 'machine' : 'machines'}` : null,
        hint: age > 40 ? 'The tremor is strongest in the limb that lies under the machine’s room. Rugs soften what reaches him.' : null,
      }
    case 'final': {
      const left = Math.max(0, FINAL_SECONDS - (story.t - story.final.start))
      return {
        title: 'Help him settle',
        text: 'A storm. He has curled away from the house. Help him back into his own shape — the mandala — and keep the house still while he rests there.',
        progress: mind.settledFor > 0 ? `Settling… ${Math.floor(mind.settledFor)} / ${SETTLE_SECONDS} s` : null,
        hint: P ? diagnose(world, P) : null,
        dawn: 1 - left / FINAL_SECONDS,
      }
    }
    default:
      return null
  }
}

// What still stands between him and rest, read from his own perception.
function diagnose(world, P) {
  const { mind } = world
  const loud = Object.entries(P.sound.levels).sort((a, b) => b[1] - a[1])[0]
  if (loud[1] > 0.2) return 'He is still listening to something in the house.'
  const cold = Object.values(P.regions).sort((a, b) => b.cold - a.cold)[0]
  if (cold.cold > 0.05) return `He is cold — in the ${ROOM[cold.room].name}.`
  const hot = Object.values(P.regions).sort((a, b) => b.hot - a.hot)[0]
  if (hot.hot > 0.05) return `He is too warm — in the ${ROOM[hot.room].name}.`
  if (P.draft > 0.03) return 'Air is moving across him.'
  if (P.vib > 0.08) return 'Something still trembles.'
  if (mind.irritation > 0.32) return 'He is still tense. Give him time and quiet.'
  if (mind.comfort < mind.mandalaComfort) return 'Quiet and warm — but something familiar might draw him open.'
  if (mind.posture !== 'mandala') return 'He is beginning to open.'
  return 'He is settling. Hold the house still.'
}
