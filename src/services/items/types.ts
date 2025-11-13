// Item system core types and hook interfaces
// Infinite stacks supported by design (use stacks: number)

import type { RNG } from '../../lib/rng'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type ItemId = string

export type StatusId = 'burn' | 'poison' | 'bleed' | 'freeze' | 'stun' | 'shield'

export type BattleOutcome = 'ongoing' | 'win' | 'loss'

export type ActorKind = 'player' | 'enemy'

export interface ActorState {
  kind: ActorKind
  hp: number
  maxHp: number
  atk: number
  def: number
  critChance: number // 0..1
  critMult: number // e.g., 1.5 means +50%
  dodgeChance: number // 0..1
  blockChance: number // 0..1
  statuses: Partial<Record<StatusId, number>> // intensity/stacks
}

export interface BattleContext {
  rng: RNG
  player: ActorState
  enemies: ActorState[]
  time: number // tick counter
}

// Hook result shapes
export type Modifier<T> = { value: T; source: ItemId }

export interface HitChanceModifiers {
  addCritChance?: number // additive
  addHitChance?: number // additive
  addDodgeChance?: number // additive (applies to defender)
  addBlockChance?: number // additive (applies to defender)
}

export interface DamageModifiers {
  multDamage?: number // multiplicative (1.0 = +0%, 1.2 = +20%)
  addDamage?: number // flat additive
  dotAmplify?: number // multiplicative for damage over time
}

export interface LootModifiers {
  quantityMult?: number
  rarityBias?: number // shifts toward higher rarity
}

// Hook contracts
export interface ItemEffectHooks {
  // Lifecycle
  onRunStart?(ctx: BattleContext): void | Promise<void>
  onStageStart?(ctx: BattleContext): void | Promise<void>
  onStageEnd?(ctx: BattleContext): void | Promise<void>
  onBattleSetup?(ctx: BattleContext): void | Promise<void>
  onBattleEnd?(ctx: BattleContext, outcome: BattleOutcome): void | Promise<void>

  // Timing
  onTick?(ctx: BattleContext): void | Promise<void>

  // Combat calculations
  onComputeHitChance?(ctx: BattleContext, attacker: ActorState, defender: ActorState): Partial<HitChanceModifiers> | void
  onBeforeAttack?(ctx: BattleContext, attacker: ActorState, defender: ActorState): void | Promise<void>
  onComputeDamage?(ctx: BattleContext, attacker: ActorState, defender: ActorState, base: number): Partial<DamageModifiers> | void
  onAfterHit?(ctx: BattleContext, attacker: ActorState, defender: ActorState, dealt: number, crit: boolean): void | Promise<void>
  onReceiveDamage?(ctx: BattleContext, defender: ActorState, attacker: ActorState, amount: number): void | Promise<void>
  onAfterKill?(ctx: BattleContext, killer: ActorState, victim: ActorState): void | Promise<void>

  // Status & effects
  onApplyStatus?(ctx: BattleContext, target: ActorState, id: StatusId, stacks: number): void | Promise<void>

  // Economy / reward
  onLootDrop?(ctx: BattleContext): Partial<LootModifiers> | void
}

export interface ItemDefinition extends ItemEffectHooks {
  id: ItemId
  name: string
  description: string
  rarity: Rarity
}

export interface ItemInstance {
  id: ItemId
  stacks: number // infinite stacks supported
}

export type ItemRegistryMap = Map<ItemId, ItemDefinition>
