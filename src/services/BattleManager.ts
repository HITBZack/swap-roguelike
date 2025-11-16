import { fromSeed, int } from '../lib/rng'
import type { ItemInstance } from './items/types'
import { ItemsEngine } from './items/engine'
import { itemRegistry } from './items/registry'
import type { BattleContext, ActorState, BattleOutcome } from './items/types'
import { buildEffectiveStats } from './player/Stats'
import { useAppState } from '../lib/state'
import { gameManager } from './GameManager'

export type BattleResult = {
  outcome: 'win' | 'loss'
  log: string[]
  enemiesKilled: number
}

type CombatOptions = { enemyBlessed?: boolean; role?: 'normal' | 'miniboss' | 'boss' }

export async function runSingleCombat(runSeed: string, stageNumber: number, items: ItemInstance[], options: CombatOptions = {}): Promise<BattleResult> {
  const rng = fromSeed(`${runSeed}|${stageNumber}`)

  const level = useAppState.getState().player.level ?? 1
  const pst = buildEffectiveStats(level, items)
  const dmgMult = gameManager.getDamageMultiplier()
  const hpMult = gameManager.getMaxHpMultiplier()
  pst.maxHp = Math.max(1, Math.floor(pst.maxHp * hpMult))
  pst.damage = Math.max(1, Math.floor(pst.damage * dmgMult))
  const player: ActorState = {
    kind: 'player',
    hp: pst.maxHp,
    maxHp: pst.maxHp,
    atk: pst.damage,
    def: 2,
    critChance: 0.1,
    critMult: 1.5,
    dodgeChance: pst.dodge,
    blockChance: 0.03,
    statuses: {}
  }

  const enemy: ActorState = {
    kind: 'enemy',
    hp: int(rng, 18, 32),
    maxHp: 999,
    atk: 5,
    def: 1,
    critChance: 0.05,
    critMult: 1.4,
    dodgeChance: 0.03,
    blockChance: 0.02,
    statuses: {}
  }
  if (options.enemyBlessed) {
    enemy.hp = Math.floor(enemy.hp * 3)
    enemy.atk = Math.floor(enemy.atk * 3)
    enemy.def = Math.floor(Math.max(1, enemy.def * 3))
  }

  const ctx: BattleContext = { rng, player, enemies: [enemy], time: 0 }
  const engine = new ItemsEngine(itemRegistry, items)
  const log: string[] = []
  let enemiesKilled = 0

  await engine.onBattleSetup(ctx)

  const maxTicks = 100
  let outcome: BattleOutcome = 'ongoing'

  function resolveHit(attacker: ActorState, defender: ActorState) {
    const baseHit = attacker.kind === 'player' ? Math.max(0.5, Math.min(0.99, pst.accuracy)) : 0.8
    const mods = engine.computeHitChance(ctx, attacker, defender)
    const hitChance = Math.max(0, Math.min(1, baseHit + mods.addHitChance - (defender.dodgeChance + mods.addDodgeChance + defender.blockChance + mods.addBlockChance)))
    const critChance = Math.max(0, Math.min(1, attacker.critChance + mods.addCritChance))
    const doHit = rng.next() < hitChance
    let dealt = 0
    let crit = false
    if (doHit) {
      const base = Math.max(1, attacker.atk - defender.def)
      const dmgMods = engine.computeDamage(ctx, attacker, defender, base)
      dealt = Math.max(0, Math.floor(base * dmgMods.multDamage + dmgMods.addDamage))
      crit = rng.next() < critChance
      if (crit) dealt = Math.floor(dealt * attacker.critMult)
    }
    return { doHit, dealt, crit }
  }

  for (let t = 0; t < maxTicks; t++) {
    ctx.time = t
    await engine.onTick(ctx)

    await engine.onBeforeAttack(ctx, player, enemy)
    const p = resolveHit(player, enemy)
    if (p.doHit) {
      enemy.hp = Math.max(0, enemy.hp - p.dealt)
      log.push(`You hit for ${p.dealt}${p.crit ? ' (crit)' : ''}. Enemy HP: ${enemy.hp}`)
      await engine.onAfterHit(ctx, player, enemy, p.dealt, p.crit)
      await engine.onReceiveDamage(ctx, enemy, player, p.dealt)
      if (enemy.hp <= 0) {
        log.push('Enemy defeated!')
        await engine.onAfterKill(ctx, player, enemy)
        outcome = 'win'
        enemiesKilled += 1
        break
      }
    } else {
      log.push('You missed')
    }

    await engine.onBeforeAttack(ctx, enemy, player)
    const e = resolveHit(enemy, player)
    if (e.doHit) {
      player.hp = Math.max(0, player.hp - e.dealt)
      log.push(`Enemy hits for ${e.dealt}${e.crit ? ' (crit)' : ''}. Your HP: ${player.hp}`)
      await engine.onAfterHit(ctx, enemy, player, e.dealt, e.crit)
      await engine.onReceiveDamage(ctx, player, enemy, e.dealt)
      if (player.hp <= 0) {
        log.push('You were defeated...')
        outcome = 'loss'
        break
      }
    } else {
      log.push('Enemy missed')
    }
  }

  if (outcome === 'ongoing') outcome = player.hp > enemy.hp ? 'win' : 'loss'
  await engine.onBattleEnd(ctx, outcome)
  return { outcome: outcome === 'win' ? 'win' : 'loss', log, enemiesKilled }
}

