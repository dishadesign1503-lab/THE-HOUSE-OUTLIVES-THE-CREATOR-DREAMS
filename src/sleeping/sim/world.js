// THE WORLD — wires the house, his senses, his mind, his body and the night together.
//
// The simulation runs in fixed steps of 0.1 s (deterministic for a given seed and sequence of
// actions, so it can be tested without a browser — see scripts/sleeping-sim-test.mjs). The body
// animates between steps at the screen's frame rate.

import { createRng } from './rng.js'
import { createEnvironment, act as envAct, step as envStep } from '../house/environment.js'
import { OBJECT } from '../house/plan.js'
import { perceive } from '../entity/senses.js'
import { Mind } from '../entity/mind.js'
import { Animator } from '../entity/animator.js'
import { createStory, machineToggled, searchRoom, startStory, updateStory } from '../story/progression.js'

export const STEP = 0.1

export function createWorld(seed = (Date.now() % 100000) + 1) {
  const rng = createRng(seed)
  const env = createEnvironment()
  const body = new Animator(seed)
  const mind = new Mind(rng, body)
  const story = createStory(createRng(seed * 31 + 7))
  // Let him feel the house he starts in, quietly, before anyone arrives.
  const P = perceive(env)
  mind.perception = P
  mind.tonic(P)
  mind.feel(0.1, P)
  mind.comfort = 0.6
  return {
    seed,
    env,
    body,
    mind,
    story,
    acc: 0,
    discoveries: [], // first-time sensory relationships: { key, text, region, sense, t, user }
    feed: [], // recent reactions for the interface
    fx: [], // sensory events, for the visual effects and sounds
    version: 0,
  }
}

export function begin(world) {
  startStory(world)
}

function simStep(world) {
  const { env, mind, story } = world
  envStep(env, STEP)
  const events = env.events
  env.events = []
  const P = perceive(env)
  const reactions = mind.update(STEP, P, events)
  updateStory(world, STEP, reactions)
  for (const e of events) world.fx.push(e)
  if (world.fx.length > 80) world.fx.splice(0, world.fx.length - 80)
  for (const r of reactions) {
    world.feed.push(r)
    if (r.key && r.room && !world.discoveries.some((d) => d.key === r.key)) {
      world.discoveries.push({ key: r.key, text: r.text, region: r.region, sense: r.sense, t: story.t, room: r.room, isNew: true })
    }
  }
  if (world.feed.length > 40) world.feed.splice(0, world.feed.length - 40)
}

// Advance by real time. `animate` is false in tests that only need the simulation.
export function stepWorld(world, dt, { animate = true } = {}) {
  world.acc += Math.min(dt, 0.25)
  while (world.acc >= STEP) {
    world.acc -= STEP
    simStep(world)
    if (!animate) {
      world.body.update(STEP / 2)
      world.body.update(STEP / 2)
    }
  }
  if (animate) world.body.update(Math.min(dt, 0.05))
  world.version += 1
}

// Everything the visitor can do goes through here.
export function act(world, action) {
  if (world.story.phase === 'ending' || world.story.phase === 'intro') return null
  if (action.type === 'search') {
    const result = envAct(world.env, action)
    return searchRoom(world, action.room) ?? result
  }
  const result = envAct(world.env, action)
  if (action.type === 'toggle' && OBJECT[action.id]?.kind === 'machine') machineToggled(world, action.id, result)
  return result
}
