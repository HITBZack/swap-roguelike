import Phaser from 'phaser'
import { type AppState, useAppState } from '../lib/state'
import { gameManager } from '../services/GameManager'
import type { StagePlan } from '../services/GameManager'
import { runSingleCombat, runMultiCombat, runMiniBoss } from '../services/BattleManager'
import { completeRunAndMaybeReward } from '../services/RunRewards'
import { recordBattleStats, recordChoiceStats } from '../services/RunStats'
import { pickChoiceOptions } from '../services/Choices'

/**
 * GameScene
 * Main overworld / stage handler. Loads minimal placeholder and advances to BattleScene on click.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
  }

  preload(): void {
    // TODO: Load assets (enemy sprites, ui) when available
  }

  create(): void {
    const centerX = this.cameras.main.width / 2
    const centerY = this.cameras.main.height / 2

    ;(async () => {
      // Start or resume a run (seeded)
      let run = await gameManager.resumeRun()
      if (!run) run = await gameManager.startRun()

      this.add.text(centerX, centerY - 80, 'Social Roguelike', { fontFamily: 'sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5)
      this.add.text(centerX, centerY - 40, `Seed: ${run?.seed ?? 'n/a'}`, { fontFamily: 'sans-serif', fontSize: '12px', color: '#7a83c8' }).setOrigin(0.5)

      const stage: StagePlan | null = gameManager.getCurrentStage()
      const runItems = gameManager.getRunItems()
      const lines: string[] = []
      if (stage && run) {
        lines.push(`Biome: ${stage.biomeId}`)
        lines.push(`Stage: ${run.stageIndex + 1}`)
        lines.push(`Type: ${stage.type}`)
        if (stage.type === 'combat' && stage.combatType) lines.push(`Combat: ${stage.combatType}`)
      } else {
        lines.push('No stage available')
      }

      this.add.text(centerX, centerY + 4, lines.join('\n'), { fontFamily: 'monospace', fontSize: '16px', color: '#b3c0ff', align: 'center' }).setOrigin(0.5, 0)

      // Items panel (simple summary)
      const itemsTitle = this.add.text(16, 16, 'Run Items', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' })
      const itemsBox = this.add.rectangle(12, 12, 220, 120, 0x0f1226, 0.8).setOrigin(0)
      this.add.rectangle(12, 12, 220, 120).setStrokeStyle(1, 0x2a2f55).setOrigin(0)
      itemsTitle.setDepth(1)
      const itemsListLines = runItems.length === 0
        ? ['None']
        : runItems.map((it) => `• ${it.id} x${it.stacks}`)
      const itemsText = this.add.text(16, 36, itemsListLines.join('\n'), { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff' }).setDepth(1)

      // Battle log panel (collapsible) below items panel
      const panelX = 12
      const panelY = 12 + 120 + 10
      const panelW = 220
      const panelH = 150
      const panelBox = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0f1226, 0.8).setOrigin(0)
      this.add.rectangle(panelX, panelY, panelW, panelH).setStrokeStyle(1, 0x2a2f55).setOrigin(0)
      const logTitle = this.add.text(panelX + 4, panelY + 4, 'Battle Log', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' })
      const toggle = this.add.text(panelX + panelW - 18, panelY + 4, '▾', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setInteractive({ useHandCursor: true })

      let expanded = true
      const logText = this.add.text(panelX + 4, panelY + 24, '', { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff', wordWrap: { width: panelW - 8 } }).setOrigin(0)
      // Mask to keep text inside panel area
      const maskGfx = this.make.graphics({ x: 0, y: 0, add: false })
      maskGfx.fillStyle(0xffffff, 1)
      maskGfx.fillRect(panelX + 2, panelY + 22, panelW - 4, panelH - 26)
      const geomMask = maskGfx.createGeometryMask()
      logText.setMask(geomMask)

      function setExpanded(v: boolean) {
        expanded = v
        toggle.setText(v ? '▾' : '▸')
        logText.setVisible(v)
      }
      setExpanded(true)

      toggle.on('pointerdown', () => setExpanded(!expanded))

      // If this is a combat stage, simulate and print to log; also record stats
      let lastOutcome: 'win' | 'loss' | null = null
      if (stage?.type === 'combat' && run) {
        const stageNumber = run.stageIndex + run.biomeIndex * 100
        let result: { outcome: 'win'|'loss'; log: string[]; enemiesKilled: number }
        if (stage.combatType === 'single') {
          result = await runSingleCombat(run.seed, stageNumber, runItems)
        } else if (stage.combatType === 'multi') {
          result = await runMultiCombat(run.seed, stageNumber, runItems)
        } else if (stage.combatType === 'miniboss') {
          result = await runMiniBoss(run.seed, stageNumber, runItems)
        } else {
          result = await runSingleCombat(run.seed, stageNumber, runItems)
        }
        lastOutcome = result.outcome
        const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
        logText.setText([`Outcome: ${outcomeText}`, '', ...result.log].join('\n'))
        // Record stats (enemies slain, furthest stage)
        void recordBattleStats(result.enemiesKilled, stageNumber)
      } else if (stage?.type === 'choice' && run) {
        // Present seeded choice options (2-3)
        const stageNumber = run.stageIndex + run.biomeIndex * 100
        const options = pickChoiceOptions(run.seed, stageNumber, 3)
        const btnYStart = centerY + 8
        const spacing = 28
        const buttons = options.map((opt, i) => {
          const btn = this.add.text(centerX, btnYStart + i * spacing, `${opt.title}`, { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', backgroundColor: '#2a2f55' }).setPadding(8, 6, 8, 6).setOrigin(0.5)
          btn.setInteractive({ useHandCursor: true })
          btn.on('pointerover', () => btn.setScale(1.05).setAlpha(0.95))
          btn.on('pointerout', () => btn.setScale(1).setAlpha(1))
          btn.on('pointerdown', async () => {
            // disable all buttons to avoid double-choose
            buttons.forEach(b => b.disableInteractive().setAlpha(0.5))
            const outcome = await opt.resolve(run.seed, stageNumber, gameManager.getRunItems())
            if (outcome.updatedRunItems) {
              gameManager.setRunItems(outcome.updatedRunItems)
              const newList = outcome.updatedRunItems.length === 0 ? ['None'] : outcome.updatedRunItems.map(it => `• ${it.id} x${it.stacks}`)
              itemsText.setText(newList.join('\n'))
              // Persist run items so changes survive reloads
              await gameManager.persistRunItems()
            }
            if (Array.isArray(outcome.log) && outcome.log.length > 0) {
              const cur = logText.text ? `${logText.text}\n` : ''
              logText.setText(cur + outcome.log.join('\n'))
            }
            if (typeof outcome.poorDelta === 'number' && outcome.poorDelta !== 0) {
              void recordChoiceStats(outcome.poorDelta)
            }
            if (outcome.triggerMiniboss) {
              const result = await runMiniBoss(run.seed, stageNumber, gameManager.getRunItems())
              const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
              const cur = logText.text ? `${logText.text}\n` : ''
              logText.setText(cur + [`Mini-boss Outcome: ${outcomeText}`, '', ...result.log].join('\n'))
              void recordBattleStats(result.enemiesKilled, stageNumber)
            }
            // After resolution, show Next Stage
            const next = this.add.text(centerX, centerY + 160, 'Next Stage ▶', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', backgroundColor: '#5865f2' }).setPadding(6, 4, 6, 4).setOrigin(0.5)
            next.setInteractive({ useHandCursor: true })
            next.on('pointerdown', async () => {
              await gameManager.advance()
              this.scene.restart()
            })
          })
          return btn
        })
        logText.setText('Make a choice...')
      } else {
        logText.setText('No battle this stage.')
      }

      // Place control buttons beneath the main area (centered)
      const buttonsY = centerY + 160
      if (stage?.type === 'combat' && run) {
        const next = this.add.text(centerX, buttonsY, 'Next Stage ▶', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', backgroundColor: '#5865f2' }).setPadding(6, 4, 6, 4).setOrigin(0.5)
        next.setInteractive({ useHandCursor: true })
        next.on('pointerdown', async () => {
          await gameManager.advance()
          this.scene.restart()
        })
      }
      const endRun = this.add.text(centerX, buttonsY + 28, 'End Run (10% Lucky Clover)', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff', backgroundColor: '#8a2be2' }).setPadding(6, 4, 6, 4).setOrigin(0.5)
      endRun.setInteractive({ useHandCursor: true })
      endRun.on('pointerdown', async () => {
        const res = await completeRunAndMaybeReward()
        if (res && res.run_completed) {
          const msg = res.rewarded ? `Run ended. Rewarded: ${res.item_id} x${res.stacks_added}` : 'Run ended. No reward this time.'
          const t = this.add.text(centerX, buttonsY + 54, msg, { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff' }).setOrigin(0.5)
          this.time.delayedCall(1000, () => { t.destroy(); this.scene.restart() })
        }
      })
    })()

    // Example: read from Zustand store (debug)
    const state: AppState = useAppState.getState()
    // eslint-disable-next-line no-console
    console.log('Booted with player:', state.player.username)
  }
}
