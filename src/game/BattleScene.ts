import Phaser from 'phaser'

/**
 * BattleScene
 * Minimal placeholder for auto-battler combat screen.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene')
  }

  create(): void {
    const w = this.cameras.main.width
    const h = this.cameras.main.height

    this.add.text(w / 2, 32, 'BattleScene (placeholder)', { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffdd88' }).setOrigin(0.5, 0)

    // Placeholder enemy rectangle in the center with light 2.5D shadow
    const enemy = this.add.rectangle(w / 2, h / 2, 80, 80, 0x8a2be2).setOrigin(0.5)
    enemy.setDepth(1)
    this.add.ellipse(enemy.x + 8, enemy.y + 24, 100, 18, 0x000000, 0.25).setDepth(0)

    this.add.text(w / 2, h - 40, 'Press ESC to return', { fontFamily: 'sans-serif', fontSize: '14px', color: '#cccccc' }).setOrigin(0.5)

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('GameScene'))
  }
}
