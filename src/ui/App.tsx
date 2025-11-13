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
        <strong>Social Roguelike</strong>
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
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>Stats</div>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>Navigation</div>
            <div style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>Run Summary</div>
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
                      <span style={{ fontSize: 10 }}>{(def?.name ?? it.id).slice(0,2).toUpperCase()}</span>
                    </button>
                    {equippedStacks > 0 && (
                      <div style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, background: '#194a2a', border: '1px solid #2f5d3d', color: '#c8ffda', fontSize: 10, display: 'grid', placeItems: 'center' }}>✓</div>
                    )}
                    {it.stacks > 1 && (
                      <div style={{ position: 'absolute', bottom: -4, right: -4, padding: '0 4px', borderRadius: 6, background: '#111842', border: '1px solid #3a428a', color: '#b3c0ff', fontSize: 10 }}>{it.stacks}</div>
                    )}
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
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #2a2f55', background: '#0b0e1a', display: 'grid', placeItems: 'center' }}>
                        <span style={{ fontSize: 10 }}>{(def?.name ?? id).slice(0,2).toUpperCase()}</span>
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
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#91a0ff' }}>© {new Date().getFullYear()} Social Roguelike</div>
        </div>
      </footer>
      <AccountModal open={openAccount} onClose={() => setOpenAccount(false)} email={email} />
      <PlayerCardModal open={openCard} onClose={() => { setOpenCard(false); setOpenCardUserId(null) }} username={player.username ?? ''} email={email} avatarUrl={avatarUrl} userId={openCardUserId ?? undefined} />
      <UsernameModal open={Boolean(needUsername)} />

      {/* Item info modal */}
      {itemModalId && (
        <div onClick={() => setItemModalId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 320, borderRadius: 10, background: '#0f1226', border: '1px solid #1f2447', padding: 12 }}>
            {(() => {
              const def = itemRegistry.get(itemModalId)
              return (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #2a2f55', background: '#0b0e1a', display: 'grid', placeItems: 'center' }}>
                      <span style={{ fontSize: 12 }}>{(def?.name ?? itemModalId).slice(0,2).toUpperCase()}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 14 }}><strong>{def?.name ?? itemModalId}</strong></div>
                      <div style={{ fontSize: 12, color: '#9db0ff' }}>{def?.rarity ?? 'unknown'}</div>
                    </div>
                    <button
                      onClick={() => setItemModalId(null)}
                      className="hover-chip"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1a2150' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#101531' }}
                      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}
                      style={{ marginLeft: 'auto', height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #2a2f55', background: '#101531', color: '#b3c0ff', transition: 'transform 80ms ease, background 120ms ease' }}
                    >
                      Close
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#e5e7ff' }}>{def?.description ?? 'No description'}</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #2f5d3d', background: '#194a2a', color: '#c8ffda', transition: 'transform 80ms ease, background 120ms ease' }}
                    >
                      Equip
                    </button>
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
