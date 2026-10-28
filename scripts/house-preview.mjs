// For each level, each organisation of rooms and each of his postures: is the plan valid
// architecture, how far its grid lines move, and can the doors be reached from the start.
//   node scripts/house-preview.mjs                       summary table
//   node scripts/house-preview.mjs origin origin curled  draw one (# wall, . reachable, x cut off, S start, D door)

import { LAYOUTS } from '../src/house/world/layouts.js'
import { House, COLS, ROWS, RES } from '../src/house/world/house.js'
import { Body, POSES } from '../src/house/body/body.js'

const [onlyHouse, onlyConfig, onlyPose] = process.argv.slice(2)
const P = ([x, y]) => ({ x, y })

for (const [id, L] of Object.entries(LAYOUTS)) {
  if (onlyHouse && id !== onlyHouse) continue
  const place = L.body
  const house = new House(L, Body.framesOf(place.pose, place))
  const start = P(L.start)
  console.log(`\n${id}: ${house.walls.length} wall pieces (${house.bound.length} partitions), ${house.windows().length} windows`)
  for (const configId of L.configs) {
    if (onlyConfig && configId !== onlyConfig) continue
    console.log(`  rooms: ${configId} (${house.cfgs.get(configId).label})`)
    for (const pose of Object.keys(POSES)) {
      if (onlyPose && pose !== onlyPose) continue
      const plan = house.planFor(Body.framesOf(pose, place), configId)
      const v = house.validatePlan(plan)
      const occ = house.rasterise(plan, { doorsShut: false })
      const dist = house.distances(occ, start)
      const exits = house.geometryFor(plan).exits
      const routes = exits.map((d) => `${d.id} ${house.routeTo(dist, d).toFixed(1)}`)
      const shift = plan.X.reduce((s, x, i) => s + Math.abs(x - house.X[i]), 0) + plan.Y.reduce((s, y, j) => s + Math.abs(y - house.Y[j]), 0)
      console.log(`    ${pose.padEnd(14)} ${v.ok ? 'valid  ' : 'INVALID'} lines moved ${shift.toFixed(2)}   ${routes.join('   ')}${house.freeAt(occ, start) ? '' : '   START BLOCKED'}${v.ok ? '' : `   ${v.problems[0]}`}`)
      if (onlyPose) {
        const W = COLS * RES
        for (let j = 0; j < ROWS * RES; j += 2) {
          let s = ''
          for (let i = 0; i < W; i++) {
            const x = (i + 0.5) / RES
            const y = (j + 0.5) / RES
            if (Math.hypot(x - start.x, y - start.y) < 0.2) s += 'S'
            else if (exits.some((d) => Math.hypot(x - d.mid.x, y - d.mid.y) < 0.3)) s += 'D'
            else s += occ[j * W + i] ? '#' : dist[j * W + i] >= 0 ? '.' : 'x'
          }
          console.log(s)
        }
      }
    }
  }
}
