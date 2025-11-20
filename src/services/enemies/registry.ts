import type { CombatType } from '../GameManager'
import { enemyOverrides } from '../../data/enemies.overrides'

export type EnemyDef = {
  id: string
  displayName: string
  imageKey: string
  biomes: string[]
  base: { hp: number; atk: number; def: number; spd: number }
  tags: { isBoss: boolean; isMiniboss: boolean; isMulti: boolean; isBlessed: boolean }
}

const BIOMES = ['meadow', 'crypt', 'desert', 'volcano']

function toTitleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function hash32(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function deriveBaseStats(id: string): { hp: number; atk: number; def: number; spd: number } {
  const h = hash32(id)
  const hp = 30 + (h % 41) // 30-70
  const atk = 4 + ((h >>> 8) % 7) // 4-10
  const def = 1 + ((h >>> 16) % 5) // 1-5
  const spd = 1 + ((h >>> 24) % 3) // 1-3
  return { hp, atk, def, spd }
}

function assignBiomes(id: string): string[] {
  const h = hash32(id)
  const count = 1 + (h % 2) // 1-2 biomes per enemy for variety
  const start = (h >>> 8) % BIOMES.length
  const picks = new Set<string>()
  for (let i = 0; picks.size < count; i++) picks.add(BIOMES[(start + i) % BIOMES.length])
  return Array.from(picks)
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const enemyUrls = import.meta.glob('../../assets/enemies/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const defs: EnemyDef[] = []
Object.keys(enemyUrls).forEach((path) => {
  const fname = path.split('/').pop() as string
  const base = fname.replace(/\.png$/i, '')
  if (base.toLowerCase() === 'empty') return
  const beforeDash = base.split('-')[0]
  const id = beforeDash.replace(/_/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase()
  const imageKey = `enemy:${base.toLowerCase()}`
  const displayName = toTitleCase(id)
  const baseStats = deriveBaseStats(id)
  const biomes = assignBiomes(id)
  // Default tags: rely on explicit overrides for boss/miniboss/multi classification.
  const tags = { isBoss: false, isMiniboss: false, isMulti: false, isBlessed: false }
  const baseDef: EnemyDef = { id, displayName, imageKey, biomes, base: baseStats, tags }
  const ov = enemyOverrides[id]
  if (ov) {
    if (ov.displayName) baseDef.displayName = ov.displayName
    if (ov.biomes) baseDef.biomes = ov.biomes
    if (ov.base) baseDef.base = ov.base
    if (ov.tags) baseDef.tags = { ...baseDef.tags, ...ov.tags }
  }
  defs.push(baseDef)
})

export function getEnemyDefs(): EnemyDef[] { return defs }

export function getEnemiesFor(biomeId: string, combatType: CombatType): EnemyDef[] {
  const pool = defs.filter(d => d.biomes.includes(biomeId) && !d.tags.isBlessed)
  if (combatType === 'miniboss') return pool.filter(d => d.tags.isMiniboss)
  if (combatType === 'boss') return pool.filter(d => d.tags.isBoss)
  if (combatType === 'multi') return pool.filter(d => d.tags.isMulti)
  return pool.filter(d => !d.tags.isBoss && !d.tags.isMiniboss && !d.tags.isMulti)
}

export function pickDeterministicIndex(seed: string, stageNumber: number, n: number): number {
  let h = 2166136261 >>> 0
  const str = `${seed}|${stageNumber}`
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return n > 0 ? (h >>> 0) % n : 0
}
