// What the daemon says in its log. Fictional narration, written in terms of hearing:
// the daemon never "sees" anything. Edit freely.
// Placeholders: {room}, {zone} (e.g. "north-east"), {adj} (e.g. "eastern"), {was} (a previous zone).

export const LINES = {
  WAKE: [
    ['Something is moving. I had forgotten that sound.', 'Footsteps? No. Something smaller. Something is still moving.'],
    ['You came back. I was not sure you would.', 'The building is active again.'],
    ['You always come back. And then the house goes quiet again.', 'Again. I will listen, but I will not hurry.'],
  ],
  BREATHE: ['The ventilation breathes for me. I can think again.', 'Air moves through the restored shafts. The noise settles.'],
  OPEN_WINDOWS: ['I opened the windows. The bells of the town are louder than the argument.', 'Air from outside. Somewhere a bell, and the voices soften.'],
  RESTORED: ['The {room} is awake again. I can hear it breathing.', 'A room I had given up on is answering again.'],
  DORMANT_ROOM: ['The {room} has gone dormant. I cannot hear it any more.', 'I stopped listening to the {room}. It was too quiet to keep.'],
  NEGLECT: ['The {zone} is falling quiet. I have stopped maintaining it.', 'Dust in the {zone}. I no longer send current there.'],
  STABILISED: ['Someone braced the {zone}. It holds.', 'The {zone} is steady again. I can hear its beams settle.'],
  ENTERED: ['Footsteps at the door. Someone is inside the house I imagined.', 'I hear you walking in. Listen with me.'],
  LEFT: ['The footsteps have gone back to the plan.', 'You left. The rooms keep their stories.'],
  ACTIVATE_SYSTEM: ['Something settled in the {zone}. I am turning the old pipes on there.', 'A new weight in the {zone}. The heating clicks, as if it remembers.', 'I heard a room arrive in the {zone}. The wiring hums for it.'],
  SETTLE: ['The house sounds like itself.', 'Everything rings at the right pitch.'],
  RESIST: ['The house is not the way I remember it.', 'The house remembers a quieter arrangement.', 'The {room} belongs in the {was}. I will keep hearing it there.', 'No. I am still playing the old house. It sounded better.'],
  BECOME_CONFUSED: ['The house has changed. I cannot recognise its rhythm.', 'I do not recognise this arrangement.', 'Again? Which house is this?', 'I counted the rooms twice and heard different numbers.', 'The echoes come back from walls that are not there anymore.'],
  RECALL_GOOD: ['I know this house. I have heard it before.', 'A familiar sound has returned.', 'This arrangement. Yes. This is how it used to sound.'],
  RECALL_BAD: ['I remember this arrangement. It ended in shouting.', 'Not this house again. I remember what it sounded like.', 'I have heard this layout before. Someone cried in it.'],
  LISTEN: ['I heard movement near the {adj} rooms.', 'Something has changed near the {room}.', 'Something was set down in the {zone}. I am listening.', 'A click from the {zone}. Nothing else yet.'],
  REMOVED: ['The {room} went silent. I can still hear where it was.', 'A room was lifted out of the {zone}. The air there is thinner now.'],
  EMPTY: ['There are no rooms. Only the hum.', 'I hear nothing standing on the floor at all.'],

  QUIET: ['It is getting quiet.', 'Less movement now. I am still listening.'],
  FADING: ['I heard nothing. I am shutting the old systems down.', 'The old systems are losing their rhythm.', 'Silence again. The pipes can rest. The lights can rest.'],
  DORMANT: ['…', 'The hum is the last thing left.', 'I will wait. I am good at waiting.'],
  RETURN_FROM_QUIET: ['Something again. Good.', 'Not gone, then.'],

  heard: {
    tap: ['Tapping. Someone is testing the walls.', 'Knocks, small and close. Someone is here.'],
    clap: ['A crack, sharp and close. Did something break?', 'A sudden sound. I flinched the lights.'],
    hum: ['Someone is humming at my frequency.', 'A low tone. It sits right under my own hum.'],
    whisper: ['A whisper. I cannot make out words; I only hear that it is there.', 'Something very quiet, almost breath.'],
    voice: ['I heard voices, but I cannot identify their source.', 'A voice-shaped sound. I don’t understand words. I hear that someone is here.', 'Sound, at the pitch of a person.'],
    rhythm: ['A rhythm. Like the old days, someone keeping time.', 'Regular. Repeating. The house remembers routines.'],
    silence: ['Hush. I hear the house holding its breath.'],
  },
}

export function fill(line, ctx = {}) {
  return line
    .replaceAll('{room}', ctx.room ?? 'room')
    .replaceAll('{zone}', ctx.zone ?? 'house')
    .replaceAll('{adj}', ctx.adj ?? 'inner')
    .replaceAll('{was}', ctx.was ?? 'old place')
}

// Pick a line, avoiding the ones said most recently.
export function pick(options, recent) {
  const fresh = options.filter((l) => !recent.includes(l))
  const notLast = options.filter((l) => l !== recent[recent.length - 1])
  const pool = fresh.length ? fresh : notLast.length ? notLast : options
  return pool[Math.floor(Math.random() * pool.length)]
}
