import Phaser from 'phaser'

/**
 * UIScene
 * Overlay UI for HP, energy, and menus. Placeholder elements only.
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene')
  }

  create(): void {
    const w = this.cameras.main.width

    this.add.text(12, 8, 'HP: 100/100  Energy: 10', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff' }).setScrollFactor(0)
    const btn = this.add.text(w - 12, 8, 'Menu', { fontFamily: 'sans-serif', fontSize: '12px', color: '#b3c0ff' }).setOrigin(1, 0)
    btn.setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => {
      // TODO: open pause/inventory overlay
    })
  }
}
