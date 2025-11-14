import { useEffect, useMemo, useState } from 'react'
import { BattleContainer } from './BattleContainer'
import { supabase } from '../lib/supabase'
import { AccountModal } from './AccountModal'
import { PlayerCardModal } from './PlayerCardModal'
import { ChatPanel } from './ChatPanel'
import { useAppState } from '../lib/state'
import { UsernameModal } from './UsernameModal'
import { listInventory, listLoadout, equipItem, decrementLoadout, clearLoadout } from '../services/Inventory'
import { itemRegistry } from '../services/items/registry'
import { gameManager } from '../services/GameManager'

const itemImageUrls = import.meta.glob<string>('../assets/item_images/*.png', { eager: true, as: 'url' })

export function App(): JSX.Element {
  const [email, setEmail] = useState<string>('')
  const [openAccount, setOpenAccount] = useState(false)
  const [openCard, setOpenCard] = useState(false)
  const player = useAppState((s) => s.player)
  const needUsername = useAppState((s) => s.ui.needUsername)
  const [openCardUserId, setOpenCardUserId] = useState<string | null>(null)
  const [inv, setInv] = useState<Array<{ id: string, stacks: number }>>([])
  const [loadout, setLoadout] = useState<Record<string, number>>({})
  const [itemModalId, setItemModalId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [runStats, setRunStats] = useState<{ seed: string | null; biome: string | null; stageIndex: number | null; lives: number | null; duration: string; progressPct: number; stageLabel: string }>(() => ({ seed: null, biome: null, stageIndex: null, lives: null, duration: '—', progressPct: 0, stageLabel: '—' }))
  const [autoCombat, setAutoCombat] = useState<boolean>(gameManager.isAutoCombat())
  const [metrics, setMetrics] = useState<{ enemiesKilled: number; minibosses: number; bosses: number; itemsGained: number }>({ enemiesKilled: 0, minibosses: 0, bosses: 0, itemsGained: 0 })

  const itemIconMap = useMemo(() => {
    const entries = Object.entries(itemImageUrls).map(([p, url]) => {
      const fname = p.split('/').pop() as string
      const key = fname.replace(/\.png$/i, '').toLowerCase()
      return [key, url as string]
    })
    return Object.fromEntries(entries) as Record<string, string>
  }, [])

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
        const mm = Math.floor(secs / 60).toString().padStart(2, '0')
        const ss = (secs % 60).toString().padStart(2, '0')
        duration = `${mm}:${ss}`
      }
      // progress
      const prog = gameManager.getBiomeProgress()
      const pct = prog.totalStages && prog.stageIndex != null ? Math.min(100, Math.max(0, Math.round((prog.stageIndex / prog.totalStages) * 100))) : 0
      const stageLabel = prog.totalStages && prog.stageIndex != null ? `${prog.stageIndex + 1}/${prog.totalStages}` : '—'
      setRunStats({ seed: run?.seed ?? null, biome: stage?.biomeId ?? null, stageIndex: run?.stageIndex ?? null, lives: lives ?? null, duration, progressPct: pct, stageLabel })
      setAutoCombat(gameManager.isAutoCombat())
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
      const sub = supabase.auth.onAuthStateChange((_ev, session) => {
        setEmail(session?.user?.email ?? '')
      })
      unsub = () => sub.data.subscription.unsubscribe()
    })()
    return () => {
      if (unsub) unsub()
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

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr auto', minHeight: '100vh', background: '#0b0e1a', color: '#e5e7ff', fontFamily: 'Inter, system-ui, sans-serif' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 300px', gap: 12, padding: 12 }}>
        <aside style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 0, overflow: 'hidden' }}>
          <ChatPanel onUserClick={(uid: string) => { setOpenCard(true); setOpenCardUserId(uid) }} />
        </aside>
        <main style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 12 }}>
          <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, height: '100%', display: 'grid', placeItems: 'center', padding: 8 }}>
            <BattleContainer />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}><strong>Run</strong></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 8, fontSize: 12, color: '#b3c0ff' }}>
                <div>Seed</div><div style={{ color: '#e5e7ff' }}>{runStats.seed ?? '—'}</div>
                <div>Biome</div><div style={{ color: '#e5e7ff' }}>{runStats.biome ?? '—'}</div>
                <div>Stage</div><div style={{ color: '#e5e7ff' }}>{runStats.stageIndex != null ? runStats.stageIndex + 1 : '—'}</div>
                <div>Lives</div><div style={{ color: '#e5e7ff' }}>{runStats.lives ?? '—'}</div>
                <div>Duration</div><div style={{ color: '#e5e7ff' }}>{runStats.duration}</div>
                <div style={{ alignSelf: 'center' }}>Biome Progress</div>
                <div>
                  <div style={{ marginBottom: 4, fontSize: 12, color: '#9db0ff' }}>Stage {runStats.stageLabel}</div>
                  <div style={{ width: '100%', height: 8, borderRadius: 4, background: '#12173a', border: '1px solid #1f2447', overflow: 'hidden' }}>
                    <div style={{ width: `${runStats.progressPct}%`, height: '100%', background: '#5865f2' }} />
                  </div>
                </div>
                <div>Auto Combat</div>
                <div>
                  <button
                    onClick={() => { gameManager.setAutoCombat(!autoCombat); setAutoCombat(gameManager.isAutoCombat()) }}
                    className="hover-chip"
                    style={{ height: 24, padding: '0 10px', borderRadius: 6, border: '1px solid #2a2f55', background: autoCombat ? '#1f3d7a' : '#2a2f55', color: '#e5e7ff', fontSize: 12 }}
                  >
                    {autoCombat ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}><strong>Navigation</strong></div>
              <div style={{ fontSize: 12, color: '#9db0ff' }}>More coming soon</div>
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
          <a href="#contact" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Contact</a>
          <a href="#faq" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>FAQ</a>
          <a href="#sitemap" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Sitemap</a>
          <a href="#terms" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Terms & Conditions</a>
          <a href="#privacy" style={{ color: '#b3c0ff', textDecoration: 'none', fontSize: 12 }}>Privacy</a>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#91a0ff' }}>© {new Date().getFullYear()} Swap MMO</div>
        </div>
      </footer>
      <AccountModal open={openAccount} onClose={() => setOpenAccount(false)} email={email} />
      <PlayerCardModal open={openCard} onClose={() => { setOpenCard(false); setOpenCardUserId(null) }} username={player.username ?? ''} email={email} avatarUrl={avatarUrl} userId={openCardUserId ?? undefined} />
      <UsernameModal open={Boolean(needUsername)} />

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
