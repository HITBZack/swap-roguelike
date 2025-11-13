import type { ItemDefinition, ItemInstance, ItemRegistryMap, BattleContext, ActorState, HitChanceModifiers, DamageModifiers, LootModifiers, BattleOutcome } from './types'

function getDef(reg: ItemRegistryMap, id: string): ItemDefinition | null {
  return reg.get(id) ?? null
}

function times(n: number, fn: (i: number) => void) {
  for (let i = 0; i < n; i++) fn(i)
}

export class ItemsEngine {
  private readonly registry: ItemRegistryMap
  private readonly items: ItemInstance[]

  constructor(registry: ItemRegistryMap, items: ItemInstance[]) {
    this.registry = registry
    this.items = items
  }

  // Lifecycle
  async onRunStart(ctx: BattleContext): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onRunStart) continue
      times(it.stacks, () => { void def.onRunStart!(ctx) })
    }
  }

  async onStageStart(ctx: BattleContext): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onStageStart) continue
      times(it.stacks, () => { void def.onStageStart!(ctx) })
    }
  }

  async onStageEnd(ctx: BattleContext): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onStageEnd) continue
      times(it.stacks, () => { void def.onStageEnd!(ctx) })
    }
  }

  async onBattleSetup(ctx: BattleContext): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onBattleSetup) continue
      times(it.stacks, () => { void def.onBattleSetup!(ctx) })
    }
  }

  async onBattleEnd(ctx: BattleContext, outcome: BattleOutcome): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onBattleEnd) continue
      times(it.stacks, () => { void def.onBattleEnd!(ctx, outcome) })
    }
  }

  async onTick(ctx: BattleContext): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onTick) continue
      times(it.stacks, () => { void def.onTick!(ctx) })
    }
  }

  // Combat calculations
  computeHitChance(ctx: BattleContext, attacker: ActorState, defender: ActorState): Required<HitChanceModifiers> {
    let addCritChance = 0
    let addHitChance = 0
    let addDodgeChance = 0
    let addBlockChance = 0
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onComputeHitChance) continue
      times(it.stacks, () => {
        const m = def.onComputeHitChance!(ctx, attacker, defender) || {}
        addCritChance += m.addCritChance ?? 0
        addHitChance += m.addHitChance ?? 0
        addDodgeChance += m.addDodgeChance ?? 0
        addBlockChance += m.addBlockChance ?? 0
      })
    }
    return { addCritChance, addHitChance, addDodgeChance, addBlockChance }
  }

  async onBeforeAttack(ctx: BattleContext, attacker: ActorState, defender: ActorState): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onBeforeAttack) continue
      times(it.stacks, () => { void def.onBeforeAttack!(ctx, attacker, defender) })
    }
  }

  computeDamage(ctx: BattleContext, attacker: ActorState, defender: ActorState, base: number): Required<DamageModifiers> {
    let multDamage = 1
    let addDamage = 0
    let dotAmplify = 1
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onComputeDamage) continue
      times(it.stacks, () => {
        const m = def.onComputeDamage!(ctx, attacker, defender, base) || {}
        if (m.multDamage !== undefined) multDamage *= m.multDamage
        if (m.addDamage !== undefined) addDamage += m.addDamage
        if (m.dotAmplify !== undefined) dotAmplify *= m.dotAmplify
      })
    }
    return { multDamage, addDamage, dotAmplify }
  }

  async onAfterHit(ctx: BattleContext, attacker: ActorState, defender: ActorState, dealt: number, crit: boolean): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onAfterHit) continue
      times(it.stacks, () => { void def.onAfterHit!(ctx, attacker, defender, dealt, crit) })
    }
  }

  async onReceiveDamage(ctx: BattleContext, defender: ActorState, attacker: ActorState, amount: number): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onReceiveDamage) continue
      times(it.stacks, () => { void def.onReceiveDamage!(ctx, defender, attacker, amount) })
    }
  }

  async onAfterKill(ctx: BattleContext, killer: ActorState, victim: ActorState): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onAfterKill) continue
      times(it.stacks, () => { void def.onAfterKill!(ctx, killer, victim) })
    }
  }

  async onApplyStatus(ctx: BattleContext, target: ActorState, id: string, stacks: number): Promise<void> {
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onApplyStatus) continue
      times(it.stacks, () => { void def.onApplyStatus!(ctx, target, id as any, stacks) })
    }
  }

  computeLoot(ctx: BattleContext): Required<LootModifiers> {
    let quantityMult = 1
    let rarityBias = 0
    for (const it of this.items) {
      const def = getDef(this.registry, it.id); if (!def?.onLootDrop) continue
      times(it.stacks, () => {
        const m = def.onLootDrop!(ctx) || {}
        if (m.quantityMult !== undefined) quantityMult *= m.quantityMult
        if (m.rarityBias !== undefined) rarityBias += m.rarityBias
      })
    }
    return { quantityMult, rarityBias }
  }
}
