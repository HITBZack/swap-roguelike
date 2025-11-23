import { fromSeed, int } from '../lib/rng'
import { itemRegistry } from './items/registry'
import type { ItemInstance } from './items/types'
import { choiceMetaById } from './ChoicesContent'

export type ChoiceOutcome = {
  log: string[]
  updatedRunItems?: ItemInstance[]
  triggerMiniboss?: boolean
  /** Request that the next stage be forced as a boss combat. */
  triggerBoss?: boolean
  enemiesKilled?: number
  poorDelta?: number
  /** Optional hint for how to reward a triggered miniboss, e.g. common-rare item on win. */
  minibossRewardBand?: 'common_rare'
}

function pickRandomFromArray<T>(rng: ReturnType<typeof fromSeed> | { next: () => number }, arr: T[]): T {
  const idx = int(rng as any, 0, Math.max(0, arr.length - 1))
  return arr[idx]
}

function pickRandomRegistryItemId(rng: ReturnType<typeof fromSeed> | { next: () => number }, count = 1): string | string[] {
  const ids = Array.from(itemRegistry.keys())
  if (ids.length === 0) return count === 1 ? 'lucky_clover' : []
  if (count === 1) return pickRandomFromArray(rng, ids)
  const picked: string[] = []
  for (let i = 0; i < count; i++) picked.push(pickRandomFromArray(rng, ids))
  return picked
}

