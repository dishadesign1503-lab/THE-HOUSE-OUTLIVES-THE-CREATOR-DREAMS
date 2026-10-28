import { writeFileSync } from 'node:fs'
import { POSTURES, solve, BONES } from '../src/sleeping/entity/skeleton.js'
const ids = Object.keys(POSTURES)
let cells = ''
ids.forEach((id, i) => {
  const p = POSTURES[id]
  const s = solve(p.angles, p.lens, { x: p.rootX, y: p.rootY })
  const gx = (i % 4) * 440 + 220, gy = Math.floor(i / 4) * 460 + 230
  let g = `<g transform="translate(${gx} ${gy}) rotate(45)">`
  for (const b of BONES) { const k = s[b.id]; g += `<line x1="${k.x0}" y1="${k.y0}" x2="${k.x1}" y2="${k.y1}" stroke="#A52238" stroke-width="2"/>` ; g += `<circle cx="${k.x1}" cy="${k.y1}" r="3" fill="none" stroke="#E8E3DD"/>` }
  for (const side of ['L','R']) for (const f of s.fingers[side]) g += `<polyline points="${f.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="#A52238"/>`
  g += `<circle cx="${s.head.x1}" cy="${s.head.y1}" r="14" fill="none" stroke="#A52238" stroke-width="2"/>`
  g += `</g><rect x="${gx-150}" y="${gy-150}" width="300" height="300" fill="none" stroke="#665080"/><text x="${gx-200}" y="${gy-200}" fill="#E8E3DD" font-size="16">${id}</text>`
  cells += g
})
writeFileSync(process.argv[2], `<svg xmlns="http://www.w3.org/2000/svg" width="1760" height="920" style="background:#101014">${cells}</svg>`)
