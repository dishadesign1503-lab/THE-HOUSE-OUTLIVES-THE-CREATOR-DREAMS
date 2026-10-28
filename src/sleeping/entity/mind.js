// HIS INNER STATE, AND HOW HE DECIDES WHAT TO DO.
//
// The mind receives only perception (senses.js) and sensory events (from the house). It combines
// them with its own state — posture, attention, comfort, irritation, sensitised body regions,
// recent history — and sends commands to the body (animator.js). The same stimulus can therefore
// produce different responses: a mild twitch when he is calm, a curl when he is already disturbed.

import { clamp } from '../sim/rng.js'
import { ROOM } from '../house/plan.js'
import { localise, REGION_WEIGHT, DIR } from './senses.js'
import { POSTURES, REGION_LABEL } from './skeleton.js'

const REGIONS = Object.keys(REGION_WEIGHT)
// Repetitive stimuli he gradually gets used to (sudden ones he never does).
const HABITUATES = new Set(['radio', 'chime', 'hum', 'machine'])
const HOUSE_WAKE_CAP = 0.55 // below the dawn threshold (progression.js): the house alone never wakes him
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']
export function compass(d) {
  if (!d) return 'nowhere'
  const a = Math.atan2(d.y, d.x)
  return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]
}

// What he hears, described in words for the observation log (never used by his decisions).
const SOUND_NAMES = {
  phone: 'A telephone', knock: 'A knock at the door', creak: 'A creaking door', radio: 'The radio', bang: 'A banging window',
  chime: 'A chime', rummage: 'Someone searching', clunk: 'A machine switching', scrape: 'Furniture scraping',
  thunder: 'Thunder', latch: 'A window latch', pipes: 'Ticking pipes', hum: 'A machine hum', ignite: 'The stove igniting',
  match: 'A match', receiver: 'The receiver lifted', rustle: 'A rug unrolled',
}
// "his feet twitch" / "his head twitches"
const v = (region, singular, plural) => (region === 'feet' ? plural : singular)

const SCENT_NAMES = { incense: 'Incense', food: 'Cooking', smoke: 'Smoke', flowers: 'Flowers', spoiled: 'Spoiled food' }

export class Mind {
  constructor(rng, body) {
    this.rng = rng
    this.body = body // the animator (or any object with the same commands)
    this.t = 0
    this.posture = 'mandala'
    this.postureSince = 0
    this.transitionEnds = 0
    this.postureHistory = [{ name: 'mandala', t: 0 }]
    this.comfort = 0.7
    this.irritation = 0.05
    this.peakIrritation = 0
    this.lastDisturbed = 0 // the last salient sound or tremor
    this.calmSince = 0 // when irritation last fell below the settling threshold
    this.wake = 0
    this.awake = false
    this.attention = null // { kind, dir, certainty, strength, until, label }
    this.history = [] // recent sensory events with their salience
    this.regionStress = Object.fromEntries(REGIONS.map((r) => [r, 0]))
    this.sensitivity = Object.fromEntries(REGIONS.map((r) => [r, 1]))
    this.lastHit = Object.fromEntries(REGIONS.map((r) => [r, -99]))
    this.habituation = {}
    this.later = []
    this.nextDecision = 2
    this.reactions = [] // produced this step (for the interface)
    this.settledFor = 0
    this.unease = 0 // background disquiet set by the night (the storm)
    this.mandalaComfort = 0.62
    this.disturbance = 0 // accumulated over the whole run
    this.disturbedRegions = Object.fromEntries(REGIONS.map((r) => [r, 0]))
    this.perception = null
    this.frozen = false // set when the night ends: he keeps the posture the ending gives him
  }

  // ---------- the step ----------

  update(dt, perception, events) {
    this.t += dt
    this.perception = perception
    this.reactions = []
    for (const e of events) this.respond(e, perception)
    const due = this.later.filter((l) => l.at <= this.t)
    this.later = this.later.filter((l) => l.at > this.t)
    for (const l of due) l.fn()
    this.tonic(perception)
    this.attend(perception)
    this.feel(dt, perception)
    if (this.t >= this.nextDecision) this.decide(perception, false)
    this.breathe()
    const settledNow = this.posture === 'mandala' && this.t >= this.transitionEnds && this.comfort >= this.mandalaComfort - 0.05 && this.irritation <= 0.25
    this.settledFor = settledNow ? this.settledFor + dt : 0
    return this.reactions
  }

  // ---------- responses to discrete events ----------

