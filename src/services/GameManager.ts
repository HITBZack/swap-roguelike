import { fromSeed, pickWeighted, int } from '../lib/rng'
import { pickUniqueEventId } from './UniqueCatalog'
import type { RNG } from '../lib/rng'
import { createRun, fetchActiveRun, updateRunProgress, listRunItems, insertRunItems, replaceRunItems } from './RunPersistence'
import { listLoadout } from './Inventory'
import type { ItemInstance } from './items/types'

export type StageType = 'combat' | 'choice' | 'unique'
export type CombatType = 'single' | 'multi' | 'miniboss' | 'boss'

export type StagePlan = {
  biomeId: string
  index: number
  type: StageType
  combatType?: CombatType
  uniqueId?: string
  livesRemaining?: number
  blessedItemIds?: string[]
  attackMultiplier?: number
  maxHpMultiplier?: number
  bossesBlessed?: boolean
  statusReflect?: boolean
  /** If true, the next generated stage will be forced as a boss combat. */
  forceNextBoss?: boolean
}

export type RunDTO = {
  id: string
  seed: string
  biomeIndex: number
  stageIndex: number
  status: 'active' | 'completed' | 'failed'
  stagePlan: StagePlan
}

class GameManager {
  private rng: RNG | null = null
  private seed: string | null = null
  private biomes = ['meadow', 'crypt', 'desert', 'volcano']
  private biomeStageCounts: number[] = []
  private run: RunDTO | null = null
  private runItems: ItemInstance[] = []
  private suppressNextResume = false
  private runStartEpochMs: number | null = null
  private autoCombat = false
  private introMode = false
  // In-memory run metrics
  private enemiesKilledTotal = 0
  private minibossesDefeated = 0
  private bossesDefeated = 0
  private itemsGained = 0

  async startRun(seed?: string): Promise<RunDTO | null> {
    const s = seed || Date.now().toString(36)
    this.seed = s
    this.rng = fromSeed(s)
    this.biomeStageCounts = this.generateBiomeCounts(this.rng)
    const biomeIndex = 0
    const stageIndex = 0
    const stagePlan = this.generateStagePlan(biomeIndex, stageIndex, false)
    stagePlan.attackMultiplier = 1
    stagePlan.maxHpMultiplier = 1
    stagePlan.bossesBlessed = false
    stagePlan.statusReflect = false
    stagePlan.blessedItemIds = []
    stagePlan.livesRemaining = 3
    const rec = await createRun(s, biomeIndex, stageIndex, stagePlan)
    if (!rec) return null
    this.run = { id: rec.id, seed: s, biomeIndex, stageIndex, status: rec.status, stagePlan }
    // Snapshot equipped items into run_items
    const snapshot: ItemInstance[] = await listLoadout()
    await insertRunItems(rec.id, snapshot)
    this.runItems = snapshot
    this.runStartEpochMs = Date.now()
    // reset metrics for new run
    this.enemiesKilledTotal = 0
    this.minibossesDefeated = 0
    this.bossesDefeated = 0
    this.itemsGained = 0
    return this.run
  }

  async resumeRun(): Promise<RunDTO | null> {
    if (this.suppressNextResume) {
      this.suppressNextResume = false
      return null
    }
    if (this.run) return this.run
    const rec = await fetchActiveRun()
    if (!rec) return null
    this.seed = rec.seed
    this.rng = fromSeed(rec.seed)
    this.biomeStageCounts = this.generateBiomeCounts(this.rng)
    const stagePlan = rec.stage_plan as StagePlan
    if (!stagePlan.blessedItemIds) stagePlan.blessedItemIds = []
    this.run = { id: rec.id, seed: rec.seed, biomeIndex: rec.biome_index, stageIndex: rec.stage_index, status: rec.status, stagePlan }
    this.runItems = await listRunItems(rec.id)
    this.runStartEpochMs = Date.parse(rec.created_at)
    return this.run
  }

  async advance(): Promise<RunDTO | null> {
    if (!this.run || !this.rng) return null
    const prevPlan = this.run.stagePlan
    const prevLives = prevPlan.livesRemaining ?? 3
    const prevBlessed = prevPlan.blessedItemIds ?? []
    const prevAtkMult = prevPlan.attackMultiplier ?? 1
    const prevHpMult = prevPlan.maxHpMultiplier ?? 1
    const prevBossesBlessed = !!prevPlan.bossesBlessed
    const prevStatusReflect = !!prevPlan.statusReflect
    const prevForceNextBoss = !!prevPlan.forceNextBoss
    let biomeIndex = this.run.biomeIndex
    let stageIndex = this.run.stageIndex + 1
    const stagesInBiome = this.biomeStageCounts[biomeIndex]
    if (stageIndex >= stagesInBiome) {
      biomeIndex = (biomeIndex + 1) % this.biomes.length
      stageIndex = 0
      if (biomeIndex === 0) this.biomeStageCounts = this.generateBiomeCounts(this.rng)
    }
    const stagePlan = this.generateStagePlan(biomeIndex, stageIndex, prevForceNextBoss)
    stagePlan.livesRemaining = prevLives
    stagePlan.blessedItemIds = prevBlessed
    stagePlan.attackMultiplier = prevAtkMult
    stagePlan.maxHpMultiplier = prevHpMult
    stagePlan.bossesBlessed = prevBossesBlessed
    stagePlan.statusReflect = prevStatusReflect
    stagePlan.forceNextBoss = false
    const updated = await updateRunProgress(this.run.id, biomeIndex, stageIndex, stagePlan)
    if (!updated) return null
    this.run = { ...this.run, biomeIndex, stageIndex, stagePlan }
    return this.run
  }

