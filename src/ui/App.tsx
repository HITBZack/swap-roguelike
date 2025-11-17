import { useEffect, useMemo, useState } from 'react'
import { BattleContainer } from './BattleContainer'
import { supabase } from '../lib/supabase'
import { fetchMyProfile, type ProfileDTO } from '../lib/profile'
import { AccountModal } from './AccountModal'
import { PlayerCardModal } from './PlayerCardModal'
import { ChatPanel } from './ChatPanel'
import { useAppState } from '../lib/state'
import { UsernameModal } from './UsernameModal'
import { listInventory, listLoadout, equipItem, decrementLoadout, clearLoadout } from '../services/Inventory'
import { itemRegistry } from '../services/items/registry'
import type { ItemInstance } from '../services/items/types'
import { computeBaseStats, buildEffectiveStats } from '../services/player/Stats'
import { gameManager } from '../services/GameManager'

type DeathSummary = {
  reason: 'death' | 'manual'
  xpGained: number
  level?: number
  xp?: number
  seed?: string | null
  biomeId?: string | null
  stageIndex?: number | null
  biomesCompleted?: number
  metrics: { enemiesKilled: number; minibosses: number; bosses: number; itemsGained: number }
}

const itemImageUrls = import.meta.glob<string>('../assets/item_images/*.png', { eager: true, as: 'url' })