  salience(e, region, level) {
    const sens = this.sensitivity[region] ?? 1
    let s = level * sens * (1 + 0.6 * this.irritation)
    // Steady sounds lose their grip with time; sudden ones do not.
    if (HABITUATES.has(e.subtype)) {
      const h = this.habituation[e.subtype] ?? 0
      s *= Math.max(e.subtype === 'radio' || e.subtype === 'hum' ? 0.3 : 0.5, 1 / (1 + h))
    }
    return clamp(s, 0, 1.4)
  }

  respond(e, P) {
    const top = e.regions[0]
    if (!top) return
    const region = top.region
    const sal = this.salience(e, region, top.level)
    if (sal < 0.04 && e.type !== 'scent' && e.type !== 'texture') return
    this.history.push({ t: this.t, type: e.type, subtype: e.subtype, region, sal, cause: e.cause, id: e.id })
    if (this.history.length > 40) this.history.shift()
    const handler = { sound: this.onSound, vibration: this.onVibration, thermal: this.onThermal, airflow: this.onAirflow, scent: this.onScent, texture: this.onTexture }[e.type]
    handler?.call(this, e, P, region, sal)

    // Sudden stimuli sensitise the regions they reach; repeated hits matter more.
    if (e.type === 'sound' || e.type === 'vibration') {
      for (const r of e.regions) {
        if (r.level < 0.25) continue
        const repeated = this.t - this.lastHit[r.region] < 12
        this.sensitivity[r.region] = clamp(this.sensitivity[r.region] + (repeated ? 0.12 : 0.04) * r.level, 0.8, 1.8)
        this.lastHit[r.region] = this.t
      }
      if (HABITUATES.has(e.subtype)) this.habituation[e.subtype] = (this.habituation[e.subtype] ?? 0) + 0.25
    }
    // Disturbance accumulates; strong ones while already irritated push him toward waking.
    if (sal > 0.3 && (e.type === 'sound' || e.type === 'vibration')) {
      this.disturbance += sal
      this.disturbedRegions[region] += sal
      this.irritation = clamp(this.irritation + sal * 0.13 * (1 - this.irritation * 0.4))
      // Only strong disturbances while he is already irritated bring him toward waking. What the
      // house does by itself (machines, the storm) counts far less, and cannot wake him alone.
      if (sal > 0.4) {
        const gain = 0.13 * sal * Math.max(0, this.irritation - 0.4)
        if (e.cause === 'user') this.wake = clamp(this.wake + gain, 0, 1.2)
        else if (this.wake < HOUSE_WAKE_CAP) this.wake = Math.min(HOUSE_WAKE_CAP, this.wake + gain * 0.2)
      }
      this.lastDisturbed = this.t
    }
    // Several disturbances close together interrupt whatever he is doing.
    const recent = this.history.filter((h) => this.t - h.t < 6 && h.sal > 0.3).length
    if (recent >= 3 || sal > 1.05) this.decide(P, true, e)
    if (this.wake >= 1) this.awake = true
  }

  react(region, response, e, extra = {}) {
    const roomId = e?.room ?? (region ? Object.values(ROOM).find((r) => r.region === region)?.id : null)
    // A hidden source is described by what he did, never by where it really is.
    const where = e?.hidden ? 'somewhere in the house' : e?.outside || e?.subtype === 'thunder' ? 'outside' : roomId ? `in the ${ROOM[roomId].name}` : ''
    const stimulus = e ? (e.type === 'sound' ? SOUND_NAMES[e.subtype] ?? 'A sound' : e.type === 'scent' ? SCENT_NAMES[e.subtype] : e.type === 'thermal' ? thermalName(e.subtype) : e.type === 'airflow' ? 'A draft' : e.type === 'texture' ? `A ${e.subtype} floor` : 'A tremor') : ''
    this.reactions.push({
      t: this.t,
      region,
      regionLabel: REGION_LABEL[region],
      sense: e?.type ?? 'state',
      subtype: e?.subtype,
      room: e?.room,
      cause: e?.cause,
      key: e ? `${e.type}:${e.subtype}:${e.hidden ? 'hidden' : e.room}` : `${response}`,
      text: e ? `${stimulus} ${where} — ${response}.` : response,
      response,
      ...extra,
    })
  }

