import type { RNG } from '../lib/rng'

export type UniqueEventDef = {
  id: string
  weight: number
  showChance: number
}

export const UNIQUE_EVENTS: UniqueEventDef[] = [
  { id: 'pedestal_duplicate', weight: 1, showChance: 1 },
  { id: 'other_place', weight: 3, showChance: 0.7 }
]

export function pickUniqueEventId(rng: RNG): string | null {
  if (!UNIQUE_EVENTS.length) return null
  const totalWeight = UNIQUE_EVENTS.reduce((acc, ev) => acc + Math.max(0, ev.weight || 0), 0)
  if (totalWeight <= 0) return null
  let r = rng.next() * totalWeight
  for (const ev of UNIQUE_EVENTS) {
    const w = Math.max(0, ev.weight || 0)
    if (w <= 0) continue
    if (r <= w) {
      if (ev.showChance >= 1) return ev.id
      const roll = rng.next()
      return roll <= ev.showChance ? ev.id : null
    }
    r -= w
  }
  const last = UNIQUE_EVENTS[UNIQUE_EVENTS.length - 1]
  if (!last) return null
  if (last.showChance >= 1) return last.id
  const roll = rng.next()
  return roll <= last.showChance ? last.id : null
}
