// Deterministic PRNG utilities (mulberry32) and helpers
// Cloud-safe, stateless: callers should hold the RNG state object.

export type RNG = {
  seed: number
  next: () => number // returns float in [0,1)
}

// Hash a string seed to a 32-bit int
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0
  return {
    seed: a,
    next: () => {
      a |= 0
      a = (a + 0x6D2B79F5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
}

export function fromSeed(seed: string | number): RNG {
  const s = typeof seed === 'number' ? seed : hashSeed(seed)
  return mulberry32(s)
}

export function int(rng: RNG, min: number, max: number): number {
  // inclusive min, inclusive max
  const r = rng.next()
  return Math.floor(r * (max - min + 1)) + min
}

export function float(rng: RNG, min = 0, max = 1): number {
  return rng.next() * (max - min) + min
}

export function pickWeighted<T>(rng: RNG, items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, it) => s + it.weight, 0)
  let r = float(rng, 0, total)
  for (const it of items) {
    if (r < it.weight) return it.value
    r -= it.weight
  }
  // Fallback
  return items[items.length - 1]!.value
}

export function shuffle<T>(rng: RNG, arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(rng, 0, i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
