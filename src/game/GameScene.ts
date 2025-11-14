import Phaser from 'phaser'
// Asset URL imports (Vite)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import gameViewStructureUrl from '../assets/scene_art/Game_View_Structure.png?url'
import { type AppState, useAppState } from '../lib/state'
import { gameManager } from '../services/GameManager'
import type { StagePlan } from '../services/GameManager'
import { runSingleCombat, runMultiCombat, runMiniBoss } from '../services/BattleManager'
import { completeRunAndMaybeReward } from '../services/RunRewards'
import { itemRegistry } from '../services/items/registry'
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

  private enemyKeys: string[] = []
  private playerKeys: string[] = []

  preload(): void {
    // Frame
    this.load.image('ui:game_frame', gameViewStructureUrl)

    // Discover enemies and player models via Vite glob imports
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const enemyUrls = import.meta.glob('../assets/enemies/*.png', { eager: true, as: 'url' }) as Record<string, string>
    this.enemyKeys = []
    Object.entries(enemyUrls).forEach(([path, url]) => {
      const fname = path.split('/').pop() as string
      const key = `enemy:${fname.replace(/\.png$/i, '').toLowerCase()}`
      this.load.image(key, url)
      this.enemyKeys.push(key)
    })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const playerUrls = import.meta.glob('../assets/character_models/*.png', { eager: true, as: 'url' }) as Record<string, string>
    this.playerKeys = []
    Object.entries(playerUrls).forEach(([path, url]) => {
      const fname = path.split('/').pop() as string
      const key = `player:${fname.replace(/\.png$/i, '').toLowerCase()}`
      this.load.image(key, url)
      this.playerKeys.push(key)
    })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const itemUrls = import.meta.glob('../assets/item_images/*.png', { eager: true, as: 'url' }) as Record<string, string>
    Object.entries(itemUrls).forEach(([path, url]) => {
      const fname = path.split('/').pop() as string
      const key = `item:${fname.replace(/\.png$/i, '').toLowerCase()}`
      this.load.image(key, url)
    })

    // UI buttons (Start Combat / Next Stage)
    const startBtnUrl = new URL('../assets/ui/StartCombatBtn.png', import.meta.url).toString()
    const nextBtnUrl = new URL('../assets/ui/NextStageBtn.png', import.meta.url).toString()
    this.load.image('ui:startCombat', startBtnUrl)
    this.load.image('ui:nextStage', nextBtnUrl)
  }

  create(): void {
    const centerX = this.cameras.main.width / 2
    const centerY = this.cameras.main.height / 4

    ;(async () => {
      // Start or resume a run (seeded)
      let run = await gameManager.resumeRun()
      if (!run) {
        // Pre-run screen with explanation and Start button
        const title = this.add.text(centerX, centerY - 80, 'Prepare for your run', { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff' }).setOrigin(0.5)
        const tipLines = [
          'Tip: Equip items before starting to bring them into your run.',
          'Equipping does not remove items from inventory.',
          'If you die, equipped items are not lost and can be used again.',
          'You have 3 lives per run.'
        ]
        this.add.text(centerX, centerY - 30, tipLines.join('\n'), { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff', align: 'center' }).setOrigin(0.5, 0)
        const startBtn = this.add.text(centerX, centerY + 60, 'Start Run ▶', { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', backgroundColor: '#22c55e' }).setPadding(8, 6, 8, 6).setOrigin(0.5)
        startBtn.setInteractive({ useHandCursor: true })
        startBtn.on('pointerdown', async () => {
          startBtn.disableInteractive().setAlpha(0.6)
          await gameManager.startRun()
          this.scene.restart()
        })
        return
      }

      // Top info: Seed centered top. Only show Combat type (remove biome, stage, type)
      this.add.text(centerX, 8, `Seed: ${run?.seed ?? 'n/a'}`, { fontFamily: 'sans-serif', fontSize: '12px', color: '#7a83c8' }).setOrigin(0.5, 0)

      const stage: StagePlan | null = gameManager.getCurrentStage()
      const runItems = gameManager.getRunItems()
      let enemyKeyForStage: string | null = null
      if (stage?.type === 'combat' && stage.combatType) {
        this.add.text(this.cameras.main.width - 12, 8, `Combat: ${stage.combatType}`, { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff', align: 'right' }).setOrigin(1, 0)
        const enemyIndexTop = ((): number => {
          let h = 2166136261 >>> 0
          const str = `${run.seed}|${run.stageIndex + run.biomeIndex * 100}`
          for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
          return this.enemyKeys.length > 0 ? (h >>> 0) % this.enemyKeys.length : 0
        })()
        enemyKeyForStage = this.enemyKeys[enemyIndexTop] ?? null
        if (enemyKeyForStage) {
          // Clean up name: remove prefix, extension, and trailing '-icon' or '_icon'
          const raw = enemyKeyForStage.replace(/^enemy:/, '')
          const stripped = raw.replace(/\.png$/i, '').replace(/[-_]?icon$/i, '')
          const name = stripped.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          this.add.text(this.cameras.main.width - 12, 26, `Enemy: ${name}`, { fontFamily: 'monospace', fontSize: '12px', color: '#9db0ff', align: 'right' }).setOrigin(1, 0).setDepth(50)
        }
      }

      // Items panel (stacked icons with quantity badge)
      const itemsTitle = this.add.text(16, 16, 'Run Items', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' })
      const itemsW = 165
      const itemsH = 120
      this.add.rectangle(12, 12, itemsW, itemsH, 0x0f1226, 0.8).setOrigin(0)
      this.add.rectangle(12, 12, itemsW, itemsH).setStrokeStyle(1, 0x2a2f55).setOrigin(0)
      itemsTitle.setDepth(1)

      function summarizeItems(list: { id: string; stacks: number }[]): Array<{ id: string; count: number }> {
        const map = new Map<string, number>()
        for (const it of list) {
          map.set(it.id, (map.get(it.id) ?? 0) + (it.stacks ?? 1))
        }
        return Array.from(map.entries()).map(([id, count]) => ({ id, count }))
      }

      const itemsGroup = this.add.container(12, 36)
      const tileSize = 36
      const gap = 6
      const cols = 3
      function resolveItemImgKey(id: string): string | null {
        const def = itemRegistry.get(id)
        const tryKeys: string[] = []
        if (def?.imageKey) tryKeys.push(`item:${def.imageKey.toLowerCase()}`)
        // Fallback: derive from id by replacing underscores with hyphens
        tryKeys.push(`item:${id.replace(/_/g, '-').toLowerCase()}`)
        for (const k of tryKeys) if (that.textures.exists(k)) return k
        return null
      }

      function renderItemsPanel(): void {
        itemsGroup.removeAll(true)
        const data = summarizeItems(gameManager.getRunItems())
        if (data.length === 0) {
          itemsGroup.add(
            that.add.text(4, 0, 'None', { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff' })
          )
          return
        }
        data.forEach((rec, idx) => {
          const r = Math.floor(idx / cols)
          const c = idx % cols
          const x = 4 + c * (tileSize + gap)
          const y = r * (tileSize + gap)
          const box = that.add.rectangle(x, y, tileSize, tileSize, 0x0b0e1a, 1).setOrigin(0)
          box.setStrokeStyle(1, 0x2a2f55)
          itemsGroup.add(box)
          const def = itemRegistry.get(rec.id)
          const imgKey = resolveItemImgKey(rec.id)
          if (imgKey && that.textures.exists(imgKey)) {
            const img = that.add.image(x + tileSize / 2, y + tileSize / 2, imgKey).setOrigin(0.5)
            const max = tileSize - 6
            const sw = max / img.width
            const sh = max / img.height
            img.setScale(Math.min(sw, sh))
            itemsGroup.add(img)
          } else {
            const label = (def?.name ?? rec.id).slice(0, 2).toUpperCase()
            const txt = that.add.text(x + tileSize / 2, y + tileSize / 2, label, { fontFamily: 'monospace', fontSize: '11px', color: '#e5e7ff' }).setOrigin(0.5)
            itemsGroup.add(txt)
          }
          if (rec.count > 1) {
            const badge = that.add.rectangle(x + tileSize - 10, y + tileSize - 10, 16, 12, 0x111842, 1).setOrigin(0.5)
            badge.setStrokeStyle(1, 0x3a428a)
            const qty = that.add.text(badge.x, badge.y, String(rec.count), { fontFamily: 'monospace', fontSize: '10px', color: '#b3c0ff' }).setOrigin(0.5)
            itemsGroup.add(badge)
            itemsGroup.add(qty)
          }
        })
      }
      const that = this
      renderItemsPanel()

      // Expand button to open modal of run items (readonly)
      const expand = this.add.text(12 + itemsW - 8, 16, 'Expand', { fontFamily: 'sans-serif', fontSize: '11px', color: '#9db0ff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
      expand.on('pointerdown', () => openItemsModal())

      function openItemsModal(): void {
        const camW = that.cameras.main.width
        const camH = that.cameras.main.height
        const overlay = that.add.rectangle(0, 0, camW, camH, 0x000000, 0.5).setOrigin(0).setInteractive().setDepth(1000)
        const w = Math.min(560, camW - 32)
        const h = Math.min(420, Math.max(300, camH - 120))
        const panel = that.add.rectangle(camW / 2, camH / 2, w, h, 0x0f1226, 1).setOrigin(0.5).setDepth(1001)
        panel.setStrokeStyle(1, 0x2a2f55)
        const title = that.add.text(panel.x - w / 2 + 12, panel.y - h / 2 + 8, 'Run Items', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setDepth(1002)
        const close = that.add.text(panel.x + w / 2 - 12, panel.y - h / 2 + 8, '✕', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(1002)
        const grid = that.add.container(panel.x - w / 2 + 12, panel.y - h / 2 + 34).setDepth(1002)
        const info = that.add.text(panel.x - w / 2 + 12, panel.y + h / 2 - 20, 'Click an item for details', { fontFamily: 'monospace', fontSize: '12px', color: '#9db0ff' }).setOrigin(0, 1).setDepth(1002)
        const data = summarizeItems(gameManager.getRunItems())
        const M = 6
        const T = 48
        const C = Math.max(4, Math.floor((w - 24) / (T + M)))
        data.forEach((rec, idx) => {
          const r = Math.floor(idx / C)
          const c = idx % C
          const x = c * (T + M)
          const y = r * (T + M)
          const box = that.add.rectangle(x, y, T, T, 0x0b0e1a, 1).setOrigin(0).setDepth(1002)
          box.setStrokeStyle(1, 0x2a2f55)
          grid.add(box)
          const def = itemRegistry.get(rec.id)
          const imgKey = resolveItemImgKey(rec.id)
          if (imgKey && that.textures.exists(imgKey)) {
            const img = that.add.image(x + T / 2, y + T / 2, imgKey).setOrigin(0.5).setDepth(1002)
            const max = T - 8
            const sw = max / img.width
            const sh = max / img.height
            img.setScale(Math.min(sw, sh))
            grid.add(img)
          } else {
            const label = (def?.name ?? rec.id).slice(0, 2).toUpperCase()
            const txt = that.add.text(x + T / 2, y + T / 2, label, { fontFamily: 'monospace', fontSize: '12px', color: '#e5e7ff' }).setOrigin(0.5).setDepth(1002)
            grid.add(txt)
          }
          const hit = that.add.zone(x, y, T, T).setOrigin(0).setInteractive().setDepth(1003)
          hit.on('pointerdown', () => {
            const name = def?.name ?? rec.id
            const desc = def?.description ?? 'No description'
            info.setText(`${name}  x${rec.count}\n${desc}`)
          })
          grid.add(hit)
          if (rec.count > 1) {
            const badge = that.add.rectangle(x + T - 10, y + T - 10, 16, 12, 0x111842, 1).setOrigin(0.5).setDepth(1002)
            badge.setStrokeStyle(1, 0x3a428a)
            const qty = that.add.text(badge.x, badge.y, String(rec.count), { fontFamily: 'monospace', fontSize: '10px', color: '#b3c0ff' }).setOrigin(0.5).setDepth(1002)
            grid.add(badge); grid.add(qty)
          }
        })
        function closeAll() {
          overlay.destroy(); panel.destroy(); title.destroy(); close.destroy(); grid.destroy(); info.destroy()
        }
        overlay.on('pointerdown', closeAll)
        close.on('pointerdown', closeAll)
      }

      // Arena frame (center area)
      const frame = this.add.image(centerX, centerY + 115, 'ui:game_frame').setOrigin(0.5)
      const targetFrameW = 420
      const sFrame = targetFrameW / frame.width
      frame.setScale(sFrame)
      frame.setDepth(20)

      // Place enemy inside transparent window of frame
      function pickDeterministicIndex(seed: string, stageNumber: number, n: number): number {
        let h = 2166136261 >>> 0
        const str = `${seed}|${stageNumber}`
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i)
          h = Math.imul(h, 16777619)
        }
        return n > 0 ? (h >>> 0) % n : 0
      }

      let enemySprite: Phaser.GameObjects.Image | null = null
      if (stage?.type === 'combat') {
        const enemyIndex = pickDeterministicIndex(run.seed, run.stageIndex + run.biomeIndex * 100, this.enemyKeys.length)
        const enemyKey = this.enemyKeys[enemyIndex]
        if (enemyKey) {
          enemySprite = this.add.image(frame.x, frame.y + frame.displayHeight * 0.20, enemyKey).setOrigin(0.5, 1)
          const maxW = frame.displayWidth * 0.97
          const maxH = frame.displayHeight * 0.74
          const sw = maxW / enemySprite.width
          const sh = maxH / enemySprite.height
          enemySprite.setScale(Math.min(sw, sh))
          enemySprite.setDepth(10)
        }
      }

      // Place player character near bottom inside frame
      const playerKey = this.playerKeys[0]
      if (playerKey) {
        const p = this.add.image(frame.x, frame.y + frame.displayHeight * 0.30, playerKey).setOrigin(0.5, 1)
        const maxPW = frame.displayWidth * 0.20
        const maxPH = frame.displayHeight * 0.22
        const spw = maxPW / p.width
        const sph = maxPH / p.height
        p.setScale(Math.min(spw, sph))
        p.setDepth(30)
      }

      // Battle log panel (collapsible) below items panel
      const panelX = 12
      const panelY = 12 + itemsH + 10
      const panelW = Math.floor(itemsW)
      const panelH = 300
      this.add.rectangle(panelX, panelY, panelW, panelH, 0x0f1226, 0.8).setOrigin(0)
      this.add.rectangle(panelX, panelY, panelW, panelH).setStrokeStyle(1, 0x2a2f55).setOrigin(0)
      this.add.text(panelX + 4, panelY + 4, 'Battle Log', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' })
      const toggle = this.add.text(panelX + panelW - 18, panelY + 4, '▾', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setInteractive({ useHandCursor: true })

      let expanded = true
      const logText = this.add.text(panelX + 4, panelY + 24, '', { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff', wordWrap: { width: panelW - 8 } }).setOrigin(0)
      // Mask to keep text inside panel area
      const maskGfx = this.add.graphics({ x: 0, y: 0 })
      maskGfx.fillStyle(0xffffff, 1)
      maskGfx.fillRect(panelX + 2, panelY + 22, panelW - 4, panelH - 26)
      const geomMask = maskGfx.createGeometryMask()
      maskGfx.setVisible(false)
      logText.setMask(geomMask)

      // Scroll handling for the log (hover-only wheel; arrow buttons)
      const viewHeight = panelH - 26
      let scrollY = 0
      let overLog = false
      function refreshScroll() {
        const maxScroll = Math.max(0, logText.height - viewHeight)
        if (scrollY < 0) scrollY = 0
        if (scrollY > maxScroll) scrollY = maxScroll
        logText.setY(panelY + 24 - scrollY)
      }
      function updateLog(text: string, toBottom = true) {
        logText.setText(text)
        if (toBottom) {
          scrollY = Math.max(0, logText.height - viewHeight)
        }
        refreshScroll()
      }
      const logZone = this.add.zone(panelX + 2, panelY + 22, panelW - 4, viewHeight).setOrigin(0).setInteractive()
      logZone.on('pointerover', () => { overLog = true })
      logZone.on('pointerout', () => { overLog = false })
      this.input.on('wheel', (_p: any, _go: any, _dx: number, dy: number) => {
        if (!expanded) return
        if (!overLog) return
        scrollY += dy * 0.5
        refreshScroll()
      })
      // Up/Down arrow buttons inside panel to scroll
      const upBtn = this.add.text(panelX + panelW - 14, panelY + 24, '▲', { fontFamily: 'sans-serif', fontSize: '10px', color: '#e5e7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      const dnBtn = this.add.text(panelX + panelW - 14, panelY + panelH - 16, '▼', { fontFamily: 'sans-serif', fontSize: '10px', color: '#e5e7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      upBtn.on('pointerdown', () => { scrollY -= 18; refreshScroll() })
      dnBtn.on('pointerdown', () => { scrollY += 18; refreshScroll() })

      function setExpanded(v: boolean) {
        expanded = v
        toggle.setText(v ? '▾' : '▸')
        logText.setVisible(v)
      }
      setExpanded(true)

      toggle.on('pointerdown', () => setExpanded(!expanded))

      // If this is a combat stage, gate combat behind Start Combat or auto-combat
      if (stage?.type === 'combat' && run) {
        const stageNumber = run.stageIndex + run.biomeIndex * 100
        // Anchor positions aligned to frame bottom and scaled with frame
        const bottomY = frame.y + frame.displayHeight / 2.27
        const slotOffset = 220 * sFrame
        const leftSlotX = frame.x - slotOffset
        const rightSlotX = frame.x + slotOffset

        // Image button helper (scaled to frame ratio) with glow/tint hover
        const makeImgBtn = (key: string, x: number, y: number, onUp: () => void) => {
          const base = sFrame
          const glow = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(219)
          glow.setScale(base * 1.06)
          glow.setBlendMode(Phaser.BlendModes.ADD)
          glow.setTint(0x99ccff)
          glow.setAlpha(0)
          const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(220)
          img.setScale(base)
          img.setInteractive({ useHandCursor: true })
          img.on('pointerover', () => { img.setScale(base * 1.03); img.setTint(0xbfd6ff); glow.setAlpha(0.35) })
          img.on('pointerout', () => { img.setScale(base); img.clearTint(); glow.setAlpha(0) })
          img.on('pointerdown', () => { img.setScale(base * 0.98); img.setTint(0xd7e6ff); glow.setAlpha(0.45) })
          img.on('pointerup', () => { img.setScale(base * 1.03); img.setTint(0xbfd6ff); glow.setAlpha(0.35); onUp() })
          return img
        }

        const startBtn = makeImgBtn('ui:startCombat', leftSlotX, bottomY, () => { void resolveCombat() })
        const resolveCombat = async (): Promise<void> => {
          startBtn.disableInteractive().setAlpha(0.6)
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
          const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
          updateLog([`Outcome: ${outcomeText}`, '', ...result.log].join('\n'))
          void recordBattleStats(result.enemiesKilled, stageNumber)
          gameManager.addEnemiesKilled(result.enemiesKilled)
          if (result.outcome === 'win') {
            if (stage.combatType === 'miniboss') gameManager.incMinibossDefeated()
            if (stage.combatType === 'boss') gameManager.incBossDefeated()
          }
          if (result.outcome === 'loss') {
            const livesLeft = gameManager.decrementLife()
            await gameManager.persistStagePlan()
            const cur = logText.text ? `${logText.text}\n` : ''
            logText.setText(cur + `You lost a life. Lives remaining: ${livesLeft}/3`)
            if (livesLeft <= 0) {
              await completeRunAndMaybeReward()
              gameManager.resetRun()
              this.scene.stop('GameScene'); this.scene.start('GameScene')
              return
            }
          }
          // After resolution, remove start button and show Next Stage
          startBtn.destroy()
          makeImgBtn('ui:nextStage', rightSlotX, bottomY, async () => {
            await gameManager.advance()
            this.scene.restart()
          })
        }
        if (gameManager.isAutoCombat()) { void resolveCombat() }
      } else if (stage?.type === 'choice' && run) {
        // Present seeded choice options (2-3)
        const stageNumber = run.stageIndex + run.biomeIndex * 100
        const options = pickChoiceOptions(run.seed, stageNumber, 3)
        // Position higher so bottom Start/Next slots remain untouched
        const btnYStart = centerY - 24
        const spacing = 32
        const buttons = options.map((opt, i) => {
          const btn = this.add.text(centerX, btnYStart + i * spacing, `${opt.title}`, { fontFamily: 'sans-serif', fontSize: '14px', color: '#cfe1ff', backgroundColor: '#101531' }).setPadding(10, 6, 10, 6).setOrigin(0.5).setDepth(120)
          btn.setInteractive({ useHandCursor: true })
          btn.setStroke('#2a2f55', 1)
          btn.on('pointerover', () => { btn.setScale(1.05).setAlpha(0.98); (btn as any).setTint?.(0xbfd6ff) })
          btn.on('pointerout', () => { btn.setScale(1.0).setAlpha(1); (btn as any).clearTint?.() })
          btn.on('pointerdown', async () => {
            // disable all buttons to avoid double-choose
            buttons.forEach(b => b.disableInteractive().setAlpha(0.5))
            const before = gameManager.getRunItems()
            const beforeTotal = before.reduce((a, it) => a + (it.stacks ?? 0), 0)
            const outcome = await opt.resolve(run.seed, stageNumber, before)
            if (outcome.updatedRunItems) {
              const after = outcome.updatedRunItems
              const afterTotal = after.reduce((a, it) => a + (it.stacks ?? 0), 0)
              const delta = afterTotal - beforeTotal
              if (delta > 0) gameManager.addItemsGained(delta)
              gameManager.setRunItems(after)
              renderItemsPanel()
              // Persist run items so changes survive reloads
              await gameManager.persistRunItems()
            }
            if (Array.isArray(outcome.log) && outcome.log.length > 0) {
              const cur = logText.text ? `${logText.text}\n` : ''
              updateLog(cur + outcome.log.join('\n'))
            }
            if (typeof outcome.poorDelta === 'number' && outcome.poorDelta !== 0) {
              void recordChoiceStats(outcome.poorDelta)
            }
            if (outcome.triggerMiniboss) {
              const result = await runMiniBoss(run.seed, stageNumber, gameManager.getRunItems())
              const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
              const cur = logText.text ? `${logText.text}\n` : ''
              updateLog(cur + [`Mini-boss Outcome: ${outcomeText}`, '', ...result.log].join('\n'))
              void recordBattleStats(result.enemiesKilled, stageNumber)
              gameManager.addEnemiesKilled(result.enemiesKilled)
              if (result.outcome === 'win') gameManager.incMinibossDefeated()
              if (result.outcome === 'loss') {
                const livesLeft = gameManager.decrementLife()
                await gameManager.persistStagePlan()
                const cur2 = logText.text ? `${logText.text}\n` : ''
                logText.setText(cur2 + `You lost a life. Lives remaining: ${livesLeft}/3`)
                if (livesLeft <= 0) {
                  await completeRunAndMaybeReward()
                  gameManager.resetRun()
                  this.scene.stop('GameScene'); this.scene.start('GameScene')
                }
              }
            }
            // After resolution, show Next Stage (image button) using the same placement constants as combat
            const bottomY = frame.y + frame.displayHeight / 2.27
            const slotOffset = 220 * sFrame
            const rightSlotX = frame.x + slotOffset
            const makeImgBtn = (key: string, x: number, y: number, onUp: () => void) => {
              const base = sFrame
              const glow = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(219)
              glow.setScale(base * 1.06)
              glow.setBlendMode(Phaser.BlendModes.ADD)
              glow.setTint(0x99ccff)
              glow.setAlpha(0)
              const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(220)
              img.setScale(base)
              img.setInteractive({ useHandCursor: true })
              img.on('pointerover', () => { img.setScale(base * 1.03); img.setTint(0xbfd6ff); glow.setAlpha(0.35) })
              img.on('pointerout', () => { img.setScale(base); img.clearTint(); glow.setAlpha(0) })
              img.on('pointerdown', () => { img.setScale(base * 0.98); img.setTint(0xd7e6ff); glow.setAlpha(0.45) })
              img.on('pointerup', () => { img.setScale(base * 1.03); img.setTint(0xbfd6ff); glow.setAlpha(0.35); onUp() })
              return img
            }
            makeImgBtn('ui:nextStage', rightSlotX, bottomY, async () => {
              await gameManager.advance()
              this.scene.restart()
            })
          })
          return btn
        })
        updateLog('Make a choice...', false)
      } else {
        updateLog('No battle this stage.', false)
      }

      // Place control buttons beneath the main area (centered)
      const pad = 12
      const brX = this.cameras.main.width - pad
      const brY = this.cameras.main.height - pad
      // Next Stage for combat is created after combat resolution; for non-combat, keep as below only for endRun button
      const endRun = this.add.text(brX, brY - 8, 'End Run', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff', backgroundColor: '#8a2be2' }).setPadding(6, 4, 6, 4).setOrigin(1, 1)
      endRun.setInteractive({ useHandCursor: true })
      endRun.on('pointerdown', async () => {
        await completeRunAndMaybeReward()
        gameManager.resetRun()
        this.scene.stop('GameScene'); this.scene.start('GameScene')
      })
    })()

    // Example: read from Zustand store (debug)
    const state: AppState = useAppState.getState()
    // eslint-disable-next-line no-console
    console.log('Booted with player:', state.player.username)
  }
}