export async function runMultiCombat(runSeed: string, stageNumber: number, items: ItemInstance[], options: CombatOptions = {}): Promise<BattleResult> {
  const rng = fromSeed(`${runSeed}|${stageNumber}|multi`)

  const level = useAppState.getState().player.level ?? 1
  const pst = buildEffectiveStats(level, items)
  const dmgMult = gameManager.getDamageMultiplier()
  const hpMult = gameManager.getMaxHpMultiplier()
  pst.maxHp = Math.max(1, Math.floor(pst.maxHp * hpMult))
  pst.damage = Math.max(1, Math.floor(pst.damage * dmgMult))
  const player: ActorState = {
    kind: 'player', hp: pst.maxHp, maxHp: pst.maxHp, atk: pst.damage, def: 2,
    critChance: 0.1, critMult: 1.5, dodgeChance: pst.dodge, blockChance: 0.03, statuses: {}
  }

  // 2-4 enemies
  const enemyCount = int(rng, 2, 4)
  const enemies: ActorState[] = Array.from({ length: enemyCount }, () => ({
    kind: 'enemy', hp: int(rng, 10, 18), maxHp: 999, atk: 4, def: 1,
    critChance: 0.04, critMult: 1.4, dodgeChance: 0.04, blockChance: 0.02, statuses: {}
  }))
  if (options.enemyBlessed) {
    for (const e of enemies) {
      e.hp = Math.floor(e.hp * 3)
      e.atk = Math.floor(e.atk * 3)
      e.def = Math.floor(Math.max(1, e.def * 3))
    }
  }

  const ctx: BattleContext = { rng, player, enemies, time: 0 }
  const engine = new ItemsEngine(itemRegistry, items)
  const log: string[] = []
  let enemiesKilled = 0

  await engine.onBattleSetup(ctx)
  const maxTicks = 200

  function resolveHit(attacker: ActorState, defender: ActorState) {
    const baseHit = 0.8
    const mods = engine.computeHitChance(ctx, attacker, defender)
    const hitChance = Math.max(0, Math.min(1, baseHit + mods.addHitChance - (defender.dodgeChance + mods.addDodgeChance + defender.blockChance + mods.addBlockChance)))
    const critChance = Math.max(0, Math.min(1, attacker.critChance + mods.addCritChance))
    const doHit = rng.next() < hitChance
    let dealt = 0
    let crit = false
    if (doHit) {
      const base = Math.max(1, attacker.atk - defender.def)
      const dmgMods = engine.computeDamage(ctx, attacker, defender, base)
      dealt = Math.max(0, Math.floor(base * dmgMods.multDamage + dmgMods.addDamage))
      crit = rng.next() < critChance
      if (crit) dealt = Math.floor(dealt * attacker.critMult)
    }
    return { doHit, dealt, crit }
  }

  for (let t = 0; t < maxTicks; t++) {
    ctx.time = t
    await engine.onTick(ctx)

    // Player attacks a random alive enemy
    const alive = enemies.filter(e => e.hp > 0)
    if (alive.length === 0) break
    const target = alive[int(rng, 0, alive.length - 1)]
    await engine.onBeforeAttack(ctx, player, target)
    const p = resolveHit(player, target)
    if (p.doHit) {
      target.hp = Math.max(0, target.hp - p.dealt)
      log.push(`You hit for ${p.dealt}${p.crit ? ' (crit)' : ''}. Target HP: ${target.hp}`)
      await engine.onAfterHit(ctx, player, target, p.dealt, p.crit)
      await engine.onReceiveDamage(ctx, target, player, p.dealt)
      if (target.hp <= 0) {
        log.push('Enemy defeated!')
        await engine.onAfterKill(ctx, player, target)
        enemiesKilled += 1
      }
    } else {
      log.push('You missed')
    }

    // Each alive enemy attacks once per tick
    for (const ene of enemies) {
      if (ene.hp <= 0) continue
      await engine.onBeforeAttack(ctx, ene, player)
      const e = resolveHit(ene, player)
      if (e.doHit) {
        player.hp = Math.max(0, player.hp - e.dealt)
        log.push(`Enemy hits for ${e.dealt}${e.crit ? ' (crit)' : ''}. Your HP: ${player.hp}`)
        await engine.onAfterHit(ctx, ene, player, e.dealt, e.crit)
        await engine.onReceiveDamage(ctx, player, ene, e.dealt)
        if (player.hp <= 0) break
      } else {
        log.push('Enemy missed')
      }
    }

    if (player.hp <= 0) break
    if (enemies.every(e => e.hp <= 0)) break
  }

  const outcome: BattleOutcome = enemies.every(e => e.hp <= 0) && player.hp > 0 ? 'win' : (player.hp <= 0 ? 'loss' : 'loss')
  await engine.onBattleEnd(ctx, outcome)
  return { outcome: outcome === 'win' ? 'win' : 'loss', log, enemiesKilled }
}