  getCurrentStage(): StagePlan | null {
    return this.run?.stagePlan ?? null
  }

  getRun(): RunDTO | null {
    return this.run
  }

  getRunItems(): ItemInstance[] {
    return this.runItems
  }

  setRunItems(items: ItemInstance[]): void {
    this.runItems = items
  }

  // Blessed items API
  getBlessedItems(): string[] {
    return this.run?.stagePlan.blessedItemIds ?? []
  }

  isItemBlessed(id: string): boolean {
    const set = this.run?.stagePlan.blessedItemIds ?? []
    return set.includes(id)
  }

  addBlessedItem(id: string): void {
    if (!this.run) return
    const list = this.run.stagePlan.blessedItemIds ?? []
    if (!list.includes(id)) list.push(id)
    this.run.stagePlan.blessedItemIds = list
  }

  getEffectiveStacks(id: string, stacks: number): number {
    return this.isItemBlessed(id) ? (stacks * 2) : stacks
  }

  getEffectiveRunItems(): ItemInstance[] {
    const raw = this.getRunItems()
    return raw.map(it => ({ id: it.id, stacks: this.getEffectiveStacks(it.id, it.stacks ?? 1) }))
  }

  async persistRunItems(): Promise<boolean> {
    if (!this.run) return false
    return await replaceRunItems(this.run.id, this.runItems)
  }

  getLivesRemaining(): number {
    return this.run?.stagePlan.livesRemaining ?? 3
  }

  setLivesRemaining(v: number): void {
    if (!this.run) return
    this.run.stagePlan.livesRemaining = Math.max(0, v)
  }

  decrementLife(): number {
    const lives = this.getLivesRemaining()
    const next = Math.max(0, lives - 1)
    this.setLivesRemaining(next)
    return next
  }

  async persistStagePlan(): Promise<boolean> {
    if (!this.run) return false
    const updated = await updateRunProgress(this.run.id, this.run.biomeIndex, this.run.stageIndex, this.run.stagePlan)
    if (!updated) return false
    this.run = { ...this.run, stagePlan: this.run.stagePlan }
    return true
  }

  resetRun(): void {
    this.run = null
    this.runItems = []
    this.seed = null
    this.rng = null
    this.biomeStageCounts = []
    this.suppressNextResume = true
    this.runStartEpochMs = null
    this.enemiesKilledTotal = 0
    this.minibossesDefeated = 0
    this.bossesDefeated = 0
    this.itemsGained = 0
  }

  // Run metrics API
  addEnemiesKilled(n: number): void { this.enemiesKilledTotal = Math.max(0, this.enemiesKilledTotal + (n|0)) }
  incMinibossDefeated(): void { this.minibossesDefeated++ }
  incBossDefeated(): void { this.bossesDefeated++ }
  addItemsGained(n: number): void { this.itemsGained = Math.max(0, this.itemsGained + (n|0)) }
  getRunMetrics(): { enemiesKilled: number; minibosses: number; bosses: number; itemsGained: number } {
    return { enemiesKilled: this.enemiesKilledTotal, minibosses: this.minibossesDefeated, bosses: this.bossesDefeated, itemsGained: this.itemsGained }
  }

  getSeed(): string | null {
    return this.seed
  }

  getRunStartMs(): number | null { return this.runStartEpochMs }

  getDamageMultiplier(): number {
    return this.run?.stagePlan.attackMultiplier ?? 1
  }

  setDamageMultiplier(mult: number): void {
    if (!this.run) return
    this.run.stagePlan.attackMultiplier = Math.max(0, mult)
  }

  getMaxHpMultiplier(): number {
    return this.run?.stagePlan.maxHpMultiplier ?? 1
  }

  setMaxHpMultiplier(mult: number): void {
    if (!this.run) return
    this.run.stagePlan.maxHpMultiplier = Math.max(0, mult)
  }

  areGlobalBossesBlessed(): boolean {
    return !!this.run?.stagePlan.bossesBlessed
  }

  enableGlobalBlessedBosses(): void {
    if (!this.run) return
    this.run.stagePlan.bossesBlessed = true
  }

