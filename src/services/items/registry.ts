import type { ItemDefinition, ItemRegistryMap, BattleContext, ActorState } from './types'

// Example items
const luckyClover: ItemDefinition = {
  id: 'lucky_clover',
  name: 'Lucky Clover',
  description: 'Slightly increases crit and hit chance. Stacks additively.',
  rarity: 'common',
  imageKey: 'lucky-clover',
  onComputeHitChance(_ctx, _attacker, _defender) {
    return { addCritChance: 0.01, addHitChance: 0.01 }
  },
  onLootDrop() { return { quantityMult: 1.02 } }
}

const aptomycridPincers: ItemDefinition = {
  id: 'aptomycrid-pincers',
  name: 'Aptomycrid Pincers',
  description: 'Small chance to burn enemy on hit; burn amplifies DoT.',
  rarity: 'uncommon',
  imageKey: 'aptomycrid-pincers',
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

const anathemumPlate: ItemDefinition = {
  id: 'anathemum-plate',
  name: 'Anathemum Plate',
  description: 'Slightly increases block chance, and reduces damage taken.',
  rarity: 'uncommon',
  imageKey: 'anathemum-plate',
  onComputeHitChance() { return { addBlockChance: 0.02 } },
  onReceiveDamage(_ctx, defender, _attacker, amount) {
    // Passive reduction 3 flat
    defender.hp = Math.max(0, defender.hp - Math.max(0, amount - 3))
  }
}

const flayingWhip: ItemDefinition = {
  id: 'flaying_whip',
  name: 'Flaying Whip',
  description: 'Applies bleed on hit; heal a little on kill.',
  rarity: 'rare',
  imageKey: 'flaying-whip',
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

const gasherTooth: ItemDefinition = {
  id: 'gasher-tooth',
  name: 'Gasher Tooth',
  description: 'Increases damage slightly; higher crit damage.',
  rarity: 'uncommon',
  imageKey: 'gasher-tooth',
  onComputeDamage() { return { multDamage: 1.06 } }
}

const godbornBooties: ItemDefinition = {
  id: 'godborn-booties',
  name: 'Godborn Booties',
  description: 'Move like the wind. Slightly increases dodge and speed.',
  rarity: 'rare',
  imageKey: 'godborn-booties',
  onComputeHitChance() { return { addDodgeChance: 0.02 } },
  onComputeDamage() { return { multDamage: 1.03 } }
}

const godbornHelm: ItemDefinition = {
  id: 'godborn-helm',
  name: 'Godborn Helm',
  description: 'Protects the bearer. Slightly increases block and max HP.',
  rarity: 'rare',
  imageKey: 'godborn-helm',
  onComputeHitChance() { return { addBlockChance: 0.02 } },
  onReceiveDamage(_ctx, defender, _attacker, amount) { defender.hp = Math.max(0, defender.hp - Math.max(0, amount - 2)) }
}

const godbornTunic: ItemDefinition = {
  id: 'godborn-tunic',
  name: 'Godborn Tunic',
  description: 'Blessed mail. Reduces damage taken moderately.',
  rarity: 'epic',
  imageKey: 'godborn-tunic',
  onReceiveDamage(_ctx, defender, _attacker, amount) { defender.hp = Math.max(0, defender.hp - Math.max(0, amount - 4)) }
}

const manlingEar: ItemDefinition = {
  id: 'manling-ear',
  name: 'Manling Ear',
  description: 'A grim token. Slightly increases crit chance.',
  rarity: 'common',
  imageKey: 'manling-ear',
  onComputeHitChance() { return { addCritChance: 0.02 } }
}

const mesmericShroud: ItemDefinition = {
  id: 'mesmeric-shroud',
  name: 'Mesmeric Shroud',
  description: 'A hypnotic veil. Enemies are slightly less accurate.',
  rarity: 'rare',
  imageKey: 'mesmeric-shroud',
  onComputeHitChance() { return { addDodgeChance: 0.02 } }
}

const ringOfMar: ItemDefinition = {
  id: 'ring-of-mar',
  name: 'Ring of Mar',
  description: 'Increases lifesteal slightly.',
  rarity: 'uncommon',
  imageKey: 'ring-of-mar',
  onAfterHit(_ctx, attacker, _defender, dealt) { if (attacker.kind === 'player') attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.max(0, Math.floor(dealt * 0.05))) }
}

const ringOfPower: ItemDefinition = {
  id: 'ring-of-power',
  name: 'Ring of Power',
  description: 'Moderately increases damage.',
  rarity: 'rare',
  imageKey: 'ring-of-power',
  onComputeDamage() { return { multDamage: 1.12 } }
}

const ringOfSpeed: ItemDefinition = {
  id: 'ring-of-speed',
  name: 'Ring of Speed',
  description: 'Slightly increases action speed.',
  rarity: 'uncommon',
  imageKey: 'ring-of-speed',
  onComputeDamage() { return { multDamage: 1.05 } }
}

export const itemRegistry: ItemRegistryMap = new Map([
  [luckyClover.id, luckyClover],
  [aptomycridPincers.id, aptomycridPincers],
  [anathemumPlate.id, anathemumPlate],
  [flayingWhip.id, flayingWhip],
  [gasherTooth.id, gasherTooth],
  [godbornBooties.id, godbornBooties],
  [godbornHelm.id, godbornHelm],
  [godbornTunic.id, godbornTunic],
  [manlingEar.id, manlingEar],
  [mesmericShroud.id, mesmericShroud],
  [ringOfMar.id, ringOfMar],
  [ringOfPower.id, ringOfPower],
  [ringOfSpeed.id, ringOfSpeed]
])
