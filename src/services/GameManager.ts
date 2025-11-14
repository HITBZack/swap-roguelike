import { fromSeed, pickWeighted, int } from '../lib/rng'
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
  livesRemaining?: number
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
    const stagePlan = this.generateStagePlan(biomeIndex, stageIndex)
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
    this.run = { id: rec.id, seed: rec.seed, biomeIndex: rec.biome_index, stageIndex: rec.stage_index, status: rec.status, stagePlan }
    this.runItems = await listRunItems(rec.id)
    this.runStartEpochMs = Date.parse(rec.created_at)
    return this.run
  }

  async advance(): Promise<RunDTO | null> {
    if (!this.run || !this.rng) return null
    let biomeIndex = this.run.biomeIndex
    let stageIndex = this.run.stageIndex + 1
    const stagesInBiome = this.biomeStageCounts[biomeIndex]
    if (stageIndex >= stagesInBiome) {
      biomeIndex = (biomeIndex + 1) % this.biomes.length
      stageIndex = 0
      if (biomeIndex === 0) this.biomeStageCounts = this.generateBiomeCounts(this.rng)
    }
    const stagePlan = this.generateStagePlan(biomeIndex, stageIndex)
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

  getBiomeProgress(): { biomeIndex: number | null; stageIndex: number | null; totalStages: number | null } {
    if (!this.run) return { biomeIndex: null, stageIndex: null, totalStages: null }
    const total = this.biomeStageCounts[this.run.biomeIndex] ?? null
    return { biomeIndex: this.run.biomeIndex, stageIndex: this.run.stageIndex, totalStages: total }
  }

  isAutoCombat(): boolean { return this.autoCombat }
  setAutoCombat(v: boolean): void { this.autoCombat = !!v }

  private generateBiomeCounts(rng: RNG): number[] {
    return this.biomes.map(() => int(rng, 5, 9))
  }

  private generateStagePlan(biomeIndex: number, stageIndex: number): StagePlan {
    if (!this.rng) throw new Error('RNG not ready')
    const biomeId = this.biomes[biomeIndex % this.biomes.length]
    const type = pickWeighted<StageType>(this.rng, [
      { value: 'combat', weight: 0.65 },
      { value: 'choice', weight: 0.25 },
      { value: 'unique', weight: 0.10 }
    ])
    let combatType: CombatType | undefined
    if (type === 'combat') {
      combatType = pickWeighted<CombatType>(this.rng, [
        { value: 'single', weight: 0.6 },
        { value: 'multi', weight: 0.25 },
        { value: 'miniboss', weight: 0.1 },
        { value: 'boss', weight: 0.05 }
      ])
    }
    return { biomeId, index: stageIndex, type, combatType }
  }
}

export const gameManager = new GameManager()
