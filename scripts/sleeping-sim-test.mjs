// End-to-end tests for The Sleeping House, without a browser.
// Each run plays the experience through the same actions a visitor can take, deducing hidden
// things (where the chime is, which machine shakes him) only from his visible reactions.
//
//   node scripts/sleeping-sim-test.mjs          all runs, several seeds
//   node scripts/sleeping-sim-test.mjs -v       with a timeline

import { createWorld, begin, stepWorld, act } from '../src/sleeping/sim/world.js'
import { ROOMS, ROOM, OBJECTS, WINDOWS, OPENINGS, roomOfRegion } from '../src/sleeping/house/plan.js'
import { COMFORT } from '../src/sleeping/house/environment.js'

const verbose = process.argv.includes('-v')
const log = (w, ...a) => verbose && console.log(`  [${w.story.t.toFixed(1).padStart(6)}s ${w.story.phase.padEnd(9)}]`, ...a)

function run(w, seconds, each) {
  const n = Math.round(seconds / 0.1)
  for (let i = 0; i < n; i++) {
    stepWorld(w, 0.1, { animate: false })
    if (each && each(w) === 'stop') return
  }
}
const until = (w, cond, max = 300, each) => {
  let t = 0
  while (!cond(w) && t < max) {
    run(w, 0.5, each)
    t += 0.5
  }
  return cond(w)
}

// --- a careful visitor ---------------------------------------------------------------

function warmHouse(w) {
  const env = w.env
  for (const win of WINDOWS) if (env.windows[win.id]) act(w, { type: 'toggleWindow', id: win.id })
  for (const o of OPENINGS) if (o.kind === 'door' && !env.doors[o.id]) act(w, { type: 'toggleDoor', id: o.id })
  for (const id of ['store', 'kitchen', 'court']) if (env.rooms[id].floor !== 'wool') act(w, { type: 'floor', room: id, floor: 'wool' })
}
// Adjust radiators the way someone reading the room temperatures would.
function tendRadiators(w) {
  const env = w.env
  for (const o of OBJECTS.filter((x) => x.kind === 'radiator')) {
    const r = env.rooms[o.room]
    const lvl = env.objects[o.id].level
    if (r.felt < COMFORT.lo + 1.2 && lvl < 3) act(w, { type: 'setRadiator', id: o.id, level: lvl + 1 })
    else if (r.felt > COMFORT.hi - 1 && lvl > 0) act(w, { type: 'setRadiator', id: o.id, level: lvl - 1 })
  }
}

function discovery(w) {
  act(w, { type: 'phone' })
  run(w, 5)
  act(w, { type: 'phone' })
  act(w, { type: 'toggleWindow', id: 'w-bedroom-w' })
  run(w, 4)
  act(w, { type: 'shift', id: 'wardrobe' })
  return until(w, (x) => x.story.phase !== 'discovery', 120)
}

function locate(w) {
  // Count which body part twitches with each chime.
  const votes = {}
  const seen = new Set()
  until(w, () => Object.values(votes).reduce((a, b) => a + b, 0) >= 3, 60, (x) => {
    for (const r of x.feed) {
      if (seen.has(r) || r.subtype !== 'chime') continue
      seen.add(r)
      votes[r.region] = (votes[r.region] ?? 0) + 1
    }
  })
  const region = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0]
  const guess = roomOfRegion[region]
  log(w, 'chime votes', votes, '→ search', guess, '(actual', w.story.locate.room + ')')
  act(w, { type: 'search', room: guess })
  run(w, 1)
  if (w.story.phase === 'locate' && !w.story.locate.found) {
    // a second, informed attempt: the rooms next to the guess, loudest twitch first
    for (const r of ROOMS) {
      if (w.story.locate.found) break
      if (w.story.locate.searched.includes(r.id)) continue
      act(w, { type: 'search', room: r.id })
      run(w, 3)
    }
  }
  return until(w, (x) => x.story.phase !== 'locate', 30)
}

function warmth(w) {
  warmHouse(w)
  return until(w, (x) => x.story.phase !== 'warmth', 200, (x) => {
    if (Math.round(x.story.t * 10) % 50 === 0) tendRadiators(x)
  })
}

function stillness(w) {
  if (w.story.phase !== 'stillness') return false
  const votes = {}
  const seen = new Set()
  until(w, () => Object.values(votes).reduce((a, b) => a + b, 0) >= 3, 40, (x) => {
    for (const r of x.feed) {
      if (seen.has(r) || r.subtype !== 'machine') continue
      seen.add(r)
      votes[r.region] = (votes[r.region] ?? 0) + 1
    }
  })
  if (!Object.keys(votes).length) return false
  const room = roomOfRegion[Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]]
  const machine = OBJECTS.find((o) => o.kind === 'machine' && o.room === room)
  log(w, 'tremor votes', votes, '→ switch off', machine?.id, '(actual', w.story.stillness.machine + ')')
  act(w, { type: 'toggle', id: machine.id })
  return until(w, (x) => x.story.phase !== 'stillness', 20)
}

function finalCareful(w) {
  until(w, (x) => x.story.phase === 'final', 10)
  warmHouse(w)
  let lastIncense = -99
  return until(w, (x) => x.story.phase === 'ending', 260, (x) => {
    if (Math.round(x.story.t * 10) % 50 === 0) tendRadiators(x)
    const m = x.mind
    if (m.irritation < 0.3 && x.story.t - lastIncense > 48) {
      act(x, { type: 'incense' })
      lastIncense = x.story.t
      log(x, 'incense lit; comfort', m.comfort.toFixed(2), 'posture', m.posture)
    }
  })
}

// --- runs ------------------------------------------------------------------------------