  hasStatusReflect(): boolean {
    return !!this.run?.stagePlan.statusReflect
  }

  enableStatusReflect(): void {
    if (!this.run) return
    this.run.stagePlan.statusReflect = true
  }

  getBiomeProgress(): { biomeIndex: number | null; stageIndex: number | null; totalStages: number | null } {
    if (!this.run) return { biomeIndex: null, stageIndex: null, totalStages: null }
    const total = this.biomeStageCounts[this.run.biomeIndex] ?? null
    return { biomeIndex: this.run.biomeIndex, stageIndex: this.run.stageIndex, totalStages: total }
  }

  /**
   * Cumulative count of fully completed biomes in the current run.
   * This increases without an upper bound and does not reset when biomeIndex wraps.
   */
  getBiomesCompleted(): number {
    if (!this.run || !this.biomeStageCounts.length) return 0
    const counts = this.biomeStageCounts
    const totalPerCycle = counts.reduce((acc, n) => acc + (n || 0), 0)
    if (totalPerCycle <= 0) return 0

    // Stages completed so far in this run across all biomes
    let completedStages = 0
    for (let i = 0; i < this.run.biomeIndex; i++) {
      completedStages += counts[i] ?? 0
    }
    completedStages += this.run.stageIndex

    const fullCycles = Math.floor(completedStages / totalPerCycle)
    let remainder = completedStages % totalPerCycle

    // Count completed biomes within the current cycle
    let biomesWithinCycle = 0
    for (let i = 0; i < counts.length; i++) {
      const span = counts[i] ?? 0
      if (span <= 0) continue
      if (remainder >= span) {
        biomesWithinCycle += 1
        remainder -= span
      } else {
        break
      }
    }

    return fullCycles * this.biomes.length + biomesWithinCycle
  }

  isAutoCombat(): boolean { return this.autoCombat }
  setAutoCombat(v: boolean): void { this.autoCombat = !!v }

  setIntroMode(v: boolean): void { this.introMode = !!v }

  private generateBiomeCounts(rng: RNG): number[] {
    const counts = this.biomes.map(() => int(rng, 5, 9))
    if (this.introMode && counts.length > 0) {
      counts[0] = 6
    }
    return counts
  }

  private generateStagePlan(biomeIndex: number, stageIndex: number, forceBoss: boolean): StagePlan {
    if (!this.rng) throw new Error('RNG not ready')
    const biomeId = this.biomes[biomeIndex % this.biomes.length]
    if (this.introMode && biomeIndex === 0) {
      const idx = Math.max(0, Math.min(5, stageIndex))
      if (idx === 0) return { biomeId, index: stageIndex, type: 'combat', combatType: 'single' }
      if (idx === 1) return { biomeId, index: stageIndex, type: 'combat', combatType: 'single' }
      if (idx === 2) return { biomeId, index: stageIndex, type: 'choice' }
      if (idx === 3) return { biomeId, index: stageIndex, type: 'combat', combatType: 'miniboss' }
      if (idx === 4) return { biomeId, index: stageIndex, type: 'unique', uniqueId: 'pedestal_duplicate' }
      if (idx === 5 || forceBoss) return { biomeId, index: stageIndex, type: 'combat', combatType: 'boss' }
    }
    // Gate unique stages: only appear once player is past the first biome
    const isFirstBiome = biomeIndex === 0
    let type: StageType
    let combatType: CombatType | undefined
    let uniqueId: string | undefined
    if (forceBoss) {
      type = 'combat'
      combatType = 'boss'
    } else {
      type = pickWeighted<StageType>(this.rng, isFirstBiome
        ? [
            { value: 'combat', weight: 0.75 },
            { value: 'choice', weight: 0.25 },
          ]
        : [
            { value: 'combat', weight: 0.71 },
            { value: 'choice', weight: 0.21 },
            { value: 'unique', weight: 0.08 },
          ])
      if (type === 'combat') {
        // In the very first biome, disallow boss combats from random generation; later biomes use full weights.
        const combatWeights: Array<{ value: CombatType; weight: number }> = isFirstBiome
          ? [
              { value: 'single', weight: 0.62 },
              { value: 'multi', weight: 0.26 },
              { value: 'miniboss', weight: 0.12 },
            ]
          : [
              { value: 'single', weight: 0.60 },
              { value: 'multi', weight: 0.26 },
              { value: 'miniboss', weight: 0.12 },
              { value: 'boss', weight: 0.02 },
            ]
        combatType = pickWeighted<CombatType>(this.rng, combatWeights)
      } else if (type === 'unique') {
        const picked = pickUniqueEventId(this.rng)
        uniqueId = picked ?? undefined
      }
    }
    return { biomeId, index: stageIndex, type, combatType, uniqueId }
  }
}

export const gameManager = new GameManager()
