import Phaser from 'phaser'
// Asset URL imports (Vite)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import gameViewStructureUrl from '../assets/scene_art/Game_View_Structure.png?url'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import teacookiesUrl from '../assets/scene_art/teacookies.png?url'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import introBackgroundUrl from '../assets/scene_art/intro_background.jpg?url'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pillarUrl from '../assets/scene_art/pillar.png?url'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import startRunBtnUrl from '../assets/ui/startrunbtn.png?url'
import { type AppState, useAppState } from '../lib/state'
import { gameManager } from '../services/GameManager'
import type { StagePlan } from '../services/GameManager'
import { runSingleCombat, runMultiCombat, runMiniBoss } from '../services/BattleManager'
import { completeRunAndMaybeReward } from '../services/RunRewards'
import { addMyXp, incMyDeaths, markMyIntroDone } from '../lib/profile'
import { itemRegistry } from '../services/items/registry'
import { getEnemiesFor, getEnemyDefs } from '../services/enemies/registry'
import { recordBattleStats, recordChoiceStats } from '../services/RunStats'
import { pickChoiceOptions } from '../services/Choices'
import { fromSeed, int } from '../lib/rng'

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
    this.load.image('unique:teacookies', teacookiesUrl)
    this.load.image('unique:pillar', pillarUrl)
    this.load.image('ui:intro_bg', introBackgroundUrl)
    this.load.image('ui:start_run', startRunBtnUrl)

    // Discover enemies and player models via Vite glob imports
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const enemyUrls = import.meta.glob('../assets/enemies/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
    this.enemyKeys = []
    Object.entries(enemyUrls).forEach(([path, url]) => {
      const fname = path.split('/').pop() as string
      const key = `enemy:${fname.replace(/\.png$/i, '').toLowerCase()}`
      this.load.image(key, url)
      this.enemyKeys.push(key)
    })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const playerUrls = import.meta.glob('../assets/character_models/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
    this.playerKeys = []
    Object.entries(playerUrls).forEach(([path, url]) => {
      const fname = path.split('/').pop() as string
      const key = `player:${fname.replace(/\.png$/i, '').toLowerCase()}`
      this.load.image(key, url)
      this.playerKeys.push(key)
    })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const itemUrls = import.meta.glob('../assets/item_images/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
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

    // Notify host UI that the scene is ready to display (hide loading overlay)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('game:scene-ready'))
    }

    // Autoplay integration: allow React UI to request an automatic Next Stage when safe
    let goNextStage: (() => void) | null = null
    let canAutoAdvance = false
    let isAdvancingStage = false
    // Note: autoplay listener now lives inside the async run block so it can see boss/log state

    ;(async () => {
      // Start or resume a run (seeded)
      let run = await gameManager.resumeRun()
      if (!run) {
        // Pre-run screen with explanation and Start button
        const sceneCenterX = this.cameras.main.width / 2
        const sceneCenterY = this.cameras.main.height / 2
        const bg = this.add.image(sceneCenterX, sceneCenterY, 'ui:intro_bg').setOrigin(0.5)
        const bgScale = Math.max(
          this.cameras.main.width / bg.width,
          this.cameras.main.height / bg.height
        )
        bg.setScale(bgScale)

        const panelWidth = Math.min(520, this.cameras.main.width - 40)
        const panelHeight = 220
        const panel = this.add.rectangle(sceneCenterX, sceneCenterY, panelWidth, panelHeight, 0x020617, 0.88)
        panel.setStrokeStyle(1, 0x1d283a)

        const title = this.add.text(sceneCenterX, panel.y - panelHeight / 2 + 26, 'Prepare for your run', {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#e5e7ff'
        }).setOrigin(0.5, 0.5)
        title.setShadow(0, 2, '#000000', 4, false, true)

        const tipLines = [
          'Equip items before starting to bring them into your run.',
          'Equipping does not remove items from inventory.',
          'If you die, equipped items are not lost and can be used again.',
          'You have 3 lives per run.'
        ]
        const tips = this.add.text(sceneCenterX, title.y + 22, tipLines.join('\n'), {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#c7d2fe',
          align: 'center'
        }).setOrigin(0.5, 0)
        tips.setShadow(0, 1, '#020617', 3, false, true)

        const btnY = panel.y + panelHeight / 2 - 46
        const btnImg = this.add.image(sceneCenterX, btnY, 'ui:start_run').setOrigin(0.5)
        const baseScaleRaw = panelWidth / (btnImg.width * 1.6)
        const baseScale = baseScaleRaw * 0.72
        btnImg.setScale(baseScale)

        const glow = this.add.image(btnImg.x, btnImg.y, 'ui:start_run').setOrigin(0.5)
        glow.setScale(baseScale * 1.08)
        glow.setBlendMode(Phaser.BlendModes.ADD)
        glow.setTint(0x99ccff)
        glow.setAlpha(0)

        const btnZone = this.add.zone(btnImg.x, btnImg.y, btnImg.width * baseScale, btnImg.height * baseScale)
          .setOrigin(0.5)

        const setBtnState = (state: 'idle' | 'hover' | 'pressed' | 'disabled') => {
          if (state === 'idle') {
            btnImg.setScale(baseScale)
            btnImg.clearTint()
            glow.setAlpha(0)
          } else if (state === 'hover') {
            btnImg.setScale(baseScale * 1.06)
            btnImg.setTint(0xbfd6ff)
            glow.setAlpha(0.4)
          } else if (state === 'pressed') {
            btnImg.setScale(baseScale * 0.96)
            btnImg.setTint(0xd7e6ff)
            glow.setAlpha(0.55)
          } else if (state === 'disabled') {
            btnImg.setScale(baseScale * 0.96)
            btnImg.setTint(0x9ca3af)
            // Hide glow fully in disabled state so we don't visually suggest two buttons
            glow.setAlpha(0)
          }
        }

        let started = false

        const startRun = async () => {
          if (started) return
          started = true
          setBtnState('disabled')
          btnZone.disableInteractive()
          const cam = this.cameras.main
          cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            void (async () => {
              await gameManager.startRun()
              this.scene.restart()
            })()
          })
          cam.fadeOut(180, 0, 0, 0)
        }

        btnZone.on('pointerover', () => { if (!started) setBtnState('hover') })
        btnZone.on('pointerout', () => { if (!started) setBtnState('idle') })
        btnZone.on('pointerdown', () => { if (!started) setBtnState('pressed') })
        btnZone.on('pointerup', () => { void startRun() })

        const keyboard = this.input.keyboard
        const enterKey = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false)
        if (enterKey) {
          enterKey.on('down', () => { void startRun() })
        }

        // Simple intro animation: fade/slide panel group in from below
        const panelTargets: Phaser.GameObjects.GameObject[] = [panel, title, tips, btnImg]
        panelTargets.forEach(obj => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const o = obj as any
          o.setAlpha(0)
          o.y += 12
        })
        this.tweens.add({
          targets: panelTargets,
          alpha: 1,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          y: '-=12' as any,
          duration: 260,
          ease: 'Quad.out',
          delay: 40,
          onComplete: () => {
            if (!started) {
              setBtnState('idle')
            }
            btnZone.setInteractive({ useHandCursor: true })
          }
        })

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          if (enterKey) {
            enterKey.destroy()
          }
        })

        return
      }

      // Top info: Seed centered top. Only show Combat type (remove biome, stage, type)
      this.add.text(centerX, 8, `Seed: ${run?.seed ?? 'n/a'}`, { fontFamily: 'sans-serif', fontSize: '12px', color: '#7a83c8' }).setOrigin(0.5, 0)

      const stage: StagePlan | null = gameManager.getCurrentStage()

      // Inform host UI whether this stage is immediately autoplay-ready.
      // For choice/unique, we pause until a decision is made and Next Stage is created.
      if (typeof window !== 'undefined') {
        const pauseTypes = new Set(['choice', 'unique'])
        const ready = !(stage && pauseTypes.has(stage.type))
        window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready } }))
      }
      const runItems = gameManager.getRunItems()
      let selectedEnemyImageKey: string | null = null
      let selectedEnemyName: string | null = null
      let selectedEnemyIsBlessed = false
      let selectedEnemyIsBoss = false
      if (stage?.type === 'combat' && stage.combatType) {
        const combatLabel = this.add.text(this.cameras.main.width - 12, 8, `Combat: ${stage.combatType}`, { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff', align: 'right' }).setOrigin(1, 0)
        combatLabel.setAlpha(0)
        this.tweens.add({ targets: combatLabel, alpha: 1, duration: 160, ease: 'Quad.out' })
        const stageNumber = run.stageIndex + run.biomeIndex * 100
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: false } }))
        }
        const biomeId = run.stagePlan.biomeId
        let pool = getEnemiesFor(biomeId, stage.combatType)
        if (pool.length === 0) {
          // Fallback: ignore biome but still respect combatType tags so bosses/minibosses never leak into other modes
          const allDefs = getEnemyDefs()
          if (stage.combatType === 'boss') {
            pool = allDefs.filter(d => d.tags.isBoss)
          } else if (stage.combatType === 'miniboss') {
            pool = allDefs.filter(d => d.tags.isMiniboss)
          } else if (stage.combatType === 'multi') {
            pool = allDefs.filter(d => d.tags.isMulti && !d.tags.isBoss && !d.tags.isMiniboss)
          } else {
            // single combat fallback: any non-boss, non-miniboss, non-multi enemy from any biome
            pool = allDefs.filter(d => !d.tags.isBoss && !d.tags.isMiniboss && !d.tags.isMulti)
          }
        }
        if (pool.length > 0) {
          const idx = ((): number => {
            let h = 2166136261 >>> 0
            const str = `${run.seed}|${stageNumber}`
            for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
            return (h >>> 0) % pool.length
          })()
          const def = pool[idx]
          selectedEnemyImageKey = def.imageKey
          selectedEnemyName = def.displayName
          selectedEnemyIsBlessed = !!def.tags.isBlessed
          selectedEnemyIsBoss = !!def.tags.isBoss
        }
        if (selectedEnemyName) {
          const enemyLabel = this.add.text(this.cameras.main.width - 12, 26, `Enemy: ${selectedEnemyName}`, { fontFamily: 'monospace', fontSize: '12px', color: '#9db0ff', align: 'right' }).setOrigin(1, 0).setDepth(50)
          enemyLabel.setAlpha(0)
          this.tweens.add({ targets: enemyLabel, alpha: 1, duration: 160, ease: 'Quad.out', delay: 40 })
        }
        // Global blessing of bosses from unique events
        if (stage.combatType === 'boss' && gameManager.areGlobalBossesBlessed()) {
          selectedEnemyIsBlessed = true
        }
      }

      // Items panel (stacked icons with quantity badge)
      const itemsTitle = this.add.text(16, 16, 'Run Items', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' })
      const itemsW = 165
      const itemsH = 120
      this.add.rectangle(12, 12, itemsW, itemsH, 0x0f1226, 0.8).setOrigin(0)
      this.add.rectangle(12, 12, itemsW, itemsH).setStrokeStyle(1, 0x2a2f55).setOrigin(0)
      itemsTitle.setDepth(1)
      // Compact expand control near title (kept away from pager)
      const expandBtn = this.add.text(itemsTitle.x + itemsTitle.displayWidth + 6, 16, '⛶', { fontFamily: 'sans-serif', fontSize: '12px', color: '#9db0ff' })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
      expandBtn.on('pointerdown', () => openItemsModal())

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
      // Compute visible rows based on panel height (minus title area)
      const itemsAreaH = Math.max(0, itemsH - 28)
      const rowsVisible = Math.max(1, Math.floor((itemsAreaH + gap) / (tileSize + gap)))
      let pageIndex = 0

      // Mask to keep items contained within panel border
      const maskGraphics = this.add.graphics()
      maskGraphics.fillStyle(0xffffff, 1)
      maskGraphics.fillRect(12, 36, itemsW, itemsAreaH)
      maskGraphics.setVisible(false)
      const geomMask = maskGraphics.createGeometryMask()
      itemsGroup.setMask(geomMask)
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
        const effective = summarizeItems(gameManager.getEffectiveRunItems())
        const raw = summarizeItems(gameManager.getRunItems())
        const blessedSet = new Set(gameManager.getBlessedItems())
        const pageSize = cols * rowsVisible
        const totalPages = Math.max(1, Math.ceil(effective.length / pageSize))
        pageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1)
        const start = pageIndex * pageSize
        const slice = effective.slice(start, start + pageSize)
        if (slice.length === 0) {
          itemsGroup.add(
            that.add.text(4, 0, 'None', { fontFamily: 'monospace', fontSize: '12px', color: '#b3c0ff' })
          )
          return
        }
        slice.forEach((rec, idx) => {
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
          const rawCount = raw.find(a => a.id === rec.id)?.count ?? rec.count
          const isBlessed = blessedSet.has(rec.id)
          if (rec.count > 0) {
            const badgeColor = isBlessed ? 0x6a5200 : 0x111842
            const strokeColor = isBlessed ? 0xd4af37 : 0x3a428a
            const textColor = isBlessed ? '#ffd166' : '#b3c0ff'
            const badge = that.add.rectangle(x + tileSize - 10, y + tileSize - 10, 18, 12, badgeColor, 1).setOrigin(0.5)
            badge.setStrokeStyle(1, strokeColor)
            const qty = that.add.text(badge.x, badge.y, String(rec.count), { fontFamily: 'monospace', fontSize: '10px', color: textColor }).setOrigin(0.5)
            itemsGroup.add(badge)
            itemsGroup.add(qty)
            if (isBlessed && rawCount !== rec.count) {
              // small golden dot indicator for blessed
              const dot = that.add.rectangle(x + tileSize - 2, y + 2, 4, 4, 0xd4af37, 1).setOrigin(1, 0)
              itemsGroup.add(dot)
            }
          }
          // Click to open expanded modal with this item pre-selected
          const tileHit = that.add.zone(x, y, tileSize, tileSize).setOrigin(0).setInteractive({ useHandCursor: true })
          tileHit.on('pointerup', () => openItemsModal(rec.id))
          itemsGroup.add(tileHit)
        })
      }
      const that = this
      function getTotalPages(): number {
        const effective = summarizeItems(gameManager.getEffectiveRunItems())
        const pageSize = cols * rowsVisible
        return Math.max(1, Math.ceil(effective.length / pageSize))
      }

      // Pager controls (up/down) inside the panel on the right edge
      const upBtn = this.add.text(12 + itemsW - 10, 16 + 4, '▲', { fontFamily: 'sans-serif', fontSize: '10px', color: '#9db0ff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
      const downBtn = this.add.text(12 + itemsW - 10, 12 + itemsH - 14, '▼', { fontFamily: 'sans-serif', fontSize: '10px', color: '#9db0ff' }).setOrigin(1, 1).setInteractive({ useHandCursor: true })
      upBtn.on('pointerdown', () => {
        if (pageIndex > 0) { pageIndex -= 1; renderItemsPanel(); updatePager(getTotalPages()) }
      })
      downBtn.on('pointerdown', () => {
        const all = summarizeItems(gameManager.getEffectiveRunItems())
        const pageSize = cols * rowsVisible
        const totalPages = Math.max(1, Math.ceil(all.length / pageSize))
        if (pageIndex < totalPages - 1) { pageIndex += 1; renderItemsPanel(); updatePager(totalPages) }
      })
      function updatePager(totalPages: number): void {
        const canUp = pageIndex > 0
        const canDown = pageIndex < totalPages - 1
        upBtn.setAlpha(canUp ? 1 : 0.35).setInteractive(canUp)
        downBtn.setAlpha(canDown ? 1 : 0.35).setInteractive(canDown)
      }

      // Initial render after pager exists
      renderItemsPanel()
      updatePager(getTotalPages())

      // (Expand control moved next to the title)

      function openItemsModal(preselectId?: string): void {
        const camW = that.cameras.main.width
        const camH = that.cameras.main.height
        const overlay = that.add.rectangle(0, 0, camW, camH, 0x000000, 0.5).setOrigin(0).setInteractive().setDepth(1000)
        const w = Math.min(560, camW - 32)
        const h = Math.min(420, Math.max(300, camH - 120))
        const panel = that.add.rectangle(camW / 2, camH / 2, w, h, 0x0f1226, 1).setOrigin(0.5).setDepth(1001)
        panel.setStrokeStyle(1, 0x2a2f55)
        const title = that.add.text(panel.x - w / 2 + 12, panel.y - h / 2 + 8, 'Run Items', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setDepth(1002)
        const close = that.add.text(panel.x + w / 2 - 12, panel.y - h / 2 + 8, '✕', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(1002)
        const gridX = panel.x - w / 2 + 12
        const gridY = panel.y - h / 2 + 34
        const gridW = w - 24
        const gridH = Math.max(120, h - 34 - 48)
        const grid = that.add.container(gridX, gridY).setDepth(1002)
        const info = that.add.text(panel.x - w / 2 + 12, panel.y + h / 2 - 20, 'Click an item for details', { fontFamily: 'monospace', fontSize: '12px', color: '#9db0ff' }).setOrigin(0, 1).setDepth(1002)
        const blessedSet = new Set(gameManager.getBlessedItems())
        const data = summarizeItems(gameManager.getEffectiveRunItems())
        const M = 6
        const T = 48
        const C = Math.max(4, Math.floor((gridW - 0) / (T + M)))
        const rowsVisible = Math.max(1, Math.floor((gridH + M) / (T + M)))
        const pageSize = C * rowsVisible
        let pageIndexModal = 0
        let selectedId: string | null = null
        if (preselectId) {
          const idx = data.findIndex(r => r.id === preselectId)
          if (idx >= 0) {
            selectedId = preselectId
            pageIndexModal = Math.floor(idx / pageSize)
          }
        }

        // Mask to clip grid contents
        const maskG = that.add.graphics().setDepth(1002)
        maskG.fillStyle(0xffffff, 1)
        maskG.fillRect(gridX, gridY, gridW, gridH)
        maskG.setVisible(false)
        const gridMask = maskG.createGeometryMask()
        grid.setMask(gridMask)

        // Pager buttons inside modal
        const upM = that.add.text(panel.x + w / 2 - 12, gridY + 2, '▲', { fontFamily: 'sans-serif', fontSize: '12px', color: '#9db0ff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(1002)
        const downM = that.add.text(panel.x + w / 2 - 12, gridY + gridH - 2, '▼', { fontFamily: 'sans-serif', fontSize: '12px', color: '#9db0ff' }).setOrigin(1, 1).setInteractive({ useHandCursor: true }).setDepth(1002)

        function updatePagerModal(): void {
          const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
          upM.setAlpha(pageIndexModal > 0 ? 1 : 0.35).setInteractive(pageIndexModal > 0)
          downM.setAlpha(pageIndexModal < totalPages - 1 ? 1 : 0.35).setInteractive(pageIndexModal < totalPages - 1)
        }

        function renderModalPage(): void {
          grid.removeAll(true)
          const start = pageIndexModal * pageSize
          const slice = data.slice(start, start + pageSize)
          slice.forEach((rec, idx) => {
            const r = Math.floor(idx / C)
            const c = idx % C
            const tx = c * (T + M)
            const ty = r * (T + M)
            const tile = that.add.container(tx, ty).setDepth(1002)
            const isBlessed = blessedSet.has(rec.id)
            const box = that.add.rectangle(0, 0, T, T, 0x0b0e1a, 1).setOrigin(0).setDepth(1002)
            box.setStrokeStyle(1, 0x2a2f55)
            tile.add(box)
            const def = itemRegistry.get(rec.id)
            const imgKey = resolveItemImgKey(rec.id)
            if (imgKey && that.textures.exists(imgKey)) {
              const img = that.add.image(T / 2, T / 2, imgKey).setOrigin(0.5).setDepth(1002)
              const max = T - 8
              const sw = max / img.width
              const sh = max / img.height
              img.setScale(Math.min(sw, sh))
              tile.add(img)
            } else {
              const label = (def?.name ?? rec.id).slice(0, 2).toUpperCase()
              const txt = that.add.text(T / 2, T / 2, label, { fontFamily: 'monospace', fontSize: '12px', color: '#e5e7ff' }).setOrigin(0.5).setDepth(1002)
              tile.add(txt)
            }
            if (rec.count > 0) {
              const badgeColor = isBlessed ? 0x6a5200 : 0x111842
              const strokeColor = isBlessed ? 0xd4af37 : 0x3a428a
              const textColor = isBlessed ? '#ffd166' : '#b3c0ff'
              const badge = that.add.rectangle(T - 10, T - 10, 18, 12, badgeColor, 1).setOrigin(0.5).setDepth(1002)
              badge.setStrokeStyle(1, strokeColor)
              const qty = that.add.text(badge.x, badge.y, String(rec.count), { fontFamily: 'monospace', fontSize: '10px', color: textColor }).setOrigin(0.5).setDepth(1002)
              tile.add(badge); tile.add(qty)
            }
            const name = def?.name ?? rec.id
            const desc = def?.description ?? 'No description'

            const applyStyles = (hovered: boolean, selected: boolean) => {
              const scale = selected ? 1.08 : hovered ? 1.04 : 1.0
              tile.setScale(scale)
              const stroke = selected ? 0x6aa6ff : hovered ? 0x3a5fd1 : 0x2a2f55
              box.setStrokeStyle(1, stroke)
              const fill = selected ? 0x121a3a : hovered ? 0x0f1631 : 0x0b0e1a
              box.fillColor = fill
            }
            const isSelected = selectedId === rec.id
            applyStyles(false, isSelected)
            if (isSelected) {
              const titleLine = isBlessed ? `${name}  x${rec.count} (BLESSED)` : `${name}  x${rec.count}`
              info.setColor(isBlessed ? '#ffd166' : '#9db0ff')
              info.setText(`${titleLine}\n${desc}`)
            }

            const hit = that.add.zone(0, 0, T, T).setOrigin(0).setInteractive().setDepth(1003)
            hit.on('pointerover', () => { if (!isSelected) applyStyles(true, false) })
            hit.on('pointerout', () => { const selected = selectedId === rec.id; applyStyles(false, selected) })
            hit.on('pointerdown', () => { tile.setScale((isSelected ? 1.08 : 1.04) * 0.98) })
            hit.on('pointerup', () => {
              selectedId = rec.id
              const titleLine = isBlessed ? `${name}  x${rec.count} (BLESSED)` : `${name}  x${rec.count}`
              info.setColor(isBlessed ? '#ffd166' : '#9db0ff')
              info.setText(`${titleLine}\n${desc}`)
              renderModalPage()
              updatePagerModal()
            })
            tile.add(hit)

            grid.add(tile)
          })
        }

        upM.on('pointerdown', () => { if (pageIndexModal > 0) { pageIndexModal -= 1; renderModalPage(); updatePagerModal() } })
        downM.on('pointerdown', () => {
          const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
          if (pageIndexModal < totalPages - 1) { pageIndexModal += 1; renderModalPage(); updatePagerModal() }
        })

        function closeAll() {
          overlay.destroy(); panel.destroy(); title.destroy(); close.destroy(); grid.destroy(); info.destroy(); upM.destroy(); downM.destroy(); maskG.destroy()
        }
        // If a selection was provided, prime info text now
        if (selectedId) {
          const sel = data.find(r => r.id === selectedId)
          if (sel) {
            const def = itemRegistry.get(sel.id)
            const name = def?.name ?? sel.id
            const desc = def?.description ?? 'No description'
            const isBlessed = blessedSet.has(sel.id)
            const titleLine = isBlessed ? `${name}  x${sel.count} (BLESSED)` : `${name}  x${sel.count}`
            info.setColor(isBlessed ? '#ffd166' : '#9db0ff')
            info.setText(`${titleLine}\n${desc}`)
          }
        }
        renderModalPage(); updatePagerModal()
        overlay.on('pointerdown', closeAll)
        close.on('pointerdown', closeAll)
      }

      // Arena frame (center area)
      const frame = this.add.image(centerX, centerY + 115, 'ui:game_frame').setOrigin(0.5)
      const targetFrameW = 420
      const sFrame = targetFrameW / frame.width
      frame.setScale(sFrame)
      frame.setDepth(20)

      const placeFramedImage = (key: string): Phaser.GameObjects.Image | null => {
        if (!this.textures.exists(key)) return null
        const img = this.add.image(frame.x, frame.y + frame.displayHeight * 0.20, key).setOrigin(0.5, 1)
        const maxW = frame.displayWidth * 0.97
        const maxH = frame.displayHeight * 0.74
        const sw = maxW / img.width
        const sh = maxH / img.height
        img.setScale(Math.min(sw, sh))
        img.setDepth(10)
        return img
      }

      // Place enemy inside transparent window of frame
      let enemySprite: Phaser.GameObjects.Image | null = null
      if (stage?.type === 'combat') {
        const enemyKey = selectedEnemyImageKey
        if (enemyKey) {
          enemySprite = placeFramedImage(enemyKey)
          if (selectedEnemyIsBlessed && enemySprite) {
            enemySprite.setTint(0xffd166)
            const glow = this.add.image(enemySprite.x, enemySprite.y, enemyKey).setOrigin(0.5, 1)
            glow.setScale(enemySprite.scale * 1.04)
            glow.setBlendMode(Phaser.BlendModes.ADD)
            glow.setTint(0xffe29f)
            glow.setAlpha(0.35)
            glow.setDepth(9)
          }
        }
      }

      // Place player character near bottom inside frame
      let playerKey = this.playerKeys[0]
      const selectedSprite = useAppState.getState().player.characterSprite
      if (selectedSprite && this.textures.exists(selectedSprite)) {
        playerKey = selectedSprite
      }
      if (playerKey) {
        const p = this.add.image(frame.x, frame.y + frame.displayHeight * 0.30, playerKey).setOrigin(0.5, 1)
        const maxPW = frame.displayWidth * 0.20
        const maxPH = frame.displayHeight * 0.22
        const spw = maxPW / p.width
        const sph = maxPH / p.height
        p.setScale(Math.min(spw, sph))
        p.setDepth(30)
      }

      // Battle Log panel
      const panelX = 12
      const panelY = 12 + itemsH + 10
      const panelW = Math.floor(itemsW)
      const panelH = 300
      this.add.rectangle(panelX, panelY, panelW, panelH, 0x0f1226, 0.8).setOrigin(0)
      this.add.rectangle(panelX, panelY, panelW, panelH).setStrokeStyle(1, 0x2a2f55).setOrigin(0)
      this.add.text(panelX + 4, panelY + 4, 'Battle Log', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' })

      // Text area is clipped to stay inside the panel
      const logClipTop = panelY + 24
      const logClipHeight = panelH - (logClipTop - panelY) - 4
      const logTextObj = this.add.text(panelX + 4, logClipTop, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#b3c0ff',
        lineSpacing: 2,
        wordWrap: { width: panelW - 8 },
      }).setOrigin(0)
      logTextObj.setAlpha(0)
      const logMaskG = this.add.graphics()
      logMaskG.fillStyle(0xffffff, 1)
      logMaskG.fillRect(panelX, logClipTop, panelW, logClipHeight)
      logMaskG.setVisible(false)
      const logMask = logMaskG.createGeometryMask()
      logTextObj.setMask(logMask)

      // Lightweight log buffer and on-screen log
      const scene = this
      let logBuffer = ''
      function updateLog(text: string, _toBottom = true) {
        logBuffer = text
        logTextObj.setText(text)
        if (logTextObj.alpha < 1) {
          scene.tweens.add({
            targets: logTextObj,
            alpha: 1,
            duration: 200,
            ease: 'Quad.out'
          })
        }
      }

      // Helper: tween enemy sprite and battle log out, then advance to next stage
      const tweenEnemyAndAdvance = async () => {
        if (isAdvancingStage) return
        isAdvancingStage = true
        let advanced = false
        const doAdvance = async () => {
          if (advanced) return
          advanced = true
          await gameManager.advance()
          this.scene.restart()
        }

        if (enemySprite) {
          this.tweens.add({
            targets: enemySprite,
            alpha: 0,
            y: enemySprite.y + 16,
            duration: 180,
            ease: 'Quad.out',
            onComplete: () => { void doAdvance() }
          })
        }

        this.tweens.add({
          targets: logTextObj,
          alpha: 0,
          duration: 160,
          ease: 'Quad.out',
          onComplete: () => { if (!enemySprite) void doAdvance() }
        })
      }

      // Boss fight presentation state (slow, turn-based over autoplay ticks)
      let bossSteps: Array<{ lines: string[]; bossHp: number }> | null = null
      let bossStepIndex = 0
      let bossMaxHp = 1
      let bossHpBarFill: Phaser.GameObjects.Rectangle | null = null

      const advanceBossStep = () => {
        if (!bossSteps || bossStepIndex >= bossSteps.length) return
        const step = bossSteps[bossStepIndex]
        const cur = logBuffer ? `${logBuffer}\n` : ''
        updateLog(cur + step.lines.join('\n'))
        if (bossHpBarFill && bossMaxHp > 0) {
          const pct = Math.max(0, Math.min(1, step.bossHp / bossMaxHp))
          bossHpBarFill.scaleX = pct
        }
        bossStepIndex += 1
      }

      const onAutoPlayAdvance = () => {
        // If a boss fight is in progress, each autoplay tick advances one "turn" of the boss log
        if (bossSteps && bossStepIndex < bossSteps.length) {
          advanceBossStep()
          // When the final step has been revealed, bossSteps will be cleared by the combat
          return
        }
        if (!canAutoAdvance || !goNextStage || isAdvancingStage) return
        goNextStage()
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('game:autoplay-advance', onAutoPlayAdvance as EventListener)
      }
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('game:autoplay-advance', onAutoPlayAdvance as EventListener)
        }
      })

      // If this is a combat stage, auto-start combat immediately
      if (stage?.type === 'combat' && run) {
        const stageNumber = run.stageIndex + run.biomeIndex * 100
        // Anchor positions aligned to frame bottom and scaled with frame
        const bottomY = frame.y + frame.displayHeight / 2.27
        const slotOffset = 220 * sFrame
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
          img.setScale(base * 0.9)
          img.setAlpha(0)
          img.setInteractive({ useHandCursor: true })
          img.on('pointerover', () => { img.setScale(base * 1.03); img.setTint(0xbfd6ff); glow.setAlpha(0.35) })
          img.on('pointerout', () => { img.setScale(base); img.clearTint(); glow.setAlpha(0) })
          img.on('pointerdown', () => { img.setScale(base * 0.98); img.setTint(0xd7e6ff); glow.setAlpha(0.45) })
          img.on('pointerup', () => { img.setScale(base * 1.03); img.setTint(0xbfd6ff); glow.setAlpha(0.35); onUp() })

          this.tweens.add({
            targets: img,
            alpha: 1,
            scale: base,
            duration: 180,
            ease: 'Back.out',
            delay: 40
          })

          return img
        }

        const resolveCombat = async (): Promise<void> => {
          let result: { outcome: 'win'|'loss'; log: string[]; enemiesKilled: number }
          if (stage.combatType === 'boss' && selectedEnemyIsBoss) {
            // Boss fights are pre-resolved but revealed slowly as "turns" on each autoplay tick.
            result = await runMiniBoss(run.seed, stageNumber, gameManager.getRunItems(), { enemyBlessed: selectedEnemyIsBlessed, role: 'boss' })

            // Build a simple HP bar at the top-center of the game view
            if (!bossHpBarFill) {
              const barW = this.cameras.main.width * 0.48
              const barH = 12
              const barX = this.cameras.main.width / 2
              const barY = 32
              const bg = this.add.rectangle(barX, barY, barW, barH, 0x111827, 0.9)
                .setOrigin(0.5)
                .setDepth(300)
              bg.setStrokeStyle(1, 0x4b5563)
              bossHpBarFill = this.add.rectangle(barX - barW / 2, barY, barW, barH - 3, 0x22c55e, 1)
                .setOrigin(0, 0.5)
                .setDepth(301)
            }

            // Parse log into steps keyed by boss HP lines
            const steps: Array<{ lines: string[]; bossHp: number }> = []
            let currentLines: string[] = []
            let lastHp = 0
            const hpRegex = /Boss HP:\s*(\d+)/i
            for (const line of result.log) {
              currentLines.push(line)
              const m = hpRegex.exec(line)
              if (m) {
                lastHp = parseInt(m[1] ?? '0', 10) || 0
                steps.push({ lines: currentLines, bossHp: lastHp })
                currentLines = []
              }
            }
            if (currentLines.length > 0) {
              steps.push({ lines: currentLines, bossHp: lastHp })
            }
            bossSteps = steps.length > 0 ? steps : null
            bossStepIndex = 0
            bossMaxHp = bossSteps && bossSteps.length > 0 ? Math.max(...bossSteps.map(s => s.bossHp)) || 1 : 1
            if (bossHpBarFill) {
              bossHpBarFill.scaleX = 1
            }

            const onBossFinished = async () => {
              const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
              const cur = logBuffer ? `${logBuffer}\n` : ''
              updateLog(cur + `Outcome: ${outcomeText}`)
              void recordBattleStats(result.enemiesKilled, stageNumber)
              gameManager.addEnemiesKilled(result.enemiesKilled)
              if (result.outcome === 'win') {
                void markMyIntroDone()
                gameManager.incBossDefeated()
                if (selectedEnemyIsBlessed) {
                  const rng = fromSeed(`${run.seed}|${stageNumber}|bless`)
                  const roll = rng.next()
                  if (roll < 0.25) {
                    const owned = Array.from(new Set(gameManager.getRunItems().map(it => it.id)))
                    if (owned.length > 0) {
                      const pickIdx = Math.floor(rng.next() * owned.length)
                      const chosen = owned[pickIdx]
                      gameManager.addBlessedItem(chosen)
                      await gameManager.persistStagePlan()
                      renderItemsPanel()
                      const cur2 = logBuffer ? `${logBuffer}\n` : ''
                      updateLog(cur2 + `A golden light washes over you. Your ${chosen} is blessed for this run.`)
                    }
                  }
                }
                // After boss victory, allow advancing
                goNextStage = async () => {
                  if (isAdvancingStage) return
                  isAdvancingStage = true
                  canAutoAdvance = false
                  bossSteps = null
                  bossHpBarFill = null
                  await gameManager.advance()
                  this.scene.restart()
                }
                canAutoAdvance = true
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
                }
                makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
                  if (!goNextStage) return
                  void goNextStage()
                })
              } else {
                const livesLeft = gameManager.decrementLife()
                await gameManager.persistStagePlan()
                const cur3 = logBuffer ? `${logBuffer}\n` : ''
                updateLog(cur3 + `You lost a life. Lives remaining: ${livesLeft}/3`)
                if (livesLeft <= 0) {
                  const cam = this.cameras.main
                  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                    void (async () => {
                      try {
                        const prog = gameManager.getBiomeProgress()
                        const stageIdx = prog.stageIndex ?? 0
                        const xpGained = Math.max(0, 10 + stageIdx * 5)
                        const xpRes = await addMyXp(xpGained)
                        await incMyDeaths(1)
                        const metrics = gameManager.getRunMetrics()
                        const run = gameManager.getRun()
                        const biomesCompleted = prog.biomeIndex != null ? Math.max(0, prog.biomeIndex) : 0
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('profile:changed', { detail: { level: xpRes?.level, xp: xpRes?.xp } }))
                          window.dispatchEvent(new CustomEvent('game:run-ended', {
                            detail: {
                              reason: 'death',
                              xpGained,
                              level: xpRes?.level,
                              xp: xpRes?.xp,
                              metrics,
                              seed: run?.seed,
                              biomeId: stage?.biomeId,
                              stageIndex: run?.stageIndex,
                              biomesCompleted,
                            }
                          }))
                        }
                      } catch {}
                      await completeRunAndMaybeReward()
                      gameManager.resetRun()
                      this.scene.stop('GameScene'); this.scene.start('GameScene')
                    })()
                  })
                  cam.fadeOut(200, 0, 0, 0)
                  return
                }
                // If still have lives, treat as normal loss and allow restarting from next stage
                goNextStage = async () => {
                  if (isAdvancingStage) return
                  isAdvancingStage = true
                  canAutoAdvance = false
                  bossSteps = null
                  bossHpBarFill = null
                  await gameManager.advance()
                  this.scene.restart()
                }
                canAutoAdvance = true
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
                }
                makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
                  if (!goNextStage) return
                  void goNextStage()
                })
              }
            }

            // Immediately reveal the first step so the player sees action without waiting a full interval
            if (bossSteps && bossSteps.length > 0) {
              advanceBossStep()
              // When the last step is consumed, finish the boss fight effects
              const checkInterval = this.time.addEvent({
                delay: 200,
                callback: () => {
                  if (!bossSteps || bossStepIndex < bossSteps.length) return
                  checkInterval.remove(false)
                  void onBossFinished()
                },
                loop: true,
              })
            } else {
              // Fallback: if something went wrong, just apply outcome immediately
              await onBossFinished()
            }
          } else {
            if (stage.combatType === 'single') {
              result = await runSingleCombat(run.seed, stageNumber, runItems, { enemyBlessed: selectedEnemyIsBlessed })
            } else if (stage.combatType === 'multi') {
              result = await runMultiCombat(run.seed, stageNumber, runItems, { enemyBlessed: selectedEnemyIsBlessed })
            } else if (stage.combatType === 'miniboss') {
              result = await runMiniBoss(run.seed, stageNumber, gameManager.getRunItems(), { enemyBlessed: selectedEnemyIsBlessed, role: 'miniboss' })
            } else {
              result = await runSingleCombat(run.seed, stageNumber, gameManager.getRunItems(), { enemyBlessed: selectedEnemyIsBlessed })
            }
            const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
            updateLog([`Outcome: ${outcomeText}`, '', ...result.log].join('\n'))
            void recordBattleStats(result.enemiesKilled, stageNumber)
            gameManager.addEnemiesKilled(result.enemiesKilled)
            if (result.outcome === 'win') {
              if (stage.combatType === 'miniboss') gameManager.incMinibossDefeated()
              // Blessed enemy reward: 25% chance to bless a random owned item for the remainder of the run
              if (selectedEnemyIsBlessed) {
                const rng = fromSeed(`${run.seed}|${stageNumber}|bless`)
                const roll = rng.next()
                if (roll < 0.25) {
                  const owned = Array.from(new Set(gameManager.getRunItems().map(it => it.id)))
                  if (owned.length > 0) {
                    const pickIdx = Math.floor(rng.next() * owned.length)
                    const chosen = owned[pickIdx]
                    gameManager.addBlessedItem(chosen)
                    await gameManager.persistStagePlan()
                    renderItemsPanel()
                    const cur = logBuffer ? `${logBuffer}\\n` : ''
                    updateLog(cur + `A golden light washes over you. Your ${chosen} is blessed for this run.`)
                  }
                }
              }
            }
            if (result.outcome === 'loss') {
              const livesLeft = gameManager.decrementLife()
              await gameManager.persistStagePlan()
              const cur = logBuffer ? `${logBuffer}\\n` : ''
              updateLog(cur + `You lost a life. Lives remaining: ${livesLeft}/3`)
              if (livesLeft <= 0) {
                const cam = this.cameras.main
                cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                  void (async () => {
                    try {
                      const prog = gameManager.getBiomeProgress()
                      const stageIdx = prog.stageIndex ?? 0
                      const xpGained = Math.max(0, 10 + stageIdx * 5)
                      const xpRes = await addMyXp(xpGained)
                      await incMyDeaths(1)
                      const metrics = gameManager.getRunMetrics()
                      const run = gameManager.getRun()
                      const biomesCompleted = prog.biomeIndex != null ? Math.max(0, prog.biomeIndex) : 0
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('profile:changed', { detail: { level: xpRes?.level, xp: xpRes?.xp } }))
                        window.dispatchEvent(new CustomEvent('game:run-ended', {
                          detail: {
                            reason: 'death',
                            xpGained,
                            level: xpRes?.level,
                            xp: xpRes?.xp,
                            metrics,
                            seed: run?.seed,
                            biomeId: stage?.biomeId,
                            stageIndex: run?.stageIndex,
                            biomesCompleted,
                          }
                        }))
                      }
                    } catch {}
                    await completeRunAndMaybeReward()
                    gameManager.resetRun()
                    this.scene.stop('GameScene'); this.scene.start('GameScene')
                  })()
                })
                cam.fadeOut(200, 0, 0, 0)
                return
              }
            }
            // After resolution, show Next Stage button and allow advancing.
            // tweenEnemyAndAdvance already guards on isAdvancingStage, so we don't duplicate it here.
            goNextStage = async () => {
              canAutoAdvance = false
              await tweenEnemyAndAdvance()
            }
            canAutoAdvance = true
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
            }
            makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
              if (!goNextStage) return
              void goNextStage()
            })
          }
        }
        void resolveCombat()
      } else if (stage?.type === 'choice' && run) {
        // Present seeded choice options (2-3)
        const prog = gameManager.getBiomeProgress()
        const biomeIndex = prog.biomeIndex ?? run.biomeIndex ?? 0
        const stageNumber = run.stageIndex + biomeIndex * 100
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: false } }))
        }
        const choiceOptions = pickChoiceOptions(run.seed, stageNumber, { biomeIndex })
        if (!choiceOptions || choiceOptions.length === 0) {
          // Safety: if no choices can be generated, treat this as an empty room and advance.
          const cur = logBuffer ? `${logBuffer}\n` : ''
          updateLog(cur + 'You pass through a quiet stretch of the biome. Nothing answers your presence.')
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
          goNextStage = async () => {
            if (isAdvancingStage) return
            isAdvancingStage = true
            canAutoAdvance = false
            await gameManager.advance()
            this.scene.restart()
          }
          canAutoAdvance = true
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
          }
          makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
            if (!goNextStage) return
            void goNextStage()
          })
          return
        }
        // Position higher so bottom Start/Next slots remain untouched
        const btnYStart = centerY - 24
        const spacing = 32

        // Description box for hovered choice
        const descWidth = Math.min(420 * sFrame, this.cameras.main.width - 40)
        const descY = btnYStart + Math.max(choiceOptions.length, 2) * spacing + 12
        const descBg = this.add.rectangle(centerX, descY, descWidth, 52, 0x020617, 0.9)
          .setOrigin(0.5)
          .setDepth(110)
        descBg.setStrokeStyle(1, 0x1f2937)
        descBg.setAlpha(0)
        const descText = this.add.text(centerX - descWidth / 2 + 10, descY - 18, 'Hover a choice to see details', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#cbd5f5',
          wordWrap: { width: descWidth - 20 },
        }).setOrigin(0, 0).setDepth(111)
        descText.setAlpha(0)

        const showChoiceDescription = (text: string) => {
          descText.setText(text)
          if (descBg.alpha < 1 || descText.alpha < 1) {
            this.tweens.add({
              targets: [descBg, descText],
              alpha: 1,
              duration: 160,
              ease: 'Quad.out',
            })
          }
        }

        const buttons: Phaser.GameObjects.Text[] = choiceOptions.map((opt: any, i: number) => {
          const btn = this.add.text(centerX, btnYStart + i * spacing, `${opt.title}`, { fontFamily: 'sans-serif', fontSize: '14px', color: '#cfe1ff', backgroundColor: '#101531' }).setPadding(10, 6, 10, 6).setOrigin(0.5).setDepth(120)
          btn.setInteractive({ useHandCursor: true })
          btn.setStroke('#2a2f55', 1)
          btn.setAlpha(0)
          btn.y += 6
          this.tweens.add({
            targets: btn,
            alpha: 1,
            y: btn.y - 6,
            duration: 200,
            ease: 'Quad.out',
            delay: i * 30
          })
          btn.on('pointerover', () => {
            btn.setScale(1.05).setAlpha(0.98); (btn as any).setTint?.(0xbfd6ff)
            if (opt.description) {
              showChoiceDescription(opt.description)
            }
          })
          btn.on('pointerout', () => { btn.setScale(1.0).setAlpha(1); (btn as any).clearTint?.() })
          btn.on('pointerdown', async () => {
            // disable all buttons to avoid double-choose
            buttons.forEach((b: Phaser.GameObjects.Text) => b.disableInteractive().setAlpha(0.5))
            const before = gameManager.getRunItems()
            const beforeTotal = before.reduce((a: number, it: { stacks?: number }) => a + (it.stacks ?? 0), 0)
            const outcome = await opt.resolve(run.seed, stageNumber, before)
            if (outcome.updatedRunItems) {
              const after = outcome.updatedRunItems
              const afterTotal = after.reduce((a: number, it: { stacks?: number }) => a + (it.stacks ?? 0), 0)
              const delta = afterTotal - beforeTotal
              if (delta > 0) gameManager.addItemsGained(delta)
              gameManager.setRunItems(after)
              renderItemsPanel()
              // Persist run items so changes survive reloads
              await gameManager.persistRunItems()
            }
            if (Array.isArray(outcome.log) && outcome.log.length > 0) {
              const cur = logBuffer ? `${logBuffer}\n` : ''
              updateLog(cur + outcome.log.join('\n'))
            }
            if (typeof outcome.poorDelta === 'number' && outcome.poorDelta !== 0) {
              void recordChoiceStats(outcome.poorDelta)
            }
            if (outcome.triggerMiniboss) {
              const result = await runMiniBoss(run.seed, stageNumber, gameManager.getRunItems())
              const outcomeText = result.outcome === 'win' ? 'Victory!' : 'Defeat'
              const cur = logBuffer ? `${logBuffer}\n` : ''
              updateLog(cur + [`Mini-boss Outcome: ${outcomeText}`, '', ...result.log].join('\n'))
              void recordBattleStats(result.enemiesKilled, stageNumber)
              gameManager.addEnemiesKilled(result.enemiesKilled)
              if (result.outcome === 'win') gameManager.incMinibossDefeated()
              if (result.outcome === 'loss') {
                const livesLeft = gameManager.decrementLife()
                await gameManager.persistStagePlan()
                const cur2 = logBuffer ? `${logBuffer}\n` : ''
                updateLog(cur2 + `You lost a life. Lives remaining: ${livesLeft}/3`)
                if (livesLeft <= 0) {
                  const cam = this.cameras.main
                  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                    void (async () => {
                      try {
                        const prog = gameManager.getBiomeProgress()
                        const stageIdx = prog.stageIndex ?? 0
                        const xpGained = Math.max(0, 10 + stageIdx * 5)
                        const xpRes = await addMyXp(xpGained)
                        await incMyDeaths(1)
                        const metrics = gameManager.getRunMetrics()
                        const run = gameManager.getRun()
                        const biomesCompleted = prog.biomeIndex != null ? Math.max(0, prog.biomeIndex) : 0
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('profile:changed', { detail: { level: xpRes?.level, xp: xpRes?.xp } }))
                          window.dispatchEvent(new CustomEvent('game:run-ended', {
                            detail: {
                              reason: 'death',
                              xpGained,
                              level: xpRes?.level,
                              xp: xpRes?.xp,
                              metrics,
                              seed: run?.seed,
                              biomeId: stage?.biomeId,
                              stageIndex: run?.stageIndex,
                              biomesCompleted,
                            }
                          }))
                        }
                      } catch {}
                      await completeRunAndMaybeReward()
                      gameManager.resetRun()
                      this.scene.stop('GameScene'); this.scene.start('GameScene')
                    })()
                  })
                  cam.fadeOut(200, 0, 0, 0)
                }
              }
            }
            if (outcome.triggerBoss && stage) {
              stage.forceNextBoss = true
              await gameManager.persistStagePlan()
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
            goNextStage = async () => {
              if (isAdvancingStage) return
              isAdvancingStage = true
              canAutoAdvance = false
              await gameManager.advance()
              this.scene.restart()
            }
            canAutoAdvance = true
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
            }
            makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
              if (!goNextStage) return
              void goNextStage()
            })
          })
          return btn
        })
        updateLog('Make a choice...', false)
      } else if (stage?.type === 'unique' && run) {
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

        const uniqueId = stage.uniqueId
        if (uniqueId === 'pedestal_duplicate') {
          const desc = "You encounter a strange pedestal in the middle of nowhere. You've heard stories that they can duplicate whatever's placed on top of them."
          const cur = logBuffer ? `${logBuffer}\n` : ''
          updateLog(cur + desc)
          const pillar = placeFramedImage('unique:pillar')
          if (pillar) {
            pillar.setAlpha(0)
            this.tweens.add({ targets: pillar, alpha: 1, duration: 260, ease: 'Quad.out' })
          }

            const itemsNow = gameManager.getRunItems()
            if (itemsNow.length === 0) {
              const cur2 = logBuffer ? `${logBuffer}\n` : ''
              updateLog(cur2 + 'You have no items to duplicate.')
              goNextStage = async () => {
                if (isAdvancingStage) return
                isAdvancingStage = true
                canAutoAdvance = false
                await gameManager.advance()
                this.scene.restart()
              }
              canAutoAdvance = true
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
              }
              makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
                if (!goNextStage) return
                void goNextStage()
              })
          } else {
            const that = this
            const camW = that.cameras.main.width
            const camH = that.cameras.main.height
            const overlay = that.add.rectangle(0, 0, camW, camH, 0x000000, 0.5).setOrigin(0).setInteractive().setDepth(1000)
            const w = Math.min(560, camW - 32)
            const h = Math.min(420, Math.max(300, camH - 120))
            const panel = that.add.rectangle(camW / 2, camH / 2, w, h, 0x0f1226, 1).setOrigin(0.5).setDepth(1001)
            panel.setStrokeStyle(1, 0x2a2f55)
            const title = that.add.text(panel.x - w / 2 + 12, panel.y - h / 2 + 8, 'Select an item to duplicate', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setDepth(1002)
            const close = that.add.text(panel.x + w / 2 - 12, panel.y - h / 2 + 8, '✕', { fontFamily: 'sans-serif', fontSize: '14px', color: '#e5e7ff' }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(1002)
            const grid = that.add.container(panel.x - w / 2 + 12, panel.y - h / 2 + 34).setDepth(1002)
            const data = summarizeItems(gameManager.getRunItems())
            const M = 6
            const T = 48
            const C = Math.max(4, Math.floor((w - 24) / (T + M)))
            const destroyModal = () => { overlay.destroy(); panel.destroy(); title.destroy(); close.destroy(); grid.destroy() }
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
              hit.on('pointerdown', async () => {
                const before = gameManager.getRunItems()
                const beforeTotal = before.reduce((a, it) => a + (it.stacks ?? 0), 0)
                const updated = before.slice()
                updated.push({ id: rec.id, stacks: 1 })
                gameManager.setRunItems(updated)
                const afterTotal = updated.reduce((a, it) => a + (it.stacks ?? 0), 0)
                const delta = afterTotal - beforeTotal
                if (delta > 0) gameManager.addItemsGained(delta)
                renderItemsPanel()
                await gameManager.persistRunItems()
                const cur3 = logBuffer ? `${logBuffer}\n` : ''
                updateLog(cur3 + `The pedestal hums. Your ${rec.id} is duplicated.`)
                destroyModal()
                goNextStage = async () => {
                  if (isAdvancingStage) return
                  isAdvancingStage = true
                  canAutoAdvance = false
                  await gameManager.advance()
                  that.scene.restart()
                }
                canAutoAdvance = true
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
                }
                makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
                  if (!goNextStage) return
                  void goNextStage()
                })
              })
              grid.add(hit)
              if (rec.count > 1) {
                const badge = that.add.rectangle(x + T - 10, y + T - 10, 16, 12, 0x111842, 1).setOrigin(0.5).setDepth(1002)
                badge.setStrokeStyle(1, 0x3a428a)
                const qty = that.add.text(badge.x, badge.y, String(rec.count), { fontFamily: 'monospace', fontSize: '10px', color: '#b3c0ff' }).setOrigin(0.5).setDepth(1002)
                grid.add(badge); grid.add(qty)
              }
            })
            const closeAll = () => {
              destroyModal()
              goNextStage = async () => {
                if (isAdvancingStage) return
                isAdvancingStage = true
                canAutoAdvance = false
                await gameManager.advance()
                this.scene.restart()
              }
              canAutoAdvance = true
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
              }
              makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
                if (!goNextStage) return
                void goNextStage()
              })
            }
            overlay.on('pointerdown', closeAll)
            close.on('pointerdown', closeAll)
          }
        } else if (uniqueId === 'other_place') {
          const stageNumber = run.stageIndex + run.biomeIndex * 100
          const rng = fromSeed(`${run.seed}|unique|${stageNumber}|other_place`)
          const descLines = [
            'You suddenly come across a steaming cup of chamomile tea and a plate of sugar cookies.',
            'Four beings take notice of you, each offering a different bargain.'
          ]
          const cur = logBuffer ? `${logBuffer}\n` : ''
          updateLog(cur + descLines.join('\n'))

          const that = this
          const camW = that.cameras.main.width
          const camH = that.cameras.main.height

          const cookies = placeFramedImage('unique:teacookies')
          let clickHint: Phaser.GameObjects.Text | null = null
          if (cookies) {
            cookies.setAlpha(0)
            this.tweens.add({
              targets: cookies,
              alpha: 1,
              duration: 260,
              ease: 'Quad.out'
            })
            cookies.setInteractive({ useHandCursor: true })
            clickHint = that.add.text(cookies.x, cookies.y - cookies.displayHeight - 8, 'click me', {
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#cbd5ff'
            }).setOrigin(0.5, 1).setDepth(11).setAlpha(0.85)
          }

          const buttons: Phaser.GameObjects.Text[] = []

          const openOtherPlaceModal = () => {
            if (!cookies) return
            cookies.disableInteractive()
            clickHint?.destroy()

            const overlay = that.add.rectangle(0, 0, camW, camH, 0x000000, 0.45).setOrigin(0).setInteractive().setDepth(1000)
            const baseW = Math.min(560, camW - 32)
            const baseH = Math.min(360, Math.max(260, camH - 140))
            const w = baseW * 0.8
            const h = baseH * 0.8
            const panel = that.add.rectangle(camW / 2, camH / 2, w, h, 0x0f1226, 1).setOrigin(0.5).setDepth(1001)
            panel.setStrokeStyle(1, 0x2a2f55)
            const title = that.add.text(panel.x, panel.y - h / 2 + 10, 'The Other Place', { fontFamily: 'sans-serif', fontSize: '16px', color: '#e5e7ff' }).setOrigin(0.5, 0).setDepth(1002)
            const subtitle = that.add.text(panel.x, title.y + title.displayHeight + 2, 'Choose an offering to accept a blessing', { fontFamily: 'monospace', fontSize: '12px', color: '#9db0ff' }).setOrigin(0.5, 0).setDepth(1002)

            const choiceCount = 4
            const spacing = 30
            const bottomMargin = 24
            const totalHeight = (choiceCount - 1) * spacing
            const firstY = panel.y + h / 2 - bottomMargin - totalHeight

            const destroyModal = () => {
              overlay.destroy()
              panel.destroy()
              title.destroy()
              subtitle.destroy()
              buttons.forEach(b => b.destroy())
            }

            const finalizeChoice = async () => {
              destroyModal()
              goNextStage = async () => {
                if (isAdvancingStage) return
                isAdvancingStage = true
                canAutoAdvance = false
                await gameManager.advance()
                that.scene.restart()
              }
              canAutoAdvance = true
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
              }
              makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
                if (!goNextStage) return
                void goNextStage()
              })
            }

            const disableButtons = () => {
              buttons.forEach(b => b.disableInteractive().setAlpha(0.6))
            }

            const makeChoiceBtn = (idx: number, label: string, onPick: () => Promise<void>) => {
              const btn = that.add.text(panel.x, firstY + idx * spacing, label, {
                fontFamily: 'sans-serif',
                fontSize: '14px',
                color: '#cfe1ff',
                backgroundColor: '#101531'
              }).setPadding(10, 6, 10, 6).setOrigin(0.5).setDepth(1002)
              btn.setInteractive({ useHandCursor: true })
              btn.setStroke('#2a2f55', 1)
              btn.on('pointerover', () => { btn.setScale(1.05).setAlpha(0.98); (btn as any).setTint?.(0xbfd6ff) })
              btn.on('pointerout', () => { btn.setScale(1.0).setAlpha(1); (btn as any).clearTint?.() })
              btn.on('pointerdown', async () => {
                disableButtons()
                await onPick()
                await finalizeChoice()
              })
              buttons.push(btn)
            }

            // The Curious: sacrifice max HP for double damage
            makeChoiceBtn(0, 'Offer to The Curious', async () => {
              const lossPct = (int(rng, 10, 75)) / 100
              const curMult = gameManager.getMaxHpMultiplier()
              const newMult = Math.max(0.1, curMult * (1 - lossPct))
              gameManager.setMaxHpMultiplier(newMult)
              const dmgMult = gameManager.getDamageMultiplier()
              gameManager.setDamageMultiplier(Math.max(1, dmgMult * 2))
              await gameManager.persistStagePlan()
              const lines = [
                'You invite The Curious to take what it wants.',
                `Your maximum health feels diminished (${Math.round(lossPct * 100)}% sacrificed).`,
                'In exchange, your strikes grow violently sharper.'
              ]
              const curLog = logBuffer ? `${logBuffer}\n` : ''
              updateLog(curLog + lines.join('\n'))
            })

            // Xuq\'talv – reroll all items, with a chance for new items to become blessed
            makeChoiceBtn(1, "Petition Xuq'talv, The Archaizer", async () => {
              const before = gameManager.getRunItems()
              const totalStacks = before.reduce((acc, it) => acc + (it.stacks ?? 0), 0)
              const allIds = Array.from(itemRegistry.keys())
              const picks: { id: string; stacks: number }[] = []
              if (allIds.length > 0) {
                for (let i = 0; i < totalStacks; i++) {
                  const idx = int(rng, 0, allIds.length - 1)
                  picks.push({ id: allIds[idx], stacks: 1 })
                }
              }
              const updated = picks
              gameManager.setRunItems(updated)

              // Bless a subset of items, guaranteeing at least one blessed
              const uniqueIds = Array.from(new Set(updated.map(it => it.id)))
              const blessed: string[] = []
              for (const id of uniqueIds) {
                if (rng.next() < 0.15) {
                  gameManager.addBlessedItem(id)
                  blessed.push(id)
                }
              }
              if (blessed.length === 0 && uniqueIds.length > 0) {
                const idx = int(rng, 0, uniqueIds.length - 1)
                const id = uniqueIds[idx]
                gameManager.addBlessedItem(id)
                blessed.push(id)
              }

              renderItemsPanel()
              await gameManager.persistRunItems()
              await gameManager.persistStagePlan()

              const lines: string[] = []
              lines.push('You surrender your possessions to Xuq\'talv.')
              lines.push('One by one, they are rewritten into unfamiliar shapes.')
              if (updated.length === 0) {
                lines.push('When the dust settles, you are left with nothing.')
              } else {
                lines.push(`You leave with ${updated.length} strangely rewritten item(s).`)
              }
              if (blessed.length > 0) {
                lines.push(`A few glimmer with archaic sigils: ${blessed.join(', ')}.`)
              }
              const curLog = logBuffer ? `${logBuffer}\n` : ''
              updateLog(curLog + lines.join('\n'))
            })

            // Lenley Davids – status reflect flag only (mechanics to come from engine)
            makeChoiceBtn(2, 'Share tea with Lenley Davids', async () => {
              gameManager.enableStatusReflect()
              await gameManager.persistStagePlan()
              const lines = [
                'You sit with Lenley Davids, sharing tea and stories that feel larger than the room.',
                'Time slips sideways for a while.',
                'When you stand, something about you feels reflective, like harm will no longer be entirely one-way.'
              ]
              const curLog = logBuffer ? `${logBuffer}\n` : ''
              updateLog(curLog + lines.join('\n'))
            })

            // Lal_glyph_bru_glyph_Ek_glyph_ – future bosses are globally blessed
            makeChoiceBtn(3, 'Gaze back at Lal\u001fbru\u001fEk\u001f', async () => {
              gameManager.enableGlobalBlessedBosses()
              await gameManager.persistStagePlan()
              const lines = [
                'You meet the gaze of the one who names you between glyphs.',
                'Nothing obvious happens. The air does not crack, the world does not end.',
                'Somewhere ahead, bosses take notice. They will not arrive unblessed.'
              ]
              const curLog = logBuffer ? `${logBuffer}\n` : ''
              updateLog(curLog + lines.join('\n'))
            })

            overlay.on('pointerdown', () => { /* swallow clicks until a choice is made */ })
          }

          if (cookies) {
            cookies.on('pointerup', () => {
              openOtherPlaceModal()
            })
          }
        } else {
          goNextStage = async () => {
            if (isAdvancingStage) return
            isAdvancingStage = true
            canAutoAdvance = false
            await gameManager.advance()
            this.scene.restart()
          }
          canAutoAdvance = true
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
          }
          makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
            if (!goNextStage) return
            void goNextStage()
          })
        }
      } else {
        // Fallback: any stage with no explicit handler still gets a quick "No battle" log and a Next Stage button.
        const cur = logBuffer ? `${logBuffer}\n` : ''
        updateLog(cur + 'No battle this stage.', false)
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
        goNextStage = async () => {
          if (isAdvancingStage) return
          isAdvancingStage = true
          canAutoAdvance = false
          await gameManager.advance()
          this.scene.restart()
        }
        canAutoAdvance = true
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('game:autoplay-stage-ready', { detail: { ready: true } }))
        }
        makeImgBtn('ui:nextStage', rightSlotX, bottomY, () => {
          if (!goNextStage) return
          void goNextStage()
        })
      }

      // Place control buttons beneath the main area (centered)
      const pad = 12
      const brX = this.cameras.main.width - pad
      const brY = this.cameras.main.height - pad
      // Next Stage for combat is created after combat resolution; for non-combat, keep as below only for endRun button
      const endRun = this.add.text(brX, brY - 8, 'End Run', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff', backgroundColor: '#8a2be2' }).setPadding(6, 4, 6, 4).setOrigin(1, 1)
      endRun.setInteractive({ useHandCursor: true })
      endRun.on('pointerdown', async () => {
        try {
          const prog = gameManager.getBiomeProgress()
          const stageIdx = prog.stageIndex ?? 0
          const xpGained = Math.max(0, 10 + stageIdx * 5)
          const xpRes = await addMyXp(xpGained)
          const metrics = gameManager.getRunMetrics()
          const run = gameManager.getRun()
          const biomesCompleted = prog.biomeIndex != null ? Math.max(0, prog.biomeIndex) : 0
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('profile:changed', { detail: { level: xpRes?.level, xp: xpRes?.xp } }))
            window.dispatchEvent(new CustomEvent('game:run-ended', {
              detail: {
                reason: 'manual',
                xpGained,
                level: xpRes?.level,
                xp: xpRes?.xp,
                metrics,
                seed: run?.seed,
                biomeId: prog.biomeIndex != null ? gameManager.getCurrentStage()?.biomeId : null,
                stageIndex: run?.stageIndex,
                biomesCompleted,
              }
            }))
          }
        } catch {}
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
