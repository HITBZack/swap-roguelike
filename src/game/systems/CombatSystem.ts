/**
 * CombatSystem
 * Handles turn-based auto-battler logic driven by items and stats.
 */

export interface Combatant {
  id: string
  name: string
  hp: number
  maxHp: number
  energy: number
  attack: number
  defense: number
  // TODO: abilities, effects
}

export interface CombatResult {
  winnerId: string | null
  turns: number
}

export class CombatSystem {
  /**
   * Simulate a single step/turn.
   * TODO: Replace placeholder with item- and effect-driven resolution.
   */
  step(attacker: Combatant, defender: Combatant): void {
    const raw = Math.max(0, attacker.attack - defender.defense)
    defender.hp = Math.max(0, defender.hp - Math.max(1, raw))
  }

  /**
   * Run combat until one side falls to 0 HP or max turns reached.
   */
  run(a: Combatant, b: Combatant, maxTurns = 100): CombatResult {
    let turns = 0
    let attacker = a
    let defender = b
    while (a.hp > 0 && b.hp > 0 && turns < maxTurns) {
      this.step(attacker, defender)
      ;[attacker, defender] = [defender, attacker]
      turns += 1
    }
    const winnerId = a.hp <= 0 ? (b.hp <= 0 ? null : b.id) : a.id
    return { winnerId, turns }
  }
}
