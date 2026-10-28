// Headless check of the 3D dream (src/house/dream3d/architects.js): for many dreams in every
// stage, each architect rebuilds the plan, and the anchor must stay reachable from the player.
// Run: npm run test:dream3d

import { Game } from '../src/house/game/game.js'
import { ARCHITECTS, dreamHouse, solidsOf } from '../src/house/dream3d/architects.js'
import { collide, PLAYER_RADIUS } from '../src/house/world/physics.js'

let pass = 0
let fail = 0
const check = (ok, what) => (ok ? pass++ : (fail++, console.log('  FAIL', what)))
const strengths = {}

for (const stage of [0, 1, 2]) {
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game({ stage, seed })
    for (let i = 0; i < 30; i++) g.update(1 / 60, {})
    if (!g.debugDream()) continue
    const plan = g.dreamPlan()
    for (const a of Object.values(ARCHITECTS)) {
      const d = dreamHouse(plan, a)
      const what = `stage ${stage} seed ${seed} ${a.id}`
      check(!!d, `${what}: no dream house`)
      if (!d) continue
      strengths[a.id] = [...(strengths[a.id] ?? []), d.strength]
      // the start is clear of every solid
      const p = { x: d.start.x, y: d.start.y, vx: 0, vy: 0, r: PLAYER_RADIUS, contactUntil: {} }
      check(!collide(p, solidsOf(d.house)), `${what}: starts inside a wall`)
      check(d.house.walls.every((w) => w.pts0.length === w.pts1.length), `${what}: a wall changes its vertex count`)
    }
    // the way back: finding the anchor settles the dream in the plan
    g.anchorFound()
    check(g.dream?.phase === 'settling', `stage ${stage} seed ${seed}: anchorFound does not settle the dream`)
    for (let i = 0; i < 60 * 30 && g.dream; i++) g.update(1 / 60, {})
    check(!g.dream, `stage ${stage} seed ${seed}: the dream never ends`)
  }
}
for (const [id, s] of Object.entries(strengths)) console.log(`  ${id}: ${s.length} dreams, strength ${s.filter((x) => x === 1).length} full · ${s.filter((x) => x < 1).length} gentler`)
console.log(`\n${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
