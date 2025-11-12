import Phaser from 'phaser'
import { GameScene } from '../game/GameScene'
import { BattleScene } from '../game/BattleScene'
import { UIScene } from '../game/UIScene'

let game: Phaser.Game | null = null

/**
 * bootGame
 * Creates a Phaser.Game inside the provided parent element with responsive scaling.
 * If an existing instance exists, it will be destroyed first.
 */
export async function bootGame(parent: HTMLElement): Promise<void> {
  if (game) {
    game.destroy(true)
    game = null
  }

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    backgroundColor: '#0f1226',
    parent,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 800,
      height: 450,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [GameScene, BattleScene, UIScene],
  }

  game = new Phaser.Game(config)
}
