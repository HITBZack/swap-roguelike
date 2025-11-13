import { fromSeed, int, pickWeighted } from '../lib/rng'
import type { ItemInstance } from './items/types'
import { choiceMetaById } from './ChoicesContent'

export type ChoiceOutcome = {
  log: string[]
  updatedRunItems?: ItemInstance[]
  triggerMiniboss?: boolean
  enemiesKilled?: number
  poorDelta?: number
}

export type ChoiceOption = {
  id: string
  title: string
  description: string
  tags: string[]
  linkedGroups?: string[]
  resolve: (seed: string, stageNumber: number, runItems: ItemInstance[]) => Promise<ChoiceOutcome>
}

function cloneRunItems(items: ItemInstance[]): ItemInstance[] {
  return items.map(i => ({ ...i }))
}

const baseChoices: ChoiceOption[] = [
  {
    id: 'beggar_fairy_twist',
    title: 'A beggar asks for one random item',
    description: 'Give 1 random item from your run',
    tags: ['risk', 'event', 'items'],
    resolve: async (seed, stageNumber, runItems) => {
      const rng = fromSeed(`${seed}|choice|${stageNumber}|beggar`)
      const items = cloneRunItems(runItems)
      const log: string[] = []
      if (items.length === 0) {
        log.push('You have no items to give. The beggar leaves.')
        return { log, updatedRunItems: items, poorDelta: 0 }
      }
      const idx = int(rng, 0, items.length - 1)
      const chosen = items[idx]
      log.push(`You hand over a ${chosen.id}.`)
      const lucky = rng.next() < 0.5
      if (lucky) {
        log.push("As it turns out, it was a fairy's gift! The beggar duplicates it for you.")
        items.push({ id: chosen.id, stacks: 1 })
        return { log, updatedRunItems: items, poorDelta: 0 }
      } else {
        log.push('The beggar walks away happy. You lose the item.')
        // remove one stack of the chosen item
        chosen.stacks -= 1
        if (chosen.stacks <= 0) items.splice(idx, 1)
        return { log, updatedRunItems: items, poorDelta: 1 }
      }
    }
  },
  {
    id: 'd20_roll',
    title: 'Roll a mysterious d20',
    description: 'You find a 20-sided die on the ground. Roll it.',
    tags: ['random', 'event'],
    resolve: async (seed, stageNumber, runItems) => {
      const rng = fromSeed(`${seed}|choice|${stageNumber}|d20`)
      const items = cloneRunItems(runItems)
      const roll = int(rng, 1, 20)
      const log: string[] = [`You roll the d20... (${roll})`]
      let poorDelta = 0
      if (roll <= 3) {
        log.push('Unlucky! Nothing good happens, and you feel a sense of dread.')
        poorDelta = 1
      } else if (roll <= 10) {
        log.push('Nothing happens.')
      } else if (roll <= 17) {
        // grant a modest boon
        const grant = pickWeighted(rng, [
          { value: 'fire_pendant', weight: 1 },
          { value: 'steel_shield', weight: 1 },
          { value: 'blood_dagger', weight: 1 }
        ])
        items.push({ id: grant, stacks: 1 })
        log.push(`You feel fortunate. You gain a ${grant}.`)
      } else {
        items.push({ id: 'lucky_clover', stacks: 1 })
        log.push('Critical success! You gain a lucky_clover.')
      }
      return { log, updatedRunItems: items, poorDelta }
    }
  },
  {
    id: 'strange_cave',
    title: 'A strange cave entrance beckons',
    description: 'Enter the cave? It feels dangerous...',
    tags: ['combat', 'miniboss', 'event'],
    linkedGroups: ['danger'],
    resolve: async (_seed, _stageNumber, runItems) => {
      const log: string[] = []
      log.push('You step into the cave... A mini-boss emerges!')
      return { log, updatedRunItems: cloneRunItems(runItems), triggerMiniboss: true }
    }
  }
]

// Merge markdown metadata if present
export const choiceRegistry: ChoiceOption[] = baseChoices.map(c => {
  const meta = choiceMetaById.get(c.id)
  if (!meta) return c
  return { ...c, title: meta.title || c.title, description: meta.description || c.description, tags: meta.tags.length ? meta.tags : c.tags, linkedGroups: meta.linkedGroups.length ? meta.linkedGroups : c.linkedGroups }
})

export function pickChoiceOptions(seed: string, stageNumber: number, count = 3): ChoiceOption[] {
  const rng = fromSeed(`${seed}|choice|${stageNumber}`)
  const pool = [...choiceRegistry]
  const picked: ChoiceOption[] = []
  if (pool.length === 0) return picked
  // First pick: uniform
  let idx = int(rng, 0, pool.length - 1)
  const first = pool.splice(idx, 1)[0]
  picked.push(first)
  // Next picks: bias toward shared tags or linked groups with first
  const tags = new Set(first.tags)
  const groups = new Set(first.linkedGroups ?? [])
  while (picked.length < count && pool.length > 0) {
    const preferred = pool.filter(opt => opt.tags.some(t => tags.has(t)) || (opt.linkedGroups ?? []).some(g => groups.has(g)))
    const bucket = preferred.length > 0 ? preferred : pool
    idx = int(rng, 0, bucket.length - 1)
    const choice = bucket[idx]
    // remove from pool
    const remIdx = pool.findIndex(o => o.id === choice.id)
    if (remIdx >= 0) pool.splice(remIdx, 1)
    picked.push(choice)
  }
  return picked
}