function summary(w) {
  const m = w.mind
  return `phase=${w.story.phase} ending=${w.story.ending?.kind ?? '-'} t=${w.story.t.toFixed(0)}s posture=${m.posture} comfort=${m.comfort.toFixed(2)} irritation=${m.irritation.toFixed(2)} wake=${m.wake.toFixed(2)} disturbance=${m.disturbance.toFixed(1)} discoveries=${w.discoveries.length}`
}

const results = []
function check(name, ok, w) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${summary(w)}`)
}

for (const seed of [11, 42, 1234, 777, 2024]) {
  console.log(`\n— seed ${seed} —`)
  // Restored: a careful visitor.
  {
    const w = createWorld(seed)
    begin(w)
    const ok1 = discovery(w)
    log(w, 'discovery', ok1)
    const ok2 = locate(w)
    const ok3 = warmth(w)
    const ok4 = stillness(w)
    finalCareful(w)
    check(`restored path (objectives ${[ok1, ok2, ok3, ok4].map((x) => (x ? '✓' : '✗')).join('')})`, ok1 && ok2 && ok3 && ok4 && w.story.ending?.kind === 'restored', w)
  }
  // Awakened: someone who keeps knocking and dragging furniture.
  {
    const w = createWorld(seed)
    begin(w)
    until(w, (x) => x.story.phase === 'ending', 240, (x) => {
      const k = Math.round(x.story.t * 10)
      if (k % 15 === 0) act(x, { type: 'knock' })
      if (k % 20 === 5) act(x, { type: 'shift', id: k % 40 === 5 ? 'wardrobe' : 'chest' })
    })
    check('awakened path (constant knocking and dragging)', w.story.ending?.kind === 'awakened', w)
  }
  // Unsettled: complete the objectives, then leave the house alone in the storm.
  {
    const w = createWorld(seed)
    begin(w)
    discovery(w)
    locate(w)
    warmth(w)
    stillness(w)
    until(w, (x) => x.story.phase === 'final', 10)
    for (const win of WINDOWS) if (w.env.windows[win.id]) act(w, { type: 'toggleWindow', id: win.id })
    until(w, (x) => x.story.phase === 'ending', 300)
    check('unsettled path (only the windows closed in the storm)', w.story.ending?.kind === 'unsettled', w)
  }
  // A mistake does not end the experience: one wrong search, one wrong machine.
  {
    const w = createWorld(seed)
    begin(w)
    discovery(w)
    const wrongRoom = ROOMS.find((r) => r.id !== w.story.locate.room && r.id !== 'court').id
    act(w, { type: 'search', room: wrongRoom })
    run(w, 3)
    const stillPlaying = w.story.phase === 'locate' && w.story.locate.wrong === 1
    locate(w)
    warmth(w)
    const wrongMachine = ['washer', 'pump', 'fridge'].find((m) => m !== w.story.stillness?.machine)
    act(w, { type: 'toggle', id: wrongMachine })
    run(w, 3)
    const stillPlaying2 = w.story.phase === 'stillness' && w.story.stillness.wrongOff.length === 1
    stillness(w)
    check('mistakes have consequences but do not end it', stillPlaying && stillPlaying2 && w.story.phase === 'final', w)
  }
}

// Fairness: slowness and curiosity are not punished with an ending.
{
  const w = createWorld(42)
  begin(w)
  for (let i = 0; i < 3; i++) {
    act(w, { type: 'knock' })
    run(w, 1)
  }
  act(w, { type: 'shift', id: 'wardrobe' })
  run(w, 2)
  act(w, { type: 'shift', id: 'chest' })
  run(w, 20)
  check('a curious visitor (3 knocks, 2 shifts) does not wake him', w.story.phase !== 'ending', w)
}
{
  const w = createWorld(42)
  begin(w)
  discovery(w)
  locate(w)
  warmth(w)
  run(w, 90) // a slow visitor: the hidden machine thumps for a minute and a half
  const awake = w.story.phase === 'ending'
  stillness(w)
  check('a slow visitor during the tremor objective does not wake him', !awake && w.story.phase === 'final', w)
}
// Doing nothing at all in the storm: never restored (the shutter keeps banging).
{
  const w = createWorld(7)
  begin(w)
  discovery(w)
  locate(w)
  warmth(w)
  stillness(w)
  until(w, (x) => x.story.phase === 'ending', 300)
  check('ignoring the storm ends unsettled (the house alone cannot wake him)', w.story.ending?.kind === 'unsettled', w)
}
// Competing sounds make him less certain where the chime is.
{
  const certainty = (withRadio) => {
    const w = createWorld(99)
    begin(w)
    discovery(w)
    if (withRadio) act(w, { type: 'toggle', id: 'radio' })
    const values = []
    const seen = new Set()
    run(w, 40, (x) => {
      for (const r of x.feed) {
        if (seen.has(r) || r.subtype !== 'chime') continue
        seen.add(r)
        values.push(r.certainty)
      }
    })
    return values.reduce((a, b) => a + b, 0) / (values.length || 1)
  }
  const quiet = certainty(false)
  const noisy = certainty(true)
  const w = createWorld(1)
  console.log(`      chime certainty: quiet ${quiet.toFixed(2)}, with the radio on ${noisy.toFixed(2)}`)
  check('competing sounds reduce his certainty', noisy < quiet - 0.1, w)
}

// Blindness: identical simulation regardless of anything visual. The mind has no access to the
// interface; this checks that two runs with the same seed and actions are identical.
{
  const a = createWorld(5)
  const b = createWorld(5)
  begin(a)
  begin(b)
  for (const w of [a, b]) {
    act(w, { type: 'phone' })
    run(w, 20)
  }
  check('deterministic for a seed (no hidden visual inputs)', a.mind.comfort === b.mind.comfort && a.body.frame.head.x1 === b.body.frame.head.x1, a)
}

const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