export function App(): JSX.Element {
  const [email, setEmail] = useState<string>('')
  const [profile, setProfile] = useState<ProfileDTO | null>(null)
  const [openAccount, setOpenAccount] = useState(false)
  const [openCard, setOpenCard] = useState(false)
  const player = useAppState((s) => s.player)
  const needUsername = useAppState((s) => s.ui.needUsername)
  const [openCardUserId, setOpenCardUserId] = useState<string | null>(null)
  const [inv, setInv] = useState<Array<{ id: string, stacks: number }>>([])
  const [loadout, setLoadout] = useState<Record<string, number>>({})
  const [itemModalId, setItemModalId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [runStats, setRunStats] = useState<{ seed: string | null; biome: string | null; stageIndex: number | null; lives: number | null; duration: string; progressPct: number; stageLabel: string; biomesCompleted: number; stageType: string | null }>(() => ({ seed: null, biome: null, stageIndex: null, lives: null, duration: '—', progressPct: 0, stageLabel: '—', biomesCompleted: 0, stageType: null }))
  const [metrics, setMetrics] = useState<{ enemiesKilled: number; minibosses: number; bosses: number; itemsGained: number }>({ enemiesKilled: 0, minibosses: 0, bosses: 0, itemsGained: 0 })
  const [autoPlay, setAutoPlay] = useState<boolean>(true)
  const [autoPlayProgress, setAutoPlayProgress] = useState<number>(0)
  const [autoPlayCooling, setAutoPlayCooling] = useState<boolean>(false)
  const [deathSummary, setDeathSummary] = useState<DeathSummary | null>(null)

  const itemIconMap = useMemo(() => {
    const entries = Object.entries(itemImageUrls).map(([p, url]) => {
      const fname = p.split('/').pop() as string
      const key = fname.replace(/\.png$/i, '').toLowerCase()
      return [key, url as string]
    })
    return Object.fromEntries(entries) as Record<string, string>
  }, [])

  // Keep GameManager's auto-combat flag in sync with Auto-Play
  useEffect(() => {
    gameManager.setAutoCombat(autoPlay)
  }, [autoPlay])

  // Show a death / run-end summary overlay when the game signals a completed run
  useEffect(() => {
    const onRunEnded = (e: Event) => {
      const detail = (e as CustomEvent<DeathSummary>).detail
      if (!detail || typeof detail.xpGained !== 'number') return
      setDeathSummary(detail)
    }
    window.addEventListener('game:run-ended', onRunEnded as EventListener)
    return () => {
      window.removeEventListener('game:run-ended', onRunEnded as EventListener)
    }
  }, [])

  // Autoplay interval: when enabled, dispatch a tick every 3s (7s on unique stages) with a 0.5s cooldown and smooth progress.
  // Reset timer/progress whenever the stage index changes so the bar always starts empty on a new stage.
  useEffect(() => {
    let frame: number | null = null
    const BASE_ACTION_MS = 3000
    const UNIQUE_ACTION_MS = 7000
    const PAUSE_MS = 500
    let lastTs: number | null = null
    let acc = 0
    let phase: 'running' | 'pause' = 'running'

    // Ensure fresh stage starts from zero
    setAutoPlayCooling(false)
    setAutoPlayProgress(0)

    const loop = (ts: number) => {
      if (lastTs == null) {
        // Prime the clock without advancing progress so bar starts at 0
        lastTs = ts
        frame = window.requestAnimationFrame(loop)
        return
      }
      const dt = ts - lastTs
      lastTs = ts

      const enabled = autoPlay && runStats.lives != null && (runStats.lives ?? 0) > 0
      if (!enabled) {
        acc = 0
        phase = 'running'
        lastTs = null
        setAutoPlayCooling(false)
        setAutoPlayProgress(0)
      } else {
        if (phase === 'running') {
          acc += dt
          const actionMs = runStats.stageType === 'unique' ? UNIQUE_ACTION_MS : BASE_ACTION_MS
          const clamped = Math.min(actionMs, acc)
          setAutoPlayCooling(false)
          setAutoPlayProgress(clamped / actionMs)
          if (acc >= actionMs) {
            // Trigger an autoplay action
            try {
              window.dispatchEvent(new CustomEvent('game:autoplay-advance'))
            } catch {}
            phase = 'pause'
            acc = 0
            setAutoPlayCooling(true)
            setAutoPlayProgress(1)
          }
        } else {
          acc += dt
          if (acc >= PAUSE_MS) {
            phase = 'running'
            acc = 0
            lastTs = null
            setAutoPlayCooling(false)
            setAutoPlayProgress(0)
          }
        }
      }
      frame = window.requestAnimationFrame(loop)
    }

    frame = window.requestAnimationFrame(loop)
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame)
    }
  }, [autoPlay, runStats.lives, runStats.stageIndex, runStats.stageType])


  // Poll GameManager for current run info to show in Stats panel
  useEffect(() => {
    let t: number | null = null
    const tick = () => {
      const run = gameManager.getRun()
      const stage = gameManager.getCurrentStage()
      const lives = gameManager.getLivesRemaining()
      // duration
      const startMs = gameManager.getRunStartMs()
      let duration = '—'
      if (startMs) {
        const secs = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
        const hh = Math.floor(secs / 3600)
        const mm = Math.floor((secs % 3600) / 60)
        const ss = secs % 60
        if (hh > 0) {
          duration = `${hh}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
        } else {
          duration = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
        }
      }
      // progress
      const prog = gameManager.getBiomeProgress()
      const pct = prog.totalStages && prog.stageIndex != null ? Math.min(100, Math.max(0, Math.round((prog.stageIndex / prog.totalStages) * 100))) : 0
      const stageLabel = prog.totalStages && prog.stageIndex != null ? `${prog.stageIndex + 1}/${prog.totalStages}` : '—'
      const biomesCompleted = gameManager.getBiomesCompleted()
      const stageType = stage?.type ?? null
      setRunStats({ seed: run?.seed ?? null, biome: stage?.biomeId ?? null, stageIndex: run?.stageIndex ?? null, lives: lives ?? null, duration, progressPct: pct, stageLabel, biomesCompleted, stageType })
      setMetrics(gameManager.getRunMetrics())
      t = window.setTimeout(tick, 500)
    }
    tick()
    return () => { if (t) window.clearTimeout(t) }
  }, [])

  useEffect(() => {
    let unsub: (() => void) | null = null
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      setEmail(data.user?.email ?? '')
      // Load profile for level/deaths etc.
      const p = await fetchMyProfile()
      setProfile(p)
      const sub = supabase.auth.onAuthStateChange((_ev, session) => {
        setEmail(session?.user?.email ?? '')
        // refetch profile on auth change
        fetchMyProfile().then(setProfile).catch(() => setProfile(null))
      })
      unsub = () => sub.data.subscription.unsubscribe()
    })()
    return () => {
      if (unsub) unsub()
    }
  }, [])

  // Live-update profile when game awards XP/deaths
  useEffect(() => {
    const onProfileChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { level?: number; xp?: number } | undefined
      setProfile((prev) => prev ? ({ ...prev, level: detail?.level ?? prev.level, xp: detail?.xp ?? prev.xp }) : prev)
      // Ensure sync with server in case of rounding or multiple level-ups
      fetchMyProfile().then((p) => { if (p) setProfile(p) }).catch(() => {})
    }
    window.addEventListener('profile:changed', onProfileChanged as EventListener)
    return () => window.removeEventListener('profile:changed', onProfileChanged as EventListener)
  }, [])

  useEffect(() => {
    const has = (history as any).scrollRestoration != null
    const prev = has ? (history as any).scrollRestoration : undefined
    if (has) (history as any).scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    return () => { if (has) (history as any).scrollRestoration = prev }
  }, [])

  // Guard against delayed scroll jumps: lock scroll until GameScene reports ready
  useEffect(() => {
    const prevOverflow = document.body.style.overflowY
    document.body.style.overflowY = 'hidden'
    const keepTop = () => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }
    // Prevent any scroll attempts during boot
    window.addEventListener('scroll', keepTop, { passive: true })
    keepTop()
    const releaseNow = () => {
      // small delay after ready to absorb any late layout shifts
      window.setTimeout(() => {
        window.removeEventListener('scroll', keepTop)
        document.body.style.overflowY = prevOverflow
        keepTop()
      }, 250)
    }
    window.addEventListener('game:scene-ready', releaseNow)
    const t = window.setTimeout(releaseNow, 7000) // safety fallback
    return () => {
      window.removeEventListener('game:scene-ready', releaseNow)
      window.clearTimeout(t)
      window.removeEventListener('scroll', keepTop)
      document.body.style.overflowY = prevOverflow
    }
  }, [])

  // Load inventory + loadout once per session
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const invRows = await listInventory()
      const loadRows = await listLoadout()
      if (!mounted) return
      setInv(invRows)
      const map: Record<string, number> = {}
      loadRows.forEach(r => { map[r.id] = (map[r.id] ?? 0) + r.stacks })
      setLoadout(map)
    })()
    return () => { mounted = false }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1500)
  }

  const displayName = player.username ?? email
  const avatarUrl = player.avatarUrl ?? null
  const initials = useMemo(() => {
    const base = player.username || email
    if (!base) return '🙂'
    const name = base.split('@')[0]
    const first = name[0]?.toUpperCase() ?? 'U'
    return first
  }, [player.username, email])

  // Stats: base vs effective from level and equipped loadout
  const level = profile?.level ?? 1
  const loadoutItems = useMemo<ItemInstance[]>(() => (
    Object.entries(loadout).map(([id, stacks]) => ({ id, stacks }))
  ), [loadout])
  const baseStats = useMemo(() => computeBaseStats(level), [level])
  const effStats = useMemo(() => buildEffectiveStats(level, loadoutItems), [level, loadoutItems])
  const pct = (v: number) => `${Math.round(v * 100)}%`

  // Small polish: animate effective stat cell briefly when values change
  const [bump, setBump] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const keys = ['maxHp','damage','accuracy','dodge','projectileCount','shield','lifestealPct','dotDmgPct'] as const
    const next: Record<string, boolean> = {}
    keys.forEach(k => { next[k] = true })
    setBump(next)
    const t = window.setTimeout(() => setBump({}), 300)
    return () => window.clearTimeout(t)
  }, [effStats.maxHp, effStats.damage, effStats.accuracy, effStats.dodge, effStats.projectileCount, effStats.shield, effStats.lifestealPct, effStats.dotDmgPct])

  const clampedAutoPlayProgress = Math.max(0, Math.min(1, autoPlayProgress))
  const visualAutoPlayProgress = clampedAutoPlayProgress < 0.03 ? 0 : clampedAutoPlayProgress

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr auto', minHeight: '100vh', background: '#0b0e1a', color: '#e5e7ff', fontFamily: 'Inter, system-ui, sans-serif', width: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', background: '#101531', borderBottom: '1px solid #1f2447' }}>
        <strong>Swap MMO</strong>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            title={email}
            onClick={() => setOpenCard(true)}
            className="hover-chip"
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid #2a2f55',
              background: '#0f1226',
              color: '#e5e7ff',
              fontSize: 12,
              minWidth: 120,
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {displayName || 'Guest'}
          </div>
          <button
            onClick={() => setOpenAccount(true)}
            aria-label="Open account settings"
            className="hover-circle"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid #2a2f55',
              background: '#0f1226',
              color: '#e5e7ff',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              padding: 0,
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <span style={{ fontSize: 14 }}>{initials}</span>
            )}
          </button>
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 300px', gap: 12, padding: 12, maxWidth: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>
        <aside style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 0, overflow: 'hidden' }}>
          <ChatPanel onUserClick={(uid: string) => { setOpenCard(true); setOpenCardUserId(uid) }} />
        </aside>
        <main style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 12 }}>
          <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, height: '100%', padding: 8, display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <button
                onClick={() => {
                  setAutoPlay((prev) => {
                    const next = !prev
                    gameManager.setAutoCombat(next)
                    return next
                  })
                }}
                className="hover-chip"
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: '1px solid #2a2f55',
                  background: autoPlay ? '#1f3d7a' : '#2a2f55',
                  color: '#e5e7ff',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: autoPlay ? '#4ade80' : '#64748b' }} />
                <span>Auto-Play</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{autoPlay ? 'On' : 'Off'}</span>
              </button>
              <div style={{ flex: 1, maxWidth: 220, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#111633', border: '1px solid #243057', overflow: 'hidden', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, #4255ff, #8ba5ff)',
                      transformOrigin: 'left center',
                      transform: `scaleX(${visualAutoPlayProgress})`,
                      boxShadow: autoPlayCooling ? '0 0 8px rgba(129, 230, 217, 0.9)' : 'none',
                      opacity: autoPlay ? 1 : 0.45,
                    }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <BattleContainer />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}><strong>Run</strong></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 8, fontSize: 12, color: '#b3c0ff' }}>
                <div>Seed</div><div style={{ color: '#e5e7ff' }}>{runStats.seed ?? '—'}</div>
                <div>Biome</div><div style={{ color: '#e5e7ff' }}>{runStats.biome ?? '—'}</div>
                <div>Biomes Completed</div><div style={{ color: '#e5e7ff' }}>{runStats.biomesCompleted}</div>
                <div>Lives</div><div style={{ color: '#e5e7ff' }}>{runStats.lives != null ? `${runStats.lives}/3` : '—'}</div>
                <div>Duration</div><div style={{ color: '#e5e7ff' }}>{runStats.duration}</div>
                <div style={{ alignSelf: 'center' }}>Biome Progress</div>
                <div>
                  <div style={{ marginBottom: 4, fontSize: 12, color: '#9db0ff' }}>Stage {runStats.stageLabel}</div>
                  <div style={{ width: '100%', height: 8, borderRadius: 4, background: '#12173a', border: '1px solid #1f2447', overflow: 'hidden' }}>
                    <div style={{ width: `${runStats.progressPct}%`, height: '100%', background: '#5865f2' }} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>Stats</strong>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  <div title="Effective Max HP" style={{ padding: '2px 6px', borderRadius: 6, background: '#111842', border: '1px solid #3a428a', fontSize: 11, color: '#e5e7ff' }}>HP {effStats.maxHp}</div>
                  <div title="Effective Damage" style={{ padding: '2px 6px', borderRadius: 6, background: '#111842', border: '1px solid #3a428a', fontSize: 11, color: '#e5e7ff' }}>DMG {effStats.damage}</div>
                  <div title="Effective Accuracy" style={{ padding: '2px 6px', borderRadius: 6, background: '#111842', border: '1px solid #3a428a', fontSize: 11, color: '#e5e7ff' }}>ACC {pct(effStats.accuracy)}</div>
                </div>
              </div>
              {(() => {
                const curXp = profile?.xp ?? 0
                const need = Math.max(1, Math.floor(50 * Math.pow(level, 1.5)))
                const xpPct = Math.max(0, Math.min(100, Math.round((curXp / need) * 100)))
                return (
                  <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ padding: '2px 8px', borderRadius: 999, background: '#111842', border: '1px solid #3a428a', fontSize: 12, color: '#e5e7ff' }}>Level {level}</div>
                      <div style={{ fontSize: 12, color: '#9db0ff' }}>XP {curXp} / {need}</div>
                    </div>
                    <div style={{ width: '100%', height: 8, borderRadius: 6, background: '#12173a', border: '1px solid #1f2447', overflow: 'hidden' }}>
                      <div style={{ width: `${xpPct}%`, height: '100%', background: '#6aa6ff' }} />
                    </div>
                  </div>
                )
              })()}
              {(() => {
                const rowStyle = { display: 'contents' } as const
                const headerStyle = { color: '#9db0ff' }
                const labelStyle = { color: '#b3c0ff' }
                const valStyle = { color: '#e5e7ff' }
                const deltaStyle = (d: number) => ({ color: d > 0 ? '#22c55e' : d < 0 ? '#ef4444' : '#9db0ff' })
                const fmtInt = (v: number) => `${Math.round(v)}`
                const fmtPct = (v: number) => `${Math.round(v * 100)}%`
                const fmtMult = (v: number) => `${v.toFixed(2)}x`
                const arrow = (d: number) => (d > 0 ? '↑' : d < 0 ? '↓' : '→')
                const row = (label: string, base: number, eff: number, kind: 'int'|'pct'|'mult', key?: string) => {
                  const fmt = kind === 'int' ? fmtInt : kind === 'pct' ? fmtPct : fmtMult
                  const delta = eff - base
                  const ratio = base !== 0 ? eff / base : (eff >= base ? 1 : -1)
                  const deltaText = kind === 'mult' ? fmtMult(ratio) : (kind === 'pct' ? `${Math.round((eff - base) * 100)}%` : (delta >= 0 ? `+${fmtInt(delta)}` : `${fmtInt(delta)}`))
                  const tip = `Base: ${fmt(base)}\nEffective: ${fmt(eff)}\nDelta: ${deltaText}`
                  return (
                    <div style={rowStyle} key={label}>
                      <div style={labelStyle as React.CSSProperties} title={tip}>{label}</div>
                      <div style={valStyle as React.CSSProperties} title={tip}>{fmt(base)}</div>
                      <div style={{ ...valStyle as React.CSSProperties, transition: 'transform 120ms ease, color 160ms ease', transform: key && bump[key] ? 'scale(1.06)' : 'scale(1.0)' }} title={tip}>
                        {fmt(eff)}
                        {delta !== 0 && (
                          <span style={{ marginLeft: 8, fontWeight: 600, ...(deltaStyle(delta) as object) }} title={tip}>
                            {arrow(delta)} {deltaText}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', rowGap: 6, columnGap: 10, fontSize: 12 }}>
                    <div style={headerStyle}>Stat</div>
                    <div style={headerStyle}>Base</div>
                    <div style={headerStyle}>Effective</div>
                    <div style={{ height: 1, background: '#1f2447', gridColumn: '1 / -1', margin: '4px 0' }} />
                    {row('Max HP', baseStats.maxHp, effStats.maxHp, 'int', 'maxHp')}
                    {row('Damage', baseStats.damage, effStats.damage, 'int', 'damage')}
                    {row('Accuracy', baseStats.accuracy, effStats.accuracy, 'pct', 'accuracy')}
                    {row('Dodge', baseStats.dodge, effStats.dodge, 'pct', 'dodge')}
                    {row('Projectiles', baseStats.projectileCount, effStats.projectileCount, 'int', 'projectileCount')}
                    {row('Shield', baseStats.shield, effStats.shield, 'int', 'shield')}
                    {row('Lifesteal', baseStats.lifestealPct, effStats.lifestealPct, 'pct', 'lifestealPct')}
                    {row('DoT Mult', baseStats.dotDmgPct, effStats.dotDmgPct, 'mult', 'dotDmgPct')}
                  </div>
                )
              })()}
            </div>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}><strong>Summary</strong></div>
              <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ color: '#9db0ff' }}>Equipped</div>
                  <div style={{ color: '#e5e7ff' }}>{Object.values(loadout).reduce((a, b) => a + (b ?? 0), 0)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ color: '#9db0ff' }}>Inventory Items</div>
                  <div style={{ color: '#e5e7ff' }}>{inv.reduce((a, it) => a + (it.stacks ?? 0), 0)}</div>
                </div>
                <div style={{ height: 1, background: '#1f2447', opacity: 0.7, margin: '4px 0' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ color: '#9db0ff' }}>Enemies Killed</div>
                  <div style={{ color: '#e5e7ff' }}>{metrics.enemiesKilled}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ color: '#9db0ff' }}>Minibosses Defeated</div>
                  <div style={{ color: '#e5e7ff' }}>{metrics.minibosses}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ color: '#9db0ff' }}>Bosses Defeated</div>
                  <div style={{ color: '#e5e7ff' }}>{metrics.bosses}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ color: '#9db0ff' }}>Items Gained</div>
                  <div style={{ color: '#e5e7ff' }}>{metrics.itemsGained}</div>
                </div>
              </div>
            </div>
          </div>
        </main>
        <aside style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12, position: 'relative' }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Inventory</h3>
          {inv.length === 0 ? (
            <div style={{ opacity: 0.65, fontSize: 12 }}>No items yet</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 48px)', gap: 8 }}>
              {inv.map((it) => {
                const equippedStacks = loadout[it.id] ?? 0
                const def = itemRegistry.get(it.id)
                const iconUrl = def?.imageKey ? itemIconMap[def.imageKey.toLowerCase()] : undefined
                return (
                  <div key={it.id} style={{ position: 'relative' }}>
                    <button
                      title={def?.name ?? it.id}
                      onClick={() => setItemModalId(it.id)}
                      onContextMenu={async (e) => {
                        e.preventDefault()
                        const amount = e.shiftKey ? 5 : 1
                        if ((loadout[it.id] ?? 0) > 0) {
                          // optimistic decrement
                          setLoadout((prev) => {
                            const next = { ...prev }
                            const curr = next[it.id] ?? 0
                            const dec = Math.min(curr, amount)
                            if (curr - dec <= 0) delete next[it.id]
                            else next[it.id] = curr - dec
                            return next
                          })
                          const ok = await decrementLoadout(it.id, amount)
                          if (ok) {
                            showToast(`${def?.name ?? it.id} unequipped${amount > 1 ? ` x${amount}` : ''}`)
                          } else {
                            // revert
                            setLoadout((prev) => ({ ...prev, [it.id]: (prev[it.id] ?? 0) + amount }))
                            showToast('Failed to unequip')
                          }
                        } else {
                          // optimistic equip
                          setLoadout((prev) => ({ ...prev, [it.id]: (prev[it.id] ?? 0) + amount }))
                          const ok = await equipItem(it.id, amount)
                          if (ok) {
                            showToast(`${def?.name ?? it.id} equipped to loadout${amount > 1 ? ` x${amount}` : ''}`)
                          } else {
                            // revert
                            setLoadout((prev) => {
                              const next = { ...prev }
                              const curr = next[it.id] ?? 0
                              const dec = Math.min(curr, amount)
                              if (curr - dec <= 0) delete next[it.id]
                              else next[it.id] = curr - dec
                              return next
                            })
                            showToast('Failed to equip')
                          }
                        }
                      }}
                      className="hover-circle"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.06)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}
                      style={{ width: 48, height: 48, borderRadius: 6, border: '1px solid #2a2f55', background: '#0b0e1a', color: '#e5e7ff', cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'transform 120ms ease' }}
                    >
                      {iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={iconUrl} alt={def?.name ?? it.id} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 4 }} />
                      ) : (
                        <span style={{ fontSize: 10 }}>{(def?.name ?? it.id).slice(0,2).toUpperCase()}</span>
                      )}
                    </button>
                    {equippedStacks > 0 && (
                      <div style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, background: '#194a2a', border: '1px solid #2f5d3d', color: '#c8ffda', fontSize: 10, display: 'grid', placeItems: 'center' }}>✓</div>
                    )}
                    <div title={`Owned x${it.stacks}`} style={{ position: 'absolute', bottom: -4, right: -4, padding: '0 4px', borderRadius: 6, background: '#111842', border: '1px solid #3a428a', color: '#b3c0ff', fontSize: 10 }}>x{it.stacks}</div>
                  </div>
                )
              })}
            </div>
          )}
          {toast && (
            <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '6px 10px', borderRadius: 8, background: '#111842', border: '1px solid #3a428a', color: '#e5e7ff', fontSize: 12, opacity: 0.95 }}>{toast}</div>
          )}

          {/* Loadout summary */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: '#9db0ff' }}>Loadout</div>
              {Object.keys(loadout).length > 0 && (
                <button
                  onClick={async () => {
                    const prev = loadout
                    setLoadout({})
                    const ok = await clearLoadout()
                    if (!ok) setLoadout(prev)
                    else showToast('Loadout cleared')
                  }}
                  className="hover-chip"
                  style={{ height: 22, padding: '0 8px', borderRadius: 6, border: '1px solid #2a2f55', background: '#101531', color: '#b3c0ff', fontSize: 11 }}
                >
                  Unequip All
                </button>
              )}
            </div>
            {Object.keys(loadout).length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 12 }}>No items equipped</div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(loadout).map(([id, count]) => {
                  const def = itemRegistry.get(id)
                  const iconUrl = def?.imageKey ? itemIconMap[def.imageKey.toLowerCase()] : undefined
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #2a2f55', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                        {iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={iconUrl} alt={def?.name ?? id} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 2 }} />
                        ) : (
                          <span style={{ fontSize: 10 }}>{(def?.name ?? id).slice(0,2).toUpperCase()}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#e5e7ff' }}>{def?.name ?? id}</div>
                      <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9db0ff' }}>x{count}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
      <footer style={{ background: '#0f1122', borderTop: '1px solid #1f2447', padding: '16px 12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <a href="/faq.html" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>FAQ</a>
          <a href="/contact.html" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Contact</a>
          <a href="/terms.html" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Terms & Conditions</a>
          <a href="/privacy.html" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Privacy</a>
          <a href="/sitemap.html" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Sitemap</a>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#91a0ff' }}>© {new Date().getFullYear()} Swap MMO</div>
        </div>
      </footer>
      <AccountModal open={openAccount} onClose={() => setOpenAccount(false)} email={email} />
      <PlayerCardModal open={openCard} onClose={() => { setOpenCard(false); setOpenCardUserId(null) }} username={player.username ?? ''} email={email} avatarUrl={avatarUrl} userId={openCardUserId ?? undefined} />
      <UsernameModal open={Boolean(needUsername)} />
      {deathSummary && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'radial-gradient(circle at top, rgba(72,85,255,0.28), rgba(5,8,25,0.96))',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: '96vw',
              borderRadius: 16,
              background: '#050814',
              border: '1px solid #334155',
              boxShadow: '0 22px 65px rgba(0,0,0,0.7)',
              padding: 20,
              display: 'grid',
              gridTemplateRows: 'auto auto auto',
              rowGap: 14,
              color: '#e5e7ff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg,#ef4444,#b91c1c)',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 0 18px rgba(248,113,113,0.65)',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 24 }}>☠</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {deathSummary.reason === 'death' ? 'You fell in battle' : 'Run concluded'}
                </div>
                <div style={{ fontSize: 12, color: '#a5b4fc', marginTop: 2 }}>
                  {deathSummary.seed && (
                    <span>Seed {deathSummary.seed}</span>
                  )}
                  {typeof deathSummary.biomesCompleted === 'number' && (
                    <span>{deathSummary.seed ? ' • ' : ''}Biomes completed: {deathSummary.biomesCompleted}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDeathSummary(null)}
                className="hover-chip"
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid #4b5563',
                  background: 'transparent',
                  color: '#e5e7ff',
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr',
                gap: 12,
                alignItems: 'stretch',
              }}
            >
              <div
                style={{
                  borderRadius: 10,
                  background: 'linear-gradient(135deg,#0f172a,#020617)',
                  border: '1px solid #1f2937',
                  padding: 12,
                  display: 'grid',
                  rowGap: 6,
                }}
              >
                <div style={{ fontSize: 12, color: '#9ca3af' }}>XP Reward</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#facc15' }}>+{deathSummary.xpGained}</div>
                  {typeof deathSummary.level === 'number' && typeof deathSummary.xp === 'number' && (
                    <div style={{ fontSize: 12, color: '#a5b4fc' }}>
                      Level {deathSummary.level}, XP {deathSummary.xp}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  Thanks for playing this run! Try a new loadout or seed and see how far you get.
                </div>
              </div>

              <div
                style={{
                  borderRadius: 10,
                  background: '#020617',
                  border: '1px solid #1f2937',
                  padding: 10,
                  display: 'grid',
                  rowGap: 4,
                  fontSize: 11,
                  color: '#cbd5f5',
                }}
              >
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Run Stats</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Enemies Killed</span>
                  <span>{deathSummary.metrics.enemiesKilled}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Minibosses</span>
                  <span>{deathSummary.metrics.minibosses}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Bosses</span>
                  <span>{deathSummary.metrics.bosses}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Items Gained</span>
                  <span>{deathSummary.metrics.itemsGained}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af' }}>
              <span>
                Tip: Equip items in the right panel between runs to change your build.
              </span>
              <button
                onClick={() => setDeathSummary(null)}
                className="hover-chip"
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid #4b5563',
                  background: '#111827',
                  color: '#e5e7ff',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Item info modal */}
      {itemModalId && (
        <div onClick={() => setItemModalId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '92vw', borderRadius: 12, background: '#0f1226', border: '1px solid #1f2447', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
            {(() => {
              const def = itemRegistry.get(itemModalId)
              const iconUrl = def?.imageKey ? itemIconMap[def.imageKey.toLowerCase()] : undefined
              const owned = inv.find(x => x.id === itemModalId)?.stacks ?? 0
              const equipped = loadout[itemModalId] ?? 0
              const available = Math.max(0, owned - equipped)
              const canEquip = available > 0
              const canUnequip = equipped > 0
              return (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid #2a2f55', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                      {iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={iconUrl} alt={def?.name ?? itemModalId} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 4 }} />
                      ) : (
                        <span style={{ fontSize: 14 }}>{(def?.name ?? itemModalId).slice(0,2).toUpperCase()}</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontSize: 16 }}><strong>{def?.name ?? itemModalId}</strong></div>
                      <div style={{ fontSize: 12, color: '#9db0ff' }}>{def?.rarity ?? 'unknown'}</div>
                      <div style={{ fontSize: 12, color: '#9db0ff' }}>Owned: x{owned} • Equipped: x{equipped} • Available: x{available}</div>
                    </div>
                    <button
                      onClick={() => setItemModalId(null)}
                      className="hover-chip"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1a2150' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#101531' }}
                      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}
                      style={{ marginLeft: 'auto', height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #2a2f55', background: '#101531', color: '#b3c0ff', transition: 'transform 80ms ease, background 120ms ease' }}
                    >
                      Close
                    </button>
                  </div>
                  <div style={{ height: 1, background: '#1f2447', opacity: 0.8 }} />
                  <div style={{ fontSize: 13, color: '#e5e7ff', lineHeight: 1.5 }}>{def?.description ?? 'No description'}</div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 }}>
                      {canEquip ? (
                        <button onClick={async () => {
                          const ok = await equipItem(itemModalId, 1)
                          if (ok) {
                            setLoadout((prev) => ({ ...prev, [itemModalId]: (prev[itemModalId] ?? 0) + 1 }))
                            showToast(`${def?.name ?? itemModalId} equipped to loadout`)
                          }
                          setItemModalId(null)
                        }}
                        className="hover-chip"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1f5a37' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#194a2a' }}
                        onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                        onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}
                        style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #2f5d3d', background: '#194a2a', color: '#c8ffda', transition: 'transform 80ms ease, background 120ms ease' }}
                        >
                          Equip
                        </button>
                      ) : (
                        <button onClick={async () => {
                          if (!canUnequip) return
                          const ok = await decrementLoadout(itemModalId, 1)
                          if (ok) {
                            setLoadout((prev) => {
                              const next = { ...prev }
                              const curr = next[itemModalId] ?? 0
                              if (curr - 1 <= 0) delete next[itemModalId]
                              else next[itemModalId] = curr - 1
                              return next
                            })
                            showToast(`${def?.name ?? itemModalId} unequipped`)
                          }
                          setItemModalId(null)
                        }}
                        className="hover-chip"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4a1a1a' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#3a1515' }}
                        onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                        onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}
                        style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #5a2f2f', background: '#3a1515', color: '#ffd1d1', transition: 'transform 80ms ease, background 120ms ease', opacity: canUnequip ? 1 : 0.6, cursor: canUnequip ? 'pointer' : 'not-allowed' }}
                        >
                          Unequip
                        </button>
                      )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
