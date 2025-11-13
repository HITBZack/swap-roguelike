import type { ItemDefinition, ItemRegistryMap, BattleContext, ActorState } from './types'

// Example items
const luckyClover: ItemDefinition = {
  id: 'lucky_clover',
  name: 'Lucky Clover',
  description: 'Slightly increases crit and hit chance. Stacks additively.',
  rarity: 'common',
  onComputeHitChance(_ctx, _attacker, _defender) {
    return { addCritChance: 0.01, addHitChance: 0.01 }
  },
  onLootDrop() { return { quantityMult: 1.02 } }
}

const firePendant: ItemDefinition = {
  id: 'fire_pendant',
  name: 'Fire Pendant',
  description: 'Small chance to burn enemy on hit; burn amplifies DoT.',
  rarity: 'uncommon',
  onAfterHit(ctx: BattleContext, _attacker: ActorState, defender: ActorState) {
    // 10% to apply burn 1 stack
    if (ctx.rng.next() < 0.10) {
      defender.statuses.burn = (defender.statuses.burn ?? 0) + 1
      this.onApplyStatus?.(ctx, defender, 'burn', 1)
    }
  },
  onComputeDamage() {
    return { dotAmplify: 1.05 }
  }
}

const steelShield: ItemDefinition = {
  id: 'steel_shield',
  name: 'Steel Shield',
  description: 'Slightly increases block chance, and reduces damage taken.',
  rarity: 'uncommon',
  onComputeHitChance() { return { addBlockChance: 0.02 } },
  onReceiveDamage(_ctx, defender, _attacker, amount) {
    // Passive reduction 3 flat
    defender.hp = Math.max(0, defender.hp - Math.max(0, amount - 3))
  }
}

const bloodDagger: ItemDefinition = {
  id: 'blood_dagger',
  name: 'Blood Dagger',
  description: 'Applies bleed on hit; heal a little on kill.',
  rarity: 'rare',
  onAfterHit(ctx, _attacker, defender, _dealt) {
    defender.statuses.bleed = (defender.statuses.bleed ?? 0) + 1
    this.onApplyStatus?.(ctx, defender, 'bleed', 1)
  },
  onAfterKill(_ctx, killer, _victim) {
    if (killer.kind === 'player') {
      killer.hp = Math.min(killer.maxHp, killer.hp + 2)
    }
  }
}

export const itemRegistry: ItemRegistryMap = new Map([
  [luckyClover.id, luckyClover],
  [firePendant.id, firePendant],
  [steelShield.id, steelShield],
  [bloodDagger.id, bloodDagger]
])
