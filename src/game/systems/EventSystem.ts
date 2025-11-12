/**
 * EventSystem
 * Responsible for procedural stage generation using seeded RNG.
 */

export type StageType = 'combat' | 'merchant' | 'chest' | 'choice' | 'boss'

export interface StageNode {
  id: string
  index: number
  type: StageType
}

export interface RunPlan {
  seed: string
  stages: StageNode[]
}

export class EventSystem {
  /**
   * Generate a basic plan for a run using a simple RNG.
   * TODO: Replace with deterministic seeded RNG once utils is upgraded.
   */
  generate(seed: string, length = 10): RunPlan {
    const stages: StageNode[] = []
    for (let i = 0; i < length; i++) {
      const r = Math.random()
      const type: StageType = r < 0.6 ? 'combat' : r < 0.7 ? 'merchant' : r < 0.85 ? 'chest' : r < 0.95 ? 'choice' : 'boss'
      stages.push({ id: `${seed}-${i}`, index: i, type })
    }
    return { seed, stages }
  }
}
