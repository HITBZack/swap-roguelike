import type { EnemyDef } from '../services/enemies/registry'

type EnemyOverride = Partial<Pick<EnemyDef, 'biomes' | 'base' | 'tags' | 'displayName'>>

export const enemyOverrides: Record<string, EnemyOverride> = {
  // Bosses
  'obitus the brute': {
    biomes: ['meadow'],
    base: { hp: 45, atk: 6, def: 1, spd: 1 },
    tags: { isBoss: true, isMiniboss: false, isMulti: false, isBlessed: false }
  },

  // Mini-bosses
  'manling seer': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },
  'egg mother': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },
  'fallen hero': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },
  'oemyths': { tags: { isBoss: false, isMiniboss: true, isMulti: false, isBlessed: false } },

  // Multi-combat enemies
  'skeletons': { tags: { isBoss: false, isMiniboss: false, isMulti: true, isBlessed: false } },
  'gashers': { tags: { isBoss: false, isMiniboss: false, isMulti: true, isBlessed: false } }
}
