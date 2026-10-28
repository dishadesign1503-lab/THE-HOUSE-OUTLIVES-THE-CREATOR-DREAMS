// A small seeded random generator (mulberry32), so a run can be replayed and debugged.
// Every "random" choice in the simulation goes through one of these.

export function createRng(seed = 1) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  }
}

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
export const lerp = (a, b, k) => a + (b - a) * k