export async function runMiniBoss(runSeed: string, stageNumber: number, items: ItemInstance[], options: CombatOptions = {}): Promise<BattleResult> {
  const rng = fromSeed(`${runSeed}|${stageNumber}|miniboss`)

  const level = useAppState.getState().player.level ?? 1
  const pst = buildEffectiveStats(level, items)
  const dmgMult = gameManager.getDamageMultiplier()
  const hpMult = gameManager.getMaxHpMultiplier()
  pst.maxHp = Math.max(1, Math.floor(pst.maxHp * hpMult))
  pst.damage = Math.max(1, Math.floor(pst.damage * dmgMult))
  const player: ActorState = {
    kind: 'player', hp: pst.maxHp, maxHp: pst.maxHp, atk: pst.damage, def: 2,
    critChance: 0.12, critMult: 1.6, dodgeChance: pst.dodge, blockChance: 0.04, statuses: {}
  }

  const boss: ActorState = {
    kind: 'enemy', hp: int(rng, 40, 55), maxHp: 999, atk: 7, def: 2,
    critChance: 0.06, critMult: 1.5, dodgeChance: 0.03, blockChance: 0.04, statuses: {}
  }

  // Difficulty scaling by role: miniboss ~2x, boss ~4x
  const role = options.role ?? 'miniboss'
  if (role === 'miniboss') {
    boss.hp = Math.floor(boss.hp * 2)
    boss.atk = Math.floor(boss.atk * 2)
    boss.def = Math.floor(Math.max(1, boss.def * 2))
  } else if (role === 'boss') {
    boss.hp = Math.floor(boss.hp * 4)
    boss.atk = Math.floor(boss.atk * 4)
    boss.def = Math.floor(Math.max(1, boss.def * 4))
  }
  if (options.enemyBlessed) {
    boss.hp = Math.floor(boss.hp * 3)
    boss.atk = Math.floor(boss.atk * 3)
    boss.def = Math.floor(Math.max(1, boss.def * 3))
  }

  const ctx: BattleContext = { rng, player, enemies: [boss], time: 0 }
  const engine = new ItemsEngine(itemRegistry, items)
  const log: string[] = []
  let enemiesKilled = 0

  await engine.onBattleSetup(ctx)
  const maxTicks = 200

  function resolveHit(attacker: ActorState, defender: ActorState) {
    const baseHit = attacker.kind === 'player' ? Math.max(0.5, Math.min(0.99, pst.accuracy)) : 0.78
    const mods = engine.computeHitChance(ctx, attacker, defender)
    const hitChance = Math.max(0, Math.min(1, baseHit + mods.addHitChance - (defender.dodgeChance + mods.addDodgeChance + defender.blockChance + mods.addBlockChance)))
    const critChance = Math.max(0, Math.min(1, attacker.critChance + mods.addCritChance))
    const doHit = rng.next() < hitChance
    let dealt = 0
    let crit = false
    if (doHit) {
      const base = Math.max(1, attacker.atk - defender.def)
      const dmgMods = engine.computeDamage(ctx, attacker, defender, base)
      dealt = Math.max(0, Math.floor(base * dmgMods.multDamage + dmgMods.addDamage))
      crit = rng.next() < critChance
      if (crit) dealt = Math.floor(dealt * attacker.critMult)
    }
    return { doHit, dealt, crit }
  }

  for (let t = 0; t < maxTicks; t++) {
    ctx.time = t
    await engine.onTick(ctx)

    await engine.onBeforeAttack(ctx, player, boss)
    const p = resolveHit(player, boss)
    if (p.doHit) {
      boss.hp = Math.max(0, boss.hp - p.dealt)
      log.push(`You hit for ${p.dealt}${p.crit ? ' (crit)' : ''}. Boss HP: ${boss.hp}`)
      await engine.onAfterHit(ctx, player, boss, p.dealt, p.crit)
      await engine.onReceiveDamage(ctx, boss, player, p.dealt)
      if (boss.hp <= 0) {
        log.push('Mini-boss defeated!')
        await engine.onAfterKill(ctx, player, boss)
        enemiesKilled = 1
        break
      }
    } else {
      log.push('You missed')
    }

    await engine.onBeforeAttack(ctx, boss, player)
    const e = resolveHit(boss, player)
    if (e.doHit) {
      player.hp = Math.max(0, player.hp - e.dealt)
      log.push(`Boss hits for ${e.dealt}${e.crit ? ' (crit)' : ''}. Your HP: ${player.hp}`)
      await engine.onAfterHit(ctx, boss, player, e.dealt, e.crit)
      await engine.onReceiveDamage(ctx, player, boss, e.dealt)
      if (player.hp <= 0) break
    } else {
      log.push('Boss missed')
    }
  }

  const outcome: BattleOutcome = boss.hp <= 0 && player.hp > 0 ? 'win' : (player.hp <= 0 ? 'loss' : 'loss')
  await engine.onBattleEnd(ctx, outcome)
  return { outcome: outcome === 'win' ? 'win' : 'loss', log, enemiesKilled }
}
