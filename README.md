# The House Outlives Its Creator

*Some rules survive the reason they were made.*

## Play

**Online:** https://dishadesign1503-lab.github.io/The-House-Outlives-Its-Creator/ (best on a phone).

**On your own computer** (needs [Node.js](https://nodejs.org/) 20 or newer):

```
npm install        install the packages (once)
npm run dev        then open http://localhost:5173
```

To try it on a phone from your computer, run `npm run dev:phone`, open the *Network* address it prints on the phone (same Wi-Fi), and accept the certificate warning once.

## Controls

| Action | Phone | Laptop |
| --- | --- | --- |
| Roll the runner | tilt the phone (allow *Motion & Orientation* when asked) | arrow keys or W A S D |
| No tilt available | drag a finger on the plan | drag with the mouse |
| Hypnotize him | **HYPNOTIZE** → **START SPEAKING** → say "You are a boat" (or a tree, a stone, a lamp stand …) → **STOP** | the same, with the laptop microphone, or type the sentence in the popup |
| Sound on / off | **SOUND** | **SOUND** |
| Pause | **II** | **II**, Esc or P |

Each stage tells you its goal on screen. When he dreams ("Ohh no... He's dreaming!"), reach the green **ANCHOR** to settle the house.

**What it needs.** A current browser (Chrome, Edge, Safari, Firefox). Sound starts after the first tap. The microphone is asked for only when you press START SPEAKING, and speech is recognised on the device: no audio leaves it. The first hypnosis downloads the 41 MB speech model once. Tilt and microphone need https, which GitHub Pages provides.

## Build and publish

```
npm run build      the finished site, in dist/
npm run preview    serve that build locally to check it
```

The game is a static website: no server, database or API keys. Every push to `main` is built and published by `.github/workflows/deploy.yml`. In the GitHub repository, set **Settings → Pages → Source: GitHub Actions** once.

## Credits and licences

- **Code:** this repository.
- **Speech recognition:** [vosk-browser](https://github.com/ccoreilly/vosk-browser) and the Vosk small English model (`public/models/`), Apache 2.0, © Alpha Cephei.
- **Demon voice lines** (`public/audio/demon/`): [Demon Voice - Die!](https://pixabay.com/sound-effects/people-demon-voice-die-488316/) and [Demon Voice - I Don't Forgive!](https://pixabay.com/sound-effects/film-special-effects-demon-voice-i-donx27t-forgive-520949/) by PhatPhrogStudio, from Pixabay, under the [Pixabay Content License](https://pixabay.com/service/license/): free to use in a new creative work such as this game, with no attribution required. The files are unchanged.
- **Snoring, snarl and clatter** (`funny-snoring-sound-effect.mp3`, `wake/largepredatorsnarl.mp3`, `wake/unreal-tumbling-buckets.mp3`): downloaded from [Myinstants](https://www.myinstants.com/), a site where users upload sound clips. The files are byte-identical to the ones hosted there: [LargePredatorSnarl](https://www.myinstants.com/en/instant/largepredatorsnarl-77722/) (uploaded by carter816), [Unreal Tumbling Buckets](https://www.myinstants.com/en/instant/unreal-tumbling-buckets-57533/) (made by kalbright3275, per its description), and the snoring clip (hosted at `myinstants.com/media/sounds/funny-snoring-sound-effect.mp3`, uploader not listed). Myinstants grants no licence to reuse its clips, and their original authors are not stated.
- **Fonts:** Inter, Cormorant Garamond, IBM Plex Mono and IBM Plex Sans from Google Fonts (SIL Open Font License).
- **City kit** (`public/data/`): used only by the earlier *Weimar: Hot & Cold* project and not included in this repository. That page needs the kit placed in `public/data/` to run.

## About

The current experience (the default page). A mobile-first game played by **tilting the phone**: you roll a glowing blue ball through an architectural plan. **Beneath the plan sleeps the Vastu Purusha**, a faint translucent body lying diagonally under the house; **the walls are his body made into architecture.**

## Four systems, one chain

```
wall collision → disturbance event → grid cell → body region → his state → his decision → posture or twitch → the walls move
```

| System | Code | What it does, and does not do |
| --- | --- | --- |
| Player physics | `world/physics.js` | Tilt accelerates the ball (inertia, friction, max speed). Wind pushes it. It bounces off walls. **It never moves a wall.** |
| Disturbance | `game/game.js` (`disturb`) | A collision becomes an event: point, strength, grid cell, body region. That region glows red, the phone vibrates (where it can), and the disturbance spreads to neighbouring cells. |
| His mind | `agent/agent.js`, `agent/planner.js` | A local utility planner with memory (no network, no language model). It updates his state and, when the house is idle, decides. |
| Transformation | `world/house.js` (`begin` / `update`) | Executes his decision: his body moves to the new posture and the floor plan follows it, from one valid plan to another. **The only code that moves walls.** |

**The transformation controller** has the states `IDLE → DISTURBED → DECIDING → TRANSFORMING → SETTLING → IDLE`. Disturbances arriving while he moves are queued and handled once the house is idle. His mind is told when each transformation starts and when it completes.

## His responses

- **Stay still:** when the disturbance is not enough.
- **Twitch:** a light knock. Only the grid lines over that part of him shift, so the rooms there grow or shrink a little, then come back.
- **Adjust a limb:** disturbance builds up in one region (knees drawn up, a leg stretched, hands drawn in).
- **Roll over or stretch out:** repeated knocks in the same place, or one strong blow (curled, stretched, on his side, restless, either side).
- **Close a passage:** you keep using it, and he lies so as to block it.
- **Return to a stable posture:** calm again after changes.

Each response family has a utility computed from the last disturbance's strength, how often that region was hit lately, the region's accumulated disturbance, arousal and stability. That is scaled by trust learned from outcomes, and reduced if he has just answered the same way. Every candidate posture is predicted before he takes it and rejected if it would crush the ball, cut off every door, or leave the house unchanged. Every candidate is also checked as architecture (see below) before he can choose it. Small changes keep the same rooms and only move a few grid lines; larger ones can reorganise the rooms.

## Hypnosis: "You are a …"

Press **HYPNOTIZE** under the plan. A popup explains: speak a hypnotic instruction beginning with "YOU ARE…" followed by an object (YOU ARE A LAMP STAND · A BOAT · A TREE · A STONE · A BRIDGE). Press **START SPEAKING** (only now is the microphone requested), say the whole sentence, press **STOP**. The popup shows what was heard. If it is not "You are" + an object he can picture, it says why, with **RETRY**. The same popup has a typed fallback.

The chain, link by link (each visible in the inspector's **hypnosis** tab with `?debug`):

1. **Words, on this device.** [Vosk](https://alphacephei.com/vosk/) (`vosk-browser`, WebAssembly) with the small English model in `public/models/` (41 MB, Apache 2.0, loaded from this site once, then offline). Two recognisers hear the same audio: a free one, and one guided by the expected phrases ("you are a boat" …). The free reading is used unless the guided one names an object where the free one names none or less ("about" → "a boat"; "lamps dead" → "lamp stand"). Only the words are kept, never the audio. (`voice/listener.js`)
2. **The object and its attributes.** "You are" is required. The object is found among about 130 known objects; each has physical attributes (0–1): upright, horizontal, elongated, branching, compact, spanning, curved, spread. Descriptive words shade them ("a small boat"). An unknown object is read from its description ("a tall thin thing"); if nothing can be pictured, the sentence is refused, never guessed. (`voice/objects.js`)
3. **Candidate postures that embody it.** Each attribute has a body template written in the skeleton's joint angles: a pole for upright, a long hull rolled onto one side for horizontal, a curl for compact, arms rising like branches for branching, an arched span, a crescent, a star. An object's posture is the weighted blend of its attributes' templates. It is offered at three degrees of expression (60, 85, 100 %, measured from his present posture) and on either side. (`body/embody.js`)
4. **His decision.** The candidates (and, for objects that lie across, span or spread, other organisations of the rooms) go to his existing utility planner. It weighs how closely each resembles the object's shape; the degree his mood allows (calm: fully; irritated, aroused or nagged: partly); memory (he does not give the same answer to the same object twice); and every architectural check (valid plan, no wall on the player, a way out still reachable). He chooses; the mapping only proposes. (`agent/planner.js` `embody`)
5. **"I AM A LAMP STAND." ×3.** He takes the chosen posture in three stages: a third of the way, two thirds, the whole shape. Each stage is spoken (the browser's speech synthesis, preferring an on-device voice), shown on screen, and moves his body *and*, through the plan bound to his body, the walls. The rooms reorganise, if he chose that, in the last stage. The spirals follow the real steps: drawn in while the words are recognised, a changed pattern while he decides, expanding, intensifying and settling with the three statements, fading when he sleeps again. (`game/game.js` `hypnotize`, `tranceStage`)
6. **The house takes the shape of his body** (`world/bodyplan.js`). For hypnosis the plan is drawn from the posture itself. Its **outline** is the bays his body covers, grown out from his torso and limbs. Raised, branching arms make a branching plan; curled up, it is compact; lying across, it is long and low; standing (a lamp stand), it is tall and narrow. Postures are composed in the plan's own frame, so upright objects stand north–south and lying ones lie east–west. The **corridor** follows his spine and upper limbs, and the **rooms** are the remaining bays grouped by the body region they lie over. Exits go on their required sides, doors join everything into one house, and windows stay in their rooms' walls. Stage 1 moves his body and the grid lines bound to it; stage 2 draws the plan from the two-thirds posture; stage 3 from the whole posture. Each stage keeps the bay the player stands in, so the player is carried, never left outside.
7. **The house.** Every stage goes through the same planner and transformation controller as any other change: a valid target plan, walls on a line moving together, windows with their walls, wind and light recomputed, the player carried along, never reset. Calmly hypnotised, he turns in his sleep without waking.

Measured from his first posture: a lamp stand is about four times as elongated, with the feet together; a boat is rolled about 50° onto its side; a stone is a third smaller and twice as bent; a star has its feet six times further apart.

**Sound.** Every supplied recording has one job, and its state (loaded, or why not) is listed in the inspector's sensors tab:

| File | What it is (measured) | When it plays |
| --- | --- | --- |
| `funny-snoring-sound-effect.mp3` | 12.3 s of snoring | looped with crossfades while he sleeps; faded when he stirs; silent under his words |
| `largepredatorsnarl.mp3` | 4 s, one rising snarl | once each time he wakes |
| `unreal-tumbling-buckets.mp3` | 9 s of sustained clattering | a 1.4 s excerpt (from a different moment each time) when a hard knock disturbs him; at most every 2.5 s |
| `…demon-voice-die…` | the word "die" | an instruction shouted at him; the oldest wall breaking |
| `…demon-voice-i-donx27t-forgive…` | "I don't forgive" | the third disturbance; resisting a hypnosis |

There is no settling sound: none of the recordings is one, so the dream's drone simply fades. **His spoken statements** ("I AM A BOAT." three times) cannot come from the recordings, which say other words. They come from the browser's speech synthesis, set deep and slow and preferring a deep voice on the device, so they stay intelligible. Beneath them is his **shadow voice**, built in the game's audio: a low growl and a breath on every word, in a long reverb, panned to where his head lies, so the voice seems to rise from under the house. Speech synthesisers that could be processed directly in the browser (meSpeak, espeak-ng) are GPL-licensed and were not added.

**His voice.** The two supplied demon recordings (unchanged, in `public/audio/demon/`) were transcribed with the game's own recogniser. They are demon voice lines, not instructions: "die" was recognised as *die*; "I don't forgive" is too heavily processed for the small model to transcribe, and the guided recogniser's noise was correctly refused. So they are his voice, not test inputs. "I don't forgive" sounds when he is disturbed a third time and moves the exit, and when he resists a hypnosis. "Die" sounds when an instruction is shouted at him, and when the oldest wall gives way.

**How much the house changes.** Besides sliding its grid lines, the house has eight organisations of the same twelve rooms: as built, courtyard moved south, gallery moved east, **branching corridors** (a trunk rising from the entrance hall, branching west, north-west and east), **a ring around an inner court**, **east–west bands**, **north–south strips**, and **a corridor spanning the house**. Each has a spatial character (the same attributes as an object's). When he embodies an object, his planner weighs how well each organisation expresses it, together with everything else. Measured from the original plan: a tree reassigned 38 % of the bays to other rooms (14 room adjacencies changed); a stone 29 % (11); a boat 31 % (18); a lamp stand 44 % (12); a bridge 33 % (16). Rooms' centres moved about a cell, and every plan stayed valid.

## He dreams

**When.** His own mind decides, never the player and never a timer. While he sleeps undisturbed a dream pressure builds, faster after a restless minute and with curiosity. Each second the chance that a dream begins grows with it, drawn from his own random source (`agent.dreamWish`). In tests he began to dream at 41, 46, 55 and 56 seconds in four games; hypnosis cannot start a dream.

**What happens** (`game/dream.js`):

1. "**Ohh no... He's dreaming!**", briefly, with a glitch. A slow, dark drone begins (the snoring sinks to a trace), the fog thickens in two layers (smoky brown and charcoal), amber light blooms and motes drift through it, shadows gather at the edges, and the whole scene sways very slightly. A dark, smoky dream cloud with amber edges gathers above his head, and fog with an amber-brown haze drifts through the rooms. Its density breathes, and walls, runner and anchor stay readable. The snoring sinks low.
2. **The house comes loose.** In dream cycles he takes dream postures and the rooms pass through other organisations. Each step is chosen by him (novelty, what was suggested to him, what never settled) and checked (a valid plan, nothing coming down on the player, the anchor still reachable). About two in five interior walls detach: walls of one room drift together, single segments drift and turn further on their own. They are still solid, and a wall drifting onto the runner eases it aside, never traps or teleports it. The exits are shut.
3. **The green ANCHOR**, a floor tile at the centre of a bay the player can reach, in a room the player has spent little time in. It blinks between bright and dim green under its label, with a halo that shows through the fog, and moves only with its room.
4. **Step onto it** (the runner's circle overlapping the tile): a green burst. The loose walls glide back, the last plan settles, the fog clears, the cloud fades, and the exits open. He decides how much of the dream the house keeps: the last dreamt plan, or the plan from before, weighing curiosity, irritation, how long he dreamt and what he remembers as stable. Either way the result is a valid, playable plan.

With `?debug` the inspector has a developer-only **Dream (D)** button for testing; players have no way to start or stop a dream.

## Three disturbances

A hidden count of significant disturbances: a severe knock, a burst of knocks, or a forceful or nagging instruction. A calm instruction is not one. The walls grow a little more uneasy with each. At the third he is irritated: the spirals break off, and his planner chooses a new place for the exit in another exterior wall *together with* a new posture. The new exit is checked as architecture (a proper opening with walls on both sides) and must be reachable from where the player is. The old opening closes as the new one opens, in one transformation, and the count starts again. (`agent/planner.js` `relocate`, `world/house.js` `exitAlternatives`)

## The house: a floor plan, not loose walls

The plan is drawn after a set of reference floor plans (kept privately, not in this repository) and stored as architectural data (`world/plan.js`, `world/layouts.js`):

- **A tartan grid.** Structural lines run north–south and east–west. The outer lines are the building's frame and never move. The bays between the lines are never narrower than 1 cell.
- **Rooms with stable names:** the entrance hall (where you start), the gallery (the north–south spine), the study, the west room, the south-west room, the open courtyard, the east room, the dining room, the kitchen, the L-shaped south-east room, the antechamber and the north hall.
- **Walls are derived, never placed.** A wall exists wherever two different rooms meet, or a room meets the outside. A shared wall therefore exists once, and every wall ends at a junction. The exterior shell is thick and partitions are thin.
- **Doors and windows are real gaps cut into their host walls.** A door connects two named rooms. A window is glazing in an exterior wall: solid to the ball, partly open to the air, clear to light.
- **Three organisations of the same rooms:** as built; the courtyard moved south; the gallery moved east.

**How it changes.** Each inner grid line is bound to the part of his body beneath it. When he moves, the lines move, and so does every wall on them: rooms on one side grow and the other side shrinks, and doors and windows travel with their walls. For a large change (rolling over) the house can also pass to another organisation. Walls that are no longer needed retract into their junctions, then the new ones grow out of theirs. All motion is eased and starts nearest the disturbance.

**Checked before it is chosen** (`validateConfig`, the planner, `npm run test:house` section 0): bays wide enough, every door and window fits inside its wall, doors only between rooms, windows and exits only in the exterior, every room reachable through doors, no crossing or doubled walls, no loose wall ends, no wall coming down on the ball, a way out still reachable. All 180 combinations (3 levels × 3 organisations × 20 postures) pass, and so does every frame of a transformation.

Drawing, collision, reachability and the wind all use the same wall pieces.

## Wind and sun

- **The wind outside is fixed per level.** It is drawn as fast layered streaks that bend around the building and turn turbulent at its corners.
- **It enters through windows facing it,** as dense pale flow with an orange chevron, and swirls in eddies at wall ends inside.
- **Inside it is a real force.** `windForce = airflow direction × strength × exposure`, up to 8 cells/s² against 11 from full tilt. It blows the ball along and across rooms, and it can be fought.
- **Transformations change the wind inside.** When he moves, windows travel with their walls and rooms open or close onto them, so the same wind enters differently.
- **Sunlight is fixed too.** It falls through windows facing the sun, shadows move with the walls, and sunlit floor is slippery.

## Run it

```
npm install          install the packages (once)
npm run dev          the game at http://localhost:5173 (laptop: arrow keys / WASD)
npm run dev:phone    over https on your network, for a phone
npm run test:house   checks every system and plays all stages and both endings (VERBOSE=1 to see every measurement)
```

Add `?debug` and open **inspector**. Its first tab, **chain**, shows each link with a ● when it has happened:

- the last collision
- grid cell and body region
- the region's disturbance
- arousal, posture and controller state
- the utility of each response, and the candidates (with why any were rejected)
- the selected action
- the transformation requested, and whether it has completed

Controls: **C** collision, **E** evaluate, **T** transform, **X** reset, **N** sound.

On a phone: `npm run dev:phone`, open the *Network* address, accept the certificate warning once, allow *Motion & Orientation* on an iPhone.

## Stages

| Stage | Task | What happens |
| --- | --- | --- |
| I · OBEY | Reach the north door without making him move. | While he makes a full change of posture the door is shut; it opens again once he settles, wherever it now is. |
| II · ADAPT | Reach a door; he must turn twice before any opens. | Three doors, a new sky. You have to disturb him to make him turn, and the house changes as he does. |
| III · QUESTION | The door is sealed by **the oldest wall**. | **Preserve:** walk niches 1 → 4 and stay still; he lies as the house was first built, and the old west door opens. **Interrupt:** strike the oldest wall three times; he tries to restore it, cannot, and is *unbound*. |

**Known limits.** Real-phone tilt, vibration and microphone are not verified on hardware in this build; tilt was tested with emulated device orientation. Speech recognition was verified in the browser with a synthesised English voice standing in for the microphone (it heard "you are about drifting sideways" for "you are a boat drifting sideways"), not yet with a real voice on a phone. The small model knows English only and mishears some words; the classifier tolerates that, but a misheard key word changes what he hears. Browsers report the audio node it uses (ScriptProcessor) as deprecated; it still works.

---

# Earlier project: The Sleeping House

*A blind body sleeps under the house. Change the house; watch what reaches him.*

Now at `#sleeping` (it was the default page before *The House Outlives Its Creator*). An abstract, articulated **Vastu Purusha** lies across a nine-square plan, head in the north-east, feet in the south-west; every room rests on part of his body. He is **blind**: he never reacts to the screen, the cursor or the visual effects. He only perceives what the simulated house does to his body — warmth and cold, moving air, sound, tremor, scent and the floor under him. One night, about 5–10 minutes, with three endings.

## Run it

```
npm install        install the packages (once)
npm run dev        start the app at http://localhost:5173
npm run test:sim   play the whole experience through without a browser and check every objective and ending
```

Press **Enter the house** (with sound; headphones help, the sounds are panned by room) or **Enter without sound**. The earlier projects stay available: *The Ghost That Hates Silence* at `#daemon`, *Weimar: Hot & Cold* at `#hot-cold`.

## What you see

- **The plan** (most of the screen): nine rooms over the mandala's nine zones, with doors, windows, radiators and objects. Temperatures shown are *felt* temperatures (stone feels colder than a wool rug). Heat is drawn as rising lines, cold as a fine hatch, moving air as streaks, scent as slow particles, sound as arcs, tremor as dashed ripples. These are pictures of the physics, not things he can see.
- **His body in the plan**: when a limb moves away from the resting mandala pose, the room above it shifts, shrinks or swells with it; the courtyard turns with his spine and breathes with his chest. The faint dashed outline is the house at rest. A room flushes crimson when the body part under it reacts.
- **The Vastu Purusha** (right): his posture, a trace of his breathing, a few words for his state, and a mark on the mandala's edge where his attention is turned. There is no anger meter: his state shows in posture, breath and movement.
- **Observations**: every new relationship you discover between a stimulus and his response (press **O** to fold).

## Controls

| Where | What |
| --- | --- |
| Plan | Click a room to open its controls. Click doors, windows, the roof lantern and objects to use them directly. Drag to pan, scroll or pinch to zoom, or use the **+ − ⟲** buttons. |
| Keyboard | **1–9** select rooms (laid out like a number pad: 1 = north-west … 9 = south-east), **Esc** closes, **Tab** moves through rooms and controls, arrows pan and **+ / − / 0** zoom when the plan is focused, **M** sound, **O** observations. |
| Room controls | Radiator (0–3), windows, doors, floor (stone / timber / wool rug), and the room's objects: telephone, knocking at the front door, radio, shifting the wardrobe or iron chest, machines, stove, extractor fan, incense, flowers. |

## The night

| Phase | Objective | How it is completed |
| --- | --- | --- |
| I · Discovery | Something troubles his sleep (a bedroom window, over his feet, has been left open). | He has reacted to a **sound**, a **temperature or air** change and a **vibration** that you caused. |
| II · Listening | A forgotten clock chimes in a hidden room (random each night, never drawn on the plan). | **Search** the right room. Read where his head turns and which body part twitches with each chime; other sounds pull his head the wrong way. A wrong search makes noise of its own, and the chime grows more insistent. |
| II · Warmth | A gust opens the north-west windows and the night gets colder. | All nine rooms are between 18 and 24.5° *felt*, with no drafts, for 8 seconds. Close windows, use radiators, open doors to share warmth, lay rugs. |
| II · Stillness | One machine (washing machine, water pump or refrigerator, random each night) starts thumping. | **Switch off** the machine whose room lies over the limb that trembles hardest. The wrong machine clunks and the tremor goes on; a refrigerator left off spoils and smells. |
| III · The storm | He curls up; the east shutter bangs; thunder rolls; it is colder and he is uneasy. | He must settle back into the **mandala posture** and stay there for 12 seconds, warm, comfortable and calm. In the storm warmth and quiet are not enough: he also needs something familiar: incense at the right strength (two sticks in a closed room become oppressive); rugs and flowers help a little too. The order matters: a stick burns for 50 seconds, so incense lit while he is still agitated can burn out before he is calm enough to respond to it. |
| IV · Dawn | The ending. | The house transforms, the outcome and its reason are shown, and **Another night** starts again with a new hidden chime and machine. |

### Endings

- **Restored** — before dawn he held the mandala posture for 12 s while warm, comfortable and calm. The plan relaxes into the ideal mandala.
- **Awakened** — the disturbances *you* caused (loud or repeated sounds and tremors while he was already irritated) pushed him past waking, or left him more than 60 % of the way there when dawn came. He rises and the rooms drift apart. What the house does by itself (machines, the storm) is capped below that threshold, so it can never wake him alone.
- **Unsettled** — dawn (4 minutes after the storm begins) came before he settled. The house keeps the shape of his discomfort.

Endings you have found are remembered in this browser.

## How it works

The code is in `src/sleeping/`:

```
house/plan.js         the architecture: rooms, zones and body regions, doors, windows, objects, floors
house/environment.js  the physics: heat, an airflow network (wind from the north-west), sound and
                      vibration transmission, scent, and every action the visitor can take
house/bodyMap.js      body → architecture: how his limbs deform the room lattice; the ending transforms
entity/senses.js      the only doorway to his mind: what each body region feels. Nothing visual passes.
entity/mind.js        his inner state (posture, attention, comfort, irritation, wake, sensitised
                      regions, habituation, history) and his decisions
entity/skeleton.js    the articulated figure: 20 bones, 3 fingers per hand, 7 postures
entity/animator.js    posture transitions, held tension, twitches and tremors, head turns, breathing
story/progression.js  the phases, objectives, endings and contextual hints
sim/world.js          wires it together; fixed 0.1 s steps, deterministic for a seed
audio/houseAudio.js   the house's sounds, built on the earlier project's sound engine
components/           the plan, the figure panel, room controls, objective, observations, intro, ending
```

**Senses → events.** Every change in the house produces sensory events (type, source room, intensity, duration, the body regions it reaches and how strongly, related recent events). Continuous conditions become events when they cross a threshold (a room turning cold, a draft starting, a scent arriving).

**Responses.** He combines each event with his state. He localises a sound from how loud it is under each part of his body, so competing sounds make him hesitate and turn the wrong way first. Tremors make the regions they reach shiver and contract; cold draws limbs in and keeps them there; heat pushes them out. Sudden stimuli sensitise the body part they hit, so repetition matters more; steady sounds he slowly gets used to. Several disturbances close together interrupt his movement and force a new posture. He only returns to the mandala after being calm for a while — longer the more disturbed he was.

**Tests.** `npm run test:sim` plays the night on five seeds the way a visitor would — finding the chime and the machine only from his reactions — and checks the three endings, that mistakes do not end the night, that slowness and curiosity are not punished, that competing sounds lower his certainty, and that the simulation is deterministic. `node scripts/preview-postures.mjs out.svg` draws every posture, for tuning them.

---

# Earlier project: The Ghost That Hates Silence

*(Now at `#daemon`.)*

*Arrange the house. Hear what it becomes.*

An interactive architectural game and sound installation for **Pandaemonium – Daemons for Weimar**. An abandoned house's intelligence has kept running for years without maintenance. It cannot see; it only hears. You design a house on a 6 × 6 grid laid over a Vastu Purusha Mandala. Then you **enter it** and walk through the rooms, each showing the scene the daemon imagines there. Coins earned from the daemon's approval and from challenges pay for repairing, upgrading and expanding the house.

This browser prototype stands in for a physical magnetic table. No hardware is needed.

## Run it

```
npm install     install the packages (once; includes three and @react-three/fiber for the walkthrough)
npm run dev     start the app at http://localhost:5173
```

In VS Code: open the folder, open a terminal (*Terminal → New Terminal*), run the two commands, and click the address. Use Chrome, Edge or Firefox. Open `http://localhost:5173/#daemon` and press **Start experience**, which turns on the sound. The earlier map game is still at `http://localhost:5173/#hot-cold`.

## The loop

1. **Design** the house on the 6 × 6 grid: one room per cell.
2. **The daemon hears** each change (the click of a block), interprets the layout and answers in sound, light, the Vastu figure and its log.
3. **Earn coins** for eligible events.
4. **Spend** them in the upgrade shop: open wings, add room slots and room types, gild or restore rooms, repair the building's systems.
5. **Enter the house.** The daemon reads the whole plan once and imagines a scene for every room. Walk through it.
6. **Return to the floor plan** with the exact layout kept, rearrange, and find a different house.

## Controls

| Where | What |
| --- | --- |
| Plan | Drag a block from the tray onto a built cell, or click a block to drop it into a sensible free cell. Drag rooms to move them; drag one off the table to remove it. Click to select, then <kbd>R</kbd> to turn it (for the entrance, this sets the side of the front door) or <kbd>Del</kbd> to remove it. |
| Plan | The hatched outer ring is **unbuilt** ground. Each wing opens in the shop, and a corner opens when both of its wings are open. Blocks are limited per type (e.g. one kitchen) and by the number of room slots. |
| Plan | **Enter the house** checks the plan and explains what to fix: an entrance with one free side for the front door, and at least three rooms. Rooms that can't be reached from the entrance are named; you'll only hear them. |
| Inside | <kbd>W</kbd>/<kbd>↑</kbd> forward, <kbd>S</kbd>/<kbd>↓</kbd> back, <kbd>A</kbd>/<kbd>D</kbd> step sideways, <kbd>←</kbd>/<kbd>→</kbd> (or <kbd>Q</kbd>/<kbd>E</kbd>) turn, <kbd>Shift</kbd> faster. Drag with the mouse to look, or press **Mouse look** (<kbd>Esc</kbd> releases it). On-screen arrows do the same. Walls and closed (dormant) doors stop you. Step out of the front door, or press **Return to floor plan**. |
| Anywhere | **Upgrade house** (next to the coin counter), **Vastu guide**, **Night mode** / **Day mode**, **Demo mode**, **Reset house** (press twice: a new session with the first house, 10 coins, no upgrades and a daemon without memory), **Help & settings** (silence interval, the daemon's inner state). |
| Sound | Master, **ambience** and **events** volume, **Mute**, **Stop all sound**, and a meter showing which sound families are playing now. |

## How the daemon works

The code is in `src/daemon/`:

```
engine/        the daemon: rooms, layout analysis, fictional beliefs, narration, decision engine
vastu/         the Vastu reference, assessment, and the figure's body-region responses
progress/      house state (wings, slots, types, features, neglect), coin economy, rewards, upgrades, condition
walk/          plan → building (walls, doors, windows), collision, layout validation, room scenes, 3D content
voice/         the sound engine (what the daemon produces) and the state → sound mix
hearing/       microphone analysis and simulated inputs (what the daemon perceives)
components/    the interface: board, tray, panels, shop, HUD, walkthrough
DaemonApp.jsx  wires it together; demo.js is the guided demo
```

**State.** The daemon keeps `activity`, `stability`, `confusion`, `attachment`, `memory` (layouts and its verdicts, recent tensions, how often it was left alone), `lastHeard`, `currentInterpretation`, `currentAction`, `lastLayout` and `timeSinceActivity`. It also keeps a slowly changing mix of moods. From these it reports one **outcome**: *harmony, tension, isolation, confusion* or *abandonment*. The board glow, the soundscape and the walkthrough all follow that outcome.

**Deciding.** After each settled change, it analyses the layout: rooms, zones, adjacency, isolation, open centre, and empty wings, neglected zones and gilded rooms. It runs the editable fictional readings in `engine/interpretations.js`, weighting most heavily what just changed, and lets memory colour what it hears. It then picks an action, weighted at random: settle, mark a room disturbed, mourn, become confused, resist, recall, activate a system, or listen. Two actions exist only after upgrades: **breathe** (restored ventilation) and **open the windows** (city windows). So the same plan can be read differently depending on its history, and a bigger house isn't automatically a happier one: empty wings and a sprawling, disconnected plan have their own readings.

**Silence and decay.** If nothing meaningful is heard for the silence interval (40 s by default, adjustable to 8 s for presenting), the house grows quiet and then shuts down. One **zone falls into neglect** (dust on the board, dimmer rooms, a new loss reading). When it goes **dormant**, rooms it had stopped hearing become **dormant rooms**: greyed out, sealed in the walkthrough and unheard by the daemon. Activity wakes it again, more slowly and more confused each time. The **house condition** badge shows Active, Stable, Disturbed, Deteriorating or Dormant, derived from the daemon and the house state.

## The walkthrough

When you enter, the app takes these steps:
1. validates the plan;
2. lets the daemon hear the door, then re-read the whole house;
3. snapshots its state;
4. picks one fictional scene per room;
5. builds the house in 3D. Each cell is a 4 × 4 m room, 3 m high. Rooms sharing a wall get a doorway, and open doorways (an upgrade) add corridors through empty cells. The front door opens onto a small porch, and windows glow with each room's imagined light.

The scenes stay fixed while you walk, unless the house falls dormant while you're inside, in which case the daemon re-imagines every room as neglected.

**Choosing scenes** (`walk/scenes.js`). Each room scores *harmony, tension, loss, neglect* and *quiet* from several sources:
- the daemon's global moods and its reading of that room
- the room's Vastu status and how many neighbours it has
- whether it is isolated, in a neglected zone, or dormant
- recent tensions in the daemon's memory
- upgrades such as gilding and lamps

A seeded weighted choice picks one. Confusion loosens the choice, and the seed includes the daemon's memory, so the same plan can become a different house. Every room type has its own scenes (a family on the sofa, a quarrel across the dining table, a cold stove, an unlit lamp, a coat nobody wears). Each scene also has its own lighting:
- **tension:** a moving light and a shadow sliding across the wall
- **loss:** a light that dims while you stand there
- **neglect:** dust and dust sheets

Each room's own sound mix is crossfaded in, and neighbouring rooms are heard faintly through the walls.

**Three layers kept apart.** Each room's card shows:
- **the daemon heard**: acoustic only, because it cannot see
- **it believes**: its inference
- **the scene**: what you are shown

The card is labelled *an imagined scene: the daemon's fiction, not a prediction*. Loss is told only through empty rooms, receding footsteps, fading light and subdued sound.

## Coins and upgrades

Coins stand for the building's recovered energy. They are counted in the real game state, and they are a **fiction**: earning them does not mean a layout is traditionally auspicious. The amounts are in `progress/economy.js`:

| Earned for | Coins |
| --- | --- |
| A room placed or moved into a zone where the Vastu reference aligns it (once per room) | 5 |
| The daemon approving a change you just made (once per layout, with a cooldown) | 5 |
| Entering a house the daemon reads as harmonious (once per layout) | 5 |
| A coin found inside a harmonious room in the walkthrough (up to 3 per visit, once per room and layout) | 5 |
| Challenges: *One household*, *Hearth of Agni*, *Quiet Ishanya*, *Rooted Nairitya* | 15 |
| Waking the building from dormancy (at most every 2 minutes) | 15 |
| A harmonious house held unchanged for 20 s (once per layout) | 15 |
| The first room the daemon accepts in a newly opened wing | 15 |
| Major milestones: *Open courtyard house*, *The whole plan aligned*, *A grand house* | 30 |

Coins fly from the place they were earned to the counter, which then counts up. A soft bell plays and a note explains why. Spending sends coins back into the house.

**Upgrades** (`progress/upgrades.js`): each one changes the actual house.
- **Expand:** four wings (+4 cells each; corners open with both neighbouring wings), room slots, and new room types (courtyard, prayer room, study, staircase).
- **Rooms:**
  - gild a room: gold trim; the daemon resists moving it
  - restore a dormant room
  - open doorways: corridors across one empty cell, so fewer rooms are isolated
  - jali screens: the daemon hears arguments more faintly
  - brass lamps and lime plaster: warmer light inside
  - a water basin in the Brahmasthan: water and birds while the centre stays open
- **Systems:**
  - restore the ventilation: slower fading, and the *breathe* action
  - repair the pipes: no drips or knocks, and the daemon is confused less easily
  - stabilise a neglected zone
  - open the windows to Weimar: distant bells and street life, and the *open the windows* action

The shop shows each upgrade's preview, cost, effect and status (available, purchased, locked, needs a target, or how many more coins you need).

## Sound

There are two buses, **ambience** and **events**. Each has its own volume and reverb, and a limiter keeps the level safe. The default volume is moderate and nothing plays before **Start**. Layers crossfade over about two seconds, and one-shots and scheduled sounds can't stack duplicates. Everything is synthesised in the browser:

| Family | Sounds |
| --- | --- |
| Household | voices at an easy pace (voice-like, with no words), laughter, children far away, light footsteps, crockery, birds, wind, room tone, running water, cooking |
| Conflict | two overlapping raised voices, sighs, hurried footsteps, sharp doors, a beating low drone |
| Loss | distant sobbing, a voice fading away, a clock in a quiet room, a soft minor pad, receding footsteps, long reverb |
| The old building | electrical hum, ventilation (rattling until repaired), pipes, clicks, creaks, dripping, doors moving, structural groan, wind through empty rooms |
| Confusion | two machines in rhythms that never agree, dropouts, distortion, muffling, a clock losing its rhythm, detuned hum |

You can replace any part with recordings, ideally self-recorded or freely licensed (no film audio). Put the files in `public/audio/` and list them in `public/audio/manifest.json`:

```json
{
  "loops": { "voices": "murmur.mp3", "argument": "argument.mp3", "crying": "crying.mp3", "birds": "birds.mp3", "drip": "drip.mp3" },
  "oneshots": { "door": "door-slam.mp3", "coin": "coin.mp3", "laugh": "laugh.mp3", "stepsAway": "steps-away.mp3" }
}
```

Loop names are the layer names in `voice/soundEngine.js`, for example `hum, vent, wind, house, tension, mourning, resonance, city, water, cooking, footsteps, clinks, voices, laughter, children, birds, argument, sigh, crying, fadingVoice, clock, drip, creak, pipes, doorsMoving, clicks, bells`. One-shot names: `magnet, lift, door, chime, glitch, thud, pipes, wake, shutdown, stepsAway, breathe, bells, laugh, sigh, coin, upgrade`. Missing or unlisted files fall back to the synthesised sound.

## Hearing: microphone and simulated sound

What the daemon **perceives** (`hearing/`) is kept apart from what it **produces** (`voice/`).

- **Microphone (optional):** it only turns on after you click **Enable microphone**. It measures loudness, length, brightness, noisiness and rhythm live. **Nothing is recorded, stored or sent anywhere, and no words are recognised.**
- **Simulated sounds:** the *Tap, Hum, Clap, Whisper, Rhythm, Silence* buttons produce the same perceptions.
- **Your footsteps:** inside the house, your steps are sounds the daemon hears too. They keep the house awake while you walk.

## Towards a physical table

`Daemon` in `engine/daemon.js` takes `considerLayout(rooms)` (`{ id, type, col, row, rotation }` on the 6 × 6 grid) and `hear({ kind, intensity })`. A magnetic table with a Hall-sensor or RFID matrix under the 36 cells could feed it over Web Serial or WebSocket, in place of the drag-and-drop handlers. The interpretation, memory, rewards, sound and walkthrough would all stay the same.

## How it meets the brief

- **Abandoned systems: urban systems keep running without maintenance.** The house's control system never stopped. It judges layouts by beliefs nobody maintains, resists change, lets zones fall into neglect and rooms go dormant, and shuts its own systems down in silence. Repairing ventilation and pipes changes how it behaves.
- **One non-visual sense: hearing only.** The daemon never receives an image. Its only inputs are sounds: the click of each block, the visitor's taps, hums, voices and footsteps, the front door, and silence. The walkthrough keeps *what it heard*, *what it believes* and *what you see* visibly apart.

## The Vastu Purusha Mandala layer

The 6 × 6 house grid sits inside the circular table as concentric rings: an outer ring of 20 cells, an inner ring of 12, and the 4 cells of the Brahmasthan. These are crossed by the diagonals and the north–south and east–west axes. Each reference zone is a 2 × 2 block of cells. Ishanya, Agneya, Nairitya and Vayavya label the corners, and Uttara, Purva, Dakshina and Paschima the sides. Vastu Purusha lies face-down across the plan, head in the north-east and feet in the south-west. The figure never catches the pointer.

A move is read in this order:
1. room type, position and facing
2. mandala zone
3. body region
4. status (**aligned / needs review / conflicting** with the selected reference)
5. visual reaction, sound and explanation

The data is in `vastu/reference.js` and `vastu/responses.js`. While you drag, the region under the room lights up and the **Vastu analysis** panel updates live. When you drop the room, only that region reacts, with a cue pitched by body part. The panel suggests the nearest aligned free cell, and **Move there** moves the room for you.

## A note on Vāstu

The Vastu analysis uses common, conventional residential associations. Prescriptions differ between texts, traditions and plots, so the app only ever says a placement is aligned with, needs review against, or conflicts with the *selected reference*. The figure and the mapping of body regions to zones are an illustrative visualisation of the traditional image, not an authoritative anatomical mapping.

The daemon is a separate, fictional character, not Vāstu Puruṣa. Its readings, its imagined domestic scenes and its coins are **invented narrative**. The app does not claim that any arrangement causes death, domestic violence, wealth, illness or any other life outcome. The project explores how an autonomous system can interpret architecture and shape how people perceive a place.

---

## Also in this repo: AI in Design start repo

A bare web app, a city kit of open data, and a starter prompt. GitHub Pages publishes the app on every push.

### Make your own copy

In the folder where you keep projects:

```
gh repo create city-reach --template Bauhaus-InfAU/ai-in-design --public --clone
cd city-reach
code .
```

Then turn on publishing: on GitHub, open your repo, Settings, Pages, and set Source to "GitHub Actions". After your next push the site is at `https://<your-username>.github.io/city-reach/`.

### What's in here

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | what the agent reads first every time it starts. Short on purpose: you add to it |
| `prompt.md` | the starter prompt |
| `public/data/` | the city kit: central Weimar, about 1.3 × 2 km. `SOURCES.md` there lists every file, its source, licence and fields. Not included in this repository |
| `public/audio/` | optional recordings for the daemon (see above) |
| `src/daemon/` | The Ghost That Hates Silence (the start page): plan, daemon, sound, coins, upgrades, 3D walkthrough |
| `src/game/`, `src/map/` | Weimar: Hot & Cold (at `#hot-cold`) |
| `.github/workflows/` | builds the app and publishes it to GitHub Pages on every push to `main` |

### Data and credit

Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0). Any page that shows the data carries this line.

### Weimar: Hot & Cold

A treasure hunt on the city kit map, at `#hot-cold`. The game secretly picks one of 16 real statues, monuments and fountains in the kit area. You get a clue (up to three), move around, and the map tells you how close you are:

| Colour | Name | Distance to the hidden landmark |
| --- | --- | --- |
| blue | Very cold | more than 500 m |
| cyan | Cold | 200–500 m |
| yellow/orange | Warm | 50–200 m |
| orange/red | Hot | 10–50 m |
| red | Very hot | within 10 m: you can confirm the find |

You move either with your phone's GPS (the browser asks for permission; it needs https or localhost) or by clicking the map and dragging the pin. If GPS is refused or unavailable, the game switches to the pin. The target is never drawn on the map until you find it.

The code is in `src/game/` (rules, clues, distance, GPS) and `src/map/CityMap.jsx` (the MapLibre map, drawn only from `public/data/`, without online map tiles). The city kit is not included in this repository, so this page runs only where the kit has been placed in `public/data/`.

Landmark positions come from OpenStreetMap (© OpenStreetMap contributors, ODbL), queried on 2026-10-20; each entry in `src/game/landmarks.js` names its OpenStreetMap object. Dates, artists and facts were checked against German Wikipedia and Wikidata. Limits: phone GPS is often only accurate to 5–20 m, so the 10 m find radius can need patience in narrow streets; and as in any game that runs fully in the browser, a player who reads the page's source code could find the answer list.

**3D view.** Buildings are extruded to their measured `height` from the LoD2 models (every building in the kit has one). Right-drag or Ctrl + drag turns and tilts the view; on touch, use two fingers.

**Building colours.** During a round, each building within about 180 m of the player is coloured by the real distance in metres from its centre to the hidden landmark, on a smooth gradient from red (closest) through orange, yellow and cyan to blue (furthest). Buildings further from the player stay pale, so the map does not give the target away from afar. Once the landmark is found, every building shows its colour. Each building's distance to the target is worked out once per round; moving only updates the buildings whose glow changes.