function pickRandomRegistryItemIdByRarity(
  rng: ReturnType<typeof fromSeed> | { next: () => number },
  allowed: Set<string>,
  count = 1
): string | string[] {
  const filtered = Array.from(itemRegistry.values())
    .filter(def => allowed.has(def.rarity))
    .map(def => def.id)
  const pool = filtered.length > 0 ? filtered : Array.from(itemRegistry.keys())
  if (pool.length === 0) return count === 1 ? 'lucky_clover' : []
  if (count === 1) return pickRandomFromArray(rng, pool)
  const picked: string[] = []
  for (let i = 0; i < count; i++) picked.push(pickRandomFromArray(rng, pool))
  return picked
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
    id: 'gnome_boss_lair',
    title: 'A wild gnome tells you of a boss lair',
    description: 'Join him to seek out a guaranteed boss encounter ahead.',
    tags: ['combat', 'boss', 'event'],
    linkedGroups: ['danger'],
    resolve: async (_seed, _stageNumber, runItems) => {
      const log: string[] = []
      log.push('A wild gnome appears, tugging at your sleeve excitedly.')
      log.push('He whispers of a hidden boss lair deep ahead in these biomes.')
      log.push('You agree to follow the gnome. A boss encounter now awaits you soon.')
      return { log, updatedRunItems: cloneRunItems(runItems), triggerBoss: true }
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
        const grant = pickRandomRegistryItemId(rng) as string
        items.push({ id: grant, stacks: 1 })
        log.push(`You feel fortunate. You gain a ${grant}.`)
      } else {
        const grant = pickRandomRegistryItemId(rng) as string
        items.push({ id: grant, stacks: 1 })
        log.push(`Critical success! You gain a ${grant}.`)
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
      log.push('You step into the cave... You feel a powerful presence watching you from the dark.')
      log.push('Rumors say that defeating what lives here can grant rare treasures.')
      log.push('A challenging mini-boss now awaits you soon...')
      return { log, updatedRunItems: cloneRunItems(runItems), triggerMiniboss: true, minibossRewardBand: 'common_rare' }
    }
  },
  {
    id: 'wandering_merchant',
    title: 'A wandering merchant offers a trade',
    description: 'Trade one random item for a mystery item? Could be better, could be worse.',
    tags: ['event', 'items', 'risk'],
    resolve: async (seed, stageNumber, runItems) => {
      const rng = fromSeed(`${seed}|choice|${stageNumber}|merchant`)
      const items = cloneRunItems(runItems)
      const log: string[] = []
      if (items.length === 0) {
        log.push('You have nothing to trade. The merchant shrugs and leaves.')
        return { log, updatedRunItems: items, poorDelta: 0 }
      }
      const giveIdx = int(rng, 0, items.length - 1)
      const given = items[giveIdx]
      given.stacks -= 1
      if (given.stacks <= 0) items.splice(giveIdx, 1)
      log.push(`You hand over a ${given.id}.`)
      const reward = pickRandomRegistryItemIdByRarity(rng, new Set(['rare', 'epic', 'legendary', 'unique'])) as string
      items.push({ id: reward, stacks: 1 })
      log.push(`The merchant gives you a ${reward}.`)
      return { log, updatedRunItems: items, poorDelta: 0 }
    }
  },
  {
    id: 'ancient_shrine',
    title: 'An ancient shrine hums with energy',
    description: 'Offer an item to the shrine to receive a blessing (or a curse).',
    tags: ['event', 'risk'],
    resolve: async (seed, stageNumber, runItems) => {
      const rng = fromSeed(`${seed}|choice|${stageNumber}|shrine`)
      const items = cloneRunItems(runItems)
      const log: string[] = []
      if (items.length === 0) {
        log.push('You have nothing to offer. The shrine grows quiet.')
        return { log, updatedRunItems: items, poorDelta: 0 }
      }
      const idx = int(rng, 0, items.length - 1)
      const offered = items[idx]
      offered.stacks -= 1
      if (offered.stacks <= 0) items.splice(idx, 1)
      log.push(`You leave a ${offered.id} at the shrine.`)
      if (rng.next() < 0.6) {
        items.push({ id: 'lucky_clover', stacks: 1 })
        log.push('A warm light surrounds you. You gained a lucky_clover!')
        return { log, updatedRunItems: items, poorDelta: 0 }
      } else {
        log.push('The air turns cold. Nothing happens...')
        return { log, updatedRunItems: items, poorDelta: 1 }
      }
    }
  },
  {
    id: 'hidden_cache',
    title: 'You spot a hidden cache',
    description: 'Pry it open and claim the contents.',
    tags: ['reward', 'items'],
    resolve: async (seed, stageNumber, runItems) => {
      const rng = fromSeed(`${seed}|choice|${stageNumber}|cache`)
      const items = cloneRunItems(runItems)
      const log: string[] = []
      const n = int(rng, 1, 3)
      const raw = pickRandomRegistryItemId(rng, n)
      const picks = Array.isArray(raw) ? raw : [raw]
      for (const pid of picks) items.push({ id: pid, stacks: 1 })
      log.push(`You open the cache and find ${n} item(s).`)
      return { log, updatedRunItems: items, poorDelta: 0 }
    }
  },
  {
    id: 'challenge_bell',
    title: 'Ring the challenge bell',
    description: 'Summon a foe for better spoils.',
    tags: ['combat', 'miniboss'],
    linkedGroups: ['danger'],
    resolve: async (_seed, _stageNumber, runItems) => {
      const log: string[] = ['You ring the bell. A challenge approaches!']
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

export function pickChoiceOptions(seed: string, stageNumber: number, opts?: { biomeIndex?: number; count?: number }): ChoiceOption[] {
  const rng = fromSeed(`${seed}|choice|${stageNumber}`)
  const pool = [...choiceRegistry]
  const picked: ChoiceOption[] = []
  if (pool.length === 0) return picked
  // Roll how many options to show (2 or 3)
  const target = opts?.count ?? int(rng, 2, 3)

  // Rare gnome boss-lair option (~5% chance per choice stage), only after the first two biomes
  const gnomeIdx = pool.findIndex(o => o.id === 'gnome_boss_lair')
  const biomeIndex = typeof opts?.biomeIndex === 'number' ? opts.biomeIndex : 0
  if (gnomeIdx >= 0) {
    if (biomeIndex >= 2) {
      const roll = rng.next()
      if (roll < 0.05) {
        const gnome = pool.splice(gnomeIdx, 1)[0]
        picked.push(gnome)
      } else {
        // Even on a miss, remove from pool so it cannot appear as a normal choice
        pool.splice(gnomeIdx, 1)
      }
    } else {
      // Before biome 2, remove from pool entirely so it can never appear
      pool.splice(gnomeIdx, 1)
    }
  }

  // First pick: ensure we have an anchor option for tag biasing
  let first: ChoiceOption
  if (picked.length === 0) {
    const idx = int(rng, 0, pool.length - 1)
    first = pool.splice(idx, 1)[0]
    picked.push(first)
  } else {
    first = picked[0]
  }

  // Next picks: bias toward shared tags or linked groups with first
  const tags = new Set(first.tags)
  const groups = new Set(first.linkedGroups ?? [])
  while (picked.length < target && pool.length > 0) {
    const preferred = pool.filter(opt => opt.tags.some(t => tags.has(t)) || (opt.linkedGroups ?? []).some(g => groups.has(g)))
    const bucket = preferred.length > 0 ? preferred : pool
    const idx = int(rng, 0, bucket.length - 1)
    const choice = bucket[idx]
    // remove from pool
    const remIdx = pool.findIndex(o => o.id === choice.id)
    if (remIdx >= 0) pool.splice(remIdx, 1)
    picked.push(choice)
  }
  return picked
}
