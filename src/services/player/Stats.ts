import type { ItemInstance, StatKey } from '../items/types'
import { itemRegistry } from '../items/registry'

export type PlayerBaseStats = {
  maxHp: number
  damage: number
  accuracy: number // 0..1
  dodge: number // 0..1
  projectileCount: number
  shield: number
  lifestealPct: number // 0..1
  dotDmgPct: number // 0..1 multiplier to DoTs
}

export type PlayerEffectiveStats = PlayerBaseStats

export function computeBaseStats(level: number): PlayerBaseStats {
  const lvl = Math.max(1, level | 0)
  // Simple scalable curves; tweak freely later
  return {
    maxHp: 30 + Math.floor(lvl * 4.5),
    damage: 6 + Math.floor(lvl * 0.8),
    accuracy: Math.min(0.95, 0.8 + lvl * 0.002),
    dodge: Math.min(0.35, 0.04 + lvl * 0.0015),
    projectileCount: 1 + Math.floor(lvl / 25),
    shield: Math.floor(lvl / 15),
    lifestealPct: Math.min(0.25, 0.02 + lvl * 0.0005),
    dotDmgPct: 1.0 + Math.min(0.75, lvl * 0.003)
  }
}

// Placeholder: later, items can contribute additive/multiplicative modifiers per stat.
// For now, we treat items via battle engine hooks, and keep this as identity.
export function applyItemModifiers(base: PlayerBaseStats, items: ItemInstance[]): PlayerEffectiveStats {
  const out: PlayerBaseStats = { ...base }
  // Aggregate multiplicative modifiers per stat (start at 1)
  const multAcc: Partial<Record<StatKey, number>> = {}
  const addAcc: Partial<Record<StatKey, number>> = {}
  const keys: StatKey[] = ['maxHp','damage','accuracy','dodge','projectileCount','shield','lifestealPct','dotDmgPct']
  for (const k of keys) { multAcc[k] = 1; addAcc[k] = 0 }

  for (const it of items) {
    const stacks = Math.max(0, it.stacks ?? 0)
    if (stacks <= 0) continue
    const def = itemRegistry.get(it.id)
    const mods = def?.statModifiers
    if (!mods) continue
    if (mods.add) {
      for (const k of Object.keys(mods.add) as StatKey[]) {
        addAcc[k]! += (mods.add[k] ?? 0) * stacks
      }
    }
    if (mods.mult) {
      for (const k of Object.keys(mods.mult) as StatKey[]) {
        const m = mods.mult[k] ?? 1
        multAcc[k]! *= Math.pow(m, stacks)
      }
    }
  }

  // Apply adds then mults
  for (const k of keys) {
    const key = k as keyof PlayerBaseStats
    const add = (addAcc[k] ?? 0) as number
    const mult = (multAcc[k] ?? 1) as number
    out[key] = ((out[key] as number) + add) as never
    out[key] = ((out[key] as number) * mult) as never
  }

  // Clamp where appropriate
  out.accuracy = Math.max(0, Math.min(0.99, out.accuracy))
  out.dodge = Math.max(0, Math.min(0.75, out.dodge))
  out.lifestealPct = Math.max(0, Math.min(0.9, out.lifestealPct))
  out.dotDmgPct = Math.max(0, out.dotDmgPct)
  out.maxHp = Math.max(1, Math.floor(out.maxHp))
  out.damage = Math.max(1, Math.floor(out.damage))
  out.projectileCount = Math.max(1, Math.floor(out.projectileCount))
  out.shield = Math.max(0, Math.floor(out.shield))
  return out
}

export function buildEffectiveStats(level: number, items: ItemInstance[]): PlayerEffectiveStats {
  const base = computeBaseStats(level)
  return applyItemModifiers(base, items)
}
