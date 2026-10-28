// GUIDED DEMONSTRATION.
// A script of ordinary actions (place, move, buy, enter, make a sound, wait). It uses the same
// functions as a visitor's hands, so the daemon, the coins and the scenes are all real; outcomes vary.

import { INITIAL_LAYOUT } from './engine/rooms.js'

export const DEMO_STEPS = [
  {
    caption: 'An abandoned house: an empty plot, a dormant daemon.',
    run: async (api, wait) => {
      api.clear()
      await wait(3.5)
    },
  },
  {
    caption: 'Someone arrives. Two small sounds (simulated taps).',
    run: async (api, wait) => {
      api.hear('tap')
      await wait(1.3)
      api.hear('tap')
      await wait(2.5)
    },
  },
  {
    caption: 'A modest first house is placed, one block at a time.',
    run: async (api, wait) => {
      for (const r of INITIAL_LAYOUT) {
        api.place(r.type, r.col, r.row, r.rotation)
        await wait(0.8)
      }
      await wait(3.5)
    },
  },
  {
    caption: 'The kitchen moves to Agneya, the south-east, where the reference places fire.',
    run: async (api, wait) => {
      api.move('kitchen', 4, 4)
      await wait(4)
    },
  },
  {
    caption: 'Storage and a second bedroom join the two halves into one household.',
    run: async (api, wait) => {
      api.place('storage', 4, 3)
      await wait(1.5)
      api.place('bedroom', 4, 2)
      await wait(5)
    },
  },
  {
    caption: 'Coins earned are spent: a courtyard, and more room slots.',
    run: async (api, wait) => {
      api.openShop(true)
      await wait(2)
      api.buy('type-garden')
      await wait(1.5)
      api.buy('slots-1')
      await wait(2)
      api.openShop(false)
      api.place('garden', 2, 2)
      await wait(5)
    },
  },
  {
    caption: 'The bathroom is pushed into the open centre, against the storage wall. A clap.',
    run: async (api, wait) => {
      api.move('bathroom', 3, 3)
      await wait(2.5)
      api.hear('clap')
      await wait(5)
    },
  },
  {
    caption: 'Enter the house the daemon now imagines.',
    run: async (api, wait) => {
      api.enter()
      await wait(11)
      api.leave()
      await wait(2.5)
    },
  },
  {
    caption: 'Silence. (Shortened to 8 seconds for the demo.) Zones fall into neglect; rooms go dormant.',
    run: async (api, wait) => {
      api.setSilence(8)
      api.hear('silence')
      await wait(20)
    },
  },
  {
    caption: 'Activity returns: a hum, then a steady rhythm.',
    run: async (api, wait) => {
      api.hear('hum')
      await wait(1.2)
      api.hear('rhythm')
      await wait(6)
    },
  },
  {
    caption: 'Demo complete. The house is yours to arrange, enter and repair.',
    run: async (api, wait) => {
      api.restoreSilence()
      await wait(3)
    },
  },
]
