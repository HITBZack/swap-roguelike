import Phaser from 'phaser'
import { type AppState, useAppState } from '../lib/state'

/**
 * GameScene
 * Main overworld / stage handler. Loads minimal placeholder and advances to BattleScene on click.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
  }

  preload(): void {
    // TODO: Load assets (sprites, ui) when available
  }

  create(): void {
    const centerX = this.cameras.main.width / 2
    const centerY = this.cameras.main.height / 2

    this.add.text(centerX, centerY - 40, 'Social Roguelike', { fontFamily: 'sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5)
    this.add.text(centerX, centerY, 'Click to enter BattleScene', { fontFamily: 'sans-serif', fontSize: '16px', color: '#b3c0ff' }).setOrigin(0.5)

    this.input.once('pointerdown', () => {
      this.scene.start('BattleScene')
    })

    // Example: read from Zustand store
    const state: AppState = useAppState.getState()
    // eslint-disable-next-line no-console
    console.log('Booted with player:', state.player.username)
  }
}