  onSound(e, P, region, sal) {
    // He localises from the whole sound field he feels, not from where the sound really is:
    // other sounds playing at the same time pull his guess away.
    const levels = { ...P.sound.levels }
    for (const r of e.regions) levels[r.room] = Math.max(levels[r.room] ?? 0, r.level)
    const here = localise(levels)
    const own = localise(Object.fromEntries(e.regions.map((r) => [r.room, r.level])))
    const certainty = here ? here.certainty * (own ? clamp(1 - angleBetween(here, own) / Math.PI) : 1) : 0
    const strength = clamp(0.45 + sal * 0.7)
    const delay = 0.2 + (1 - certainty) * 0.7 + this.rng.range(0, 0.25)
    if (here) {
      if (certainty < 0.4 && own) {
        // Competing sounds: a wrong first guess, then a correction.
        this.later.push({ at: this.t + delay, fn: () => this.body.attend(here, strength) })
        this.later.push({ at: this.t + delay + 0.9 + this.rng.range(0, 0.4), fn: () => this.body.attend(own, strength * 0.8) })
      } else {
        this.later.push({ at: this.t + delay, fn: () => this.body.attend(here, strength) })
      }
      this.attention = { kind: 'sound', dir: here, certainty, strength, until: this.t + Math.max(3, e.duration + 2), label: e.subtype }
    }
    this.body.pulse(region, clamp(0.25 + sal * 0.5), 0.35)
    if (sal > 0.5) this.body.flinch(clamp(sal - 0.2))
    if (sal < 0.12) return // too faint to be worth noting
    const resp =
      certainty < 0.4 ? `his head turns, hesitates, turns again` : `his head turns toward the ${compass(here)}${sal > 0.5 ? ' and he flinches' : ''}`
    this.react(region, `${resp}; his ${REGION_LABEL[region]} ${v(region, 'twitches', 'twitch')}`, e, { dir: here, certainty })
  }

  onVibration(e, P, region, sal) {
    for (const r of e.regions) {
      if (r.level < 0.1) continue
      this.body.tremor(r.region, clamp(r.level * 2 * this.sensitivity[r.region], 0.2, 2.2), 0.5 + r.level, 8 + this.rng.range(0, 4))
    }
    this.body.pulse(region, clamp(0.4 + sal * 0.6), 0.5)
    if (sal > 0.45) this.body.flinch(sal)
    this.regionStress[region] = clamp(this.regionStress[region] + sal * 0.6)
    const resp = sal > 0.45 ? `a tremor runs through his ${REGION_LABEL[region]} and he contracts` : `a tremor runs through his ${REGION_LABEL[region]}`
    this.react(region, resp, e)
  }

