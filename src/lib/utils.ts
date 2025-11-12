/**
 * Utils: RNG, seeding helpers.
 * NOTE: Avoid extra deps now. Replace with seedrandom later as per PRD.
 */

export function rng(seed?: string): () => number {
  // TODO: implement a deterministic RNG using seed; placeholder uses Math.random
  if (!seed) return Math.random
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0
  return () => {
    // xorshift32-ish simple PRNG; not cryptographically secure
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}
