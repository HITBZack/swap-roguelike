import type { EnemyDef } from '../services/enemies/registry'

type EnemyOverride = Partial<Pick<EnemyDef, 'biomes' | 'base' | 'tags' | 'displayName'>>

export const enemyOverrides: Record<string, EnemyOverride> = {
  // Bosses
  'oemyths': { tags: { isBoss: true, isMiniboss: false, isMulti: false, isBlessed: false } },
  'obitus the brute': { tags: { isBoss: true, isMiniboss: false, isMulti: false, isBlessed: false } },

  // Mini-bosses
  'manling seer': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },
  'egg mother': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },
  'fallen hero': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },

  // Multi-combat enemies
  'skeletons': { tags: { isBoss: false, isMiniboss: false, isMulti: true, isBlessed: false } },
  'gashers': { tags: { isBoss: false, isMiniboss: false, isMulti: true, isBlessed: false } }
}