  onThermal(e, P, region) {
    const sub = e.subtype
    if (sub === 'cold' || sub === 'cooling') {
      this.body.tremor(region, 0.6, 1.6, 15)
      this.irritation = clamp(this.irritation + 0.03)
      this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'shivers and draws', 'shiver and draw')} in`, e)
    } else if (sub === 'hot') {
      this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'pushes', 'push')} outward, his breath quickens`, e)
    } else {
      this.body.sigh()
      this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'loosens', 'loosen')}`, e)
    }
  }

  onAirflow(e, P, region) {
    this.body.tremor(region, 0.5, 1.2, 17)
    const flow = P.regions[region].airDir
    // He turns his face toward where moving air comes from.
    if (flow) this.later.push({ at: this.t + 0.4, fn: () => this.body.attend(blendDir(DIR[e.room], { x: -flow.x, y: -flow.y }), 0.5) })
    this.irritation = clamp(this.irritation + 0.04)
    this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'flutters', 'flutter')}; he turns his face into the moving air`, e)
  }

  onScent(e, P, region) {
    const toward = DIR[e.room]
    const away = toward && { x: -toward.x, y: -toward.y }
    switch (e.subtype) {
      case 'incense':
        this.later.push({ at: this.t + 1, fn: () => this.body.attend(toward.x || toward.y ? toward : null, 0.7) })
        this.attention = { kind: 'scent', dir: toward, certainty: 0.8, strength: 0.7, until: this.t + 12, label: 'incense' }
        this.body.sigh()
        this.react(region, 'he turns slowly toward it and his breathing deepens', e)
        break
      case 'flowers':
        this.body.sigh()
        this.react(region, 'his breath lengthens', e)
        break
      case 'food':
        this.later.push({ at: this.t + 0.8, fn: () => this.body.attend(toward, 0.6) })
        this.body.pulse('handSE', -0.4, 0.8)
        this.body.pulse('handNW', -0.3, 0.8)
        this.react(region, 'his head lifts toward it, fingers flexing', e)
        break
      case 'smoke':
      case 'spoiled':
        if (away && (away.x || away.y)) this.later.push({ at: this.t + 0.5, fn: () => this.body.attend(away, 0.9) })
        for (let i = 0; i < 3; i++) this.later.push({ at: this.t + 0.6 + i * 0.5, fn: () => this.body.pulse('navel', 0.7, 0.2) })
        this.irritation = clamp(this.irritation + (e.subtype === 'smoke' ? 0.2 : 0.1))
        this.react(region, 'he turns his face away; his chest convulses', e)
        break
      default:
        break
    }
  }

  onTexture(e, P, region) {
    if (e.subtype === 'wool') {
      this.body.pulse(region, -0.5, 1.2)
      this.body.sigh()
      this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'spreads and rests', 'spread and rest')}`, e)
    } else if (e.subtype === 'stone') {
      this.body.pulse(region, 0.5, 0.8)
      this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'lifts', 'lift')} from the cold surface`, e)
    } else {
      this.body.pulse(region, 0.2, 0.4)
      this.react(region, `his ${REGION_LABEL[region]} ${v(region, 'settles', 'settle')} on the grain`, e)
    }
  }

  // ---------- continuous responses ----------

  // Held tension in each region: cold and drafts draw it in, heat pushes it out, a soft floor
  // lets it rest, recent disturbance keeps it guarded.
  tonic(P) {
    for (const region of REGIONS) {
      const r = P.regions[region]
      let v = r.cold * 0.95 + r.draft * 0.45 - r.hot * 0.75 + this.regionStress[region] * 0.35
      if (r.floor === 'wool' && r.cold < 0.2) v -= 0.18
      this.body.setTension(region, clamp(v, -1, 1))
    }
  }

  // Attention follows ongoing sounds and scents and lapses when nothing holds it.
  attend(P) {
    const a = this.attention
    if (P.sound.max > 0.14 && P.sound.where) {
      const hab = Math.max(0.3, 1 / (1 + (this.habituation.radio ?? 0) * 0.3))
      if (!a || a.kind === 'sound' || this.t > a.until) {
        const strength = clamp(P.sound.max * 1.6 * hab)
        if (strength > 0.2) {
          this.body.attend(P.sound.where, strength)
          this.attention = { kind: 'sound', dir: P.sound.where, certainty: P.sound.where.certainty, strength, until: this.t + 2, label: a?.label ?? 'sound' }
        }
      }
    }
    if (this.attention && this.t > this.attention.until) {
      this.attention = null
      this.body.attend(null)
    }
  }

  feel(dt, P) {
    let incense = 0
    let floorBonus = 0
    let smell = 0
    let noise = 0
    let vib = 0
    for (const region of REGIONS) {
      const r = P.regions[region]
      const w = REGION_WEIGHT[region]
      // Incense comforts him at a moderate strength; too much becomes smoke to him.
      const c = r.scent.incense
      incense = Math.max(incense, c < 1 ? Math.min(c / 0.3, 1) * 0.2 : Math.max(-0.25, 0.2 - (c - 1) * 0.9))
      smell += (r.scent.smoke * 0.8 + r.scent.spoiled * 0.5) * w * 0.12
      if (r.floor === 'wool') floorBonus += 0.012
      noise += Math.max(0, r.sound - 0.06) * w
      vib += r.vib * w
      this.regionStress[region] = Math.max(0, this.regionStress[region] - dt * 0.08)
      this.sensitivity[region] += (1 - this.sensitivity[region]) * dt * 0.012
    }
    const flowers = Math.min(P.regions.navel.scent.flowers, 0.6) * 0.08
    noise /= 9
    vib /= 9
    for (const k of Object.keys(this.habituation)) this.habituation[k] = Math.max(0, this.habituation[k] - dt * 0.01)

    const target = clamp(
      1.02 - 1.6 * (P.cold + P.hot) - 0.9 * P.draft - 1.8 * noise - 2.4 * vib - smell + incense + flowers + floorBonus - this.unease - P.storm * 0.04,
    )
    this.comfort += (target - this.comfort) * clamp(dt / 3)
    if (this.comfort < 0.45) this.irritation = clamp(this.irritation + (0.45 - this.comfort) * 0.05 * dt)
    const quiet = this.t - this.lastDisturbed > 3
    if (quiet) this.irritation = clamp(this.irritation - dt * 0.03 * (0.4 + this.comfort))
    if (this.irritation > 0.32) this.calmSince = this.t
    this.peakIrritation = Math.max(this.peakIrritation * (1 - dt * 0.02), this.irritation)
    if (quiet && this.irritation < 0.45) this.wake = Math.max(0, this.wake - dt * 0.006 * (0.5 + this.comfort))
    if (this.wakeWarned !== true && this.wake > 0.6) {
      this.wakeWarned = true
      this.react('head', 'He stirs as if close to waking.', null)
    }
    if (this.wake < 0.45) this.wakeWarned = false
    if (this.wake >= 1) this.awake = true
    this.body.restless = clamp(this.irritation * 0.7 + P.hot * 0.5 + this.wake * 0.3)
  }

  // ---------- posture ----------

  decide(P, urgent, e) {
    this.nextDecision = this.t + 1 + this.rng.range(0, 0.4)
    if (this.awake || this.frozen) return
    const dwell = this.t - this.postureSince
    if (!urgent && dwell < 3.5) return
    const calmFor = this.t - Math.max(this.calmSince, this.lastDisturbed)
    const settleDelay = 4 + 12 * this.peakIrritation
    const soundStress = clamp(this.history.filter((h) => h.type === 'sound' && this.t - h.t < 10).reduce((s, h) => s + h.sal, 0) / 2)
    const vibStress = clamp(this.history.filter((h) => h.type === 'vibration' && this.t - h.t < 10).reduce((s, h) => s + h.sal, 0) / 2)
    const I = this.irritation
    const C = this.comfort
    const scores = {
      mandala: 1.6 * C - 1.8 * I - 0.8 * P.cold - 0.6 * P.hot + 0.2,
      stretched: 0.9 * C + 1.6 * P.hot - 1.2 * I - 0.8 * P.cold + 0.05,
      turned: 1.1 * I + 0.5 * vibStress - 0.3 * C + 0.1,
      curled: 2.2 * P.cold + 0.9 * I + 0.6 * vibStress - 0.35,
      guarded: 1.5 * soundStress + 0.6 * I - 0.45,
      sprawled: 2.2 * P.hot + 0.3 * I - 0.5,
    }
    // He only returns to his own shape once he has been calm for a while and is comfortable.
    if (calmFor < settleDelay || C < this.mandalaComfort || I > 0.32) scores.mandala = -9
    if (urgent && e) {
      if (e.type === 'sound') scores.guarded += 0.5
      if (e.type === 'vibration') scores[this.rng.chance(0.5) ? 'curled' : 'turned'] += 0.5
    }
    for (const k of Object.keys(scores)) {
      scores[k] += this.rng.range(0, 0.15)
      // He tosses rather than returning straight to a position he just left.
      const left = this.postureHistory.findLast((h) => h.name === k && h.name !== this.posture)
      if (left && this.t - left.t < 10 && k !== 'mandala') scores[k] -= 0.15
    }
    scores[this.posture] += urgent ? 0.05 : 0.25
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
    if (best !== this.posture) this.setPosture(best, urgent)
  }

  setPosture(name, urgent = false) {
    const dur = name === 'mandala' ? 4.2 + this.rng.range(0, 1) : urgent ? 1.1 + this.rng.range(0, 0.6) : 2.4 + this.rng.range(0, 1.6)
    this.postureHistory.push({ name: this.posture, t: this.t })
    if (this.postureHistory.length > 12) this.postureHistory.shift()
    this.posture = name
    this.postureSince = this.t
    this.transitionEnds = this.t + dur * 1.45
    this.body.setPosture(name, dur)
    if (name === 'mandala') this.body.sigh()
    this.react(null, `He shifts: ${POSTURES[name].label.toLowerCase()} — ${POSTURES[name].note}.`, null, { posture: name })
  }

  // Force a posture (the story uses this for the storm and the endings).
  force(name, dur = 2.5) {
    this.postureHistory.push({ name: this.posture, t: this.t })
    this.posture = name
    this.postureSince = this.t
    this.transitionEnds = this.t + dur * 1.45
    this.body.setPosture(name, dur)
  }

  breathe() {
    const I = this.irritation
    const P = this.perception
    const settled = this.posture === 'mandala' && I < 0.2
    this.body.setBreath({
      rate: (settled ? 0.13 : 0.17) + 0.28 * I + 0.1 * (P?.hot ?? 0) + 0.04 * (1 - this.comfort),
      depth: settled ? 1.3 : 0.9 + 0.4 * I,
      irregular: clamp(I * 0.9 + this.wake * 0.4),
    })
    if (this.wasIrritated && I < 0.18) {
      this.body.sigh()
      this.wasIrritated = false
    }
    if (I > 0.4) this.wasIrritated = true
  }
}

function angleBetween(a, b) {
  return Math.acos(clamp(a.x * b.x + a.y * b.y, -1, 1))
}
function blendDir(a, b) {
  const x = (a?.x ?? 0) + b.x
  const y = (a?.y ?? 0) + b.y
  const m = Math.hypot(x, y) || 1
  return { x: x / m, y: y / m }
}
function thermalName(sub) {
  return { cold: 'Cold', cooling: 'Cooling air', hot: 'Heat', warming: 'Warmth' }[sub] ?? 'A change of temperature'
}
