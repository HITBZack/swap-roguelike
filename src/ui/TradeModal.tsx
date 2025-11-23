import { useEffect, useMemo, useState } from 'react'
import { listInventory } from '../services/Inventory'
import { createTrade, setTradeItems, setTradeReady, finalizeTrade, type TradeDTO, type TradeItemDTO } from '../lib/trades'
import { supabase } from '../lib/supabase'
import { itemRegistry } from '../services/items/registry'

export interface TradeModalProps {
  open: boolean
  onClose: () => void
  initialTrade?: TradeDTO | null
  otherUserId?: string
}

const itemImageUrls = import.meta.glob<string>('../assets/item_images/*.png', { eager: true, query: '?url', import: 'default' })

export function TradeModal({ open, onClose, initialTrade, otherUserId }: TradeModalProps): JSX.Element | null {
  const [trade, setTrade] = useState<TradeDTO | null>(initialTrade ?? null)
  const [items, setItems] = useState<TradeItemDTO[]>([])
  const [inventory, setInventory] = useState<Array<{ id: string; stacks: number }>>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otherOnline, setOtherOnline] = useState<boolean | null>(null)
  const [invPage, setInvPage] = useState(0)

  const itemIconMap = useMemo(() => {
    const entries = Object.entries(itemImageUrls).map(([p, url]) => {
      const fname = p.split('/').pop() as string
      const key = fname.replace(/\.png$/i, '').toLowerCase()
      return [key, url as string]
    })
    return Object.fromEntries(entries) as Record<string, string>
  }, [])

  const isUserA = trade && meId ? trade.user_a_id === meId : false
  const myReady = trade ? (isUserA ? trade.a_ready : trade.b_ready) : false
  const otherReady = trade ? (isUserA ? trade.b_ready : trade.a_ready) : false

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      const uid = data.user?.id ?? null
      setMeId(uid)
      const inv = await listInventory()
      if (!cancelled) setInventory(inv)
      if (!trade && uid && otherUserId) {
        setBusy(true)
        const created = await createTrade(otherUserId)
        setBusy(false)
        if (!created) {
          setError('Could not start trade. The other player may be offline or unavailable.')
          return
        }
        setTrade(created)
      }
    })()
    return () => { cancelled = true }
  }, [open, otherUserId])

  useEffect(() => {
    if (!trade || !open) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('trade_items')
        .select('*')
        .eq('trade_id', trade.id)
        .order('created_at', { ascending: true })
      if (cancelled || error || !data) return
      setItems(data as unknown as TradeItemDTO[])
    })()
    const channel = supabase
      .channel(`trade_${trade.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_items', filter: `trade_id=eq.${trade.id}` }, () => {
        void (async () => {
          const { data, error } = await supabase
            .from('trade_items')
            .select('*')
            .eq('trade_id', trade.id)
            .order('created_at', { ascending: true })
          if (error || !data) return
          setItems(data as unknown as TradeItemDTO[])
        })()
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [trade?.id, open])

  const myItems = useMemo(() => {
    if (!trade || !meId) return [] as TradeItemDTO[]
    return items.filter(it => it.user_id === meId)
  }, [items, trade, meId])

  const otherItems = useMemo(() => {
    if (!trade || !meId) return [] as TradeItemDTO[]
    return items.filter(it => it.user_id !== meId)
  }, [items, trade, meId])

  const offeredTotal = (list: TradeItemDTO[]) => list.reduce((acc, it) => acc + (it.stacks ?? 0), 0)

  const myOfferedTotal = offeredTotal(myItems)
  const otherOfferedTotal = offeredTotal(otherItems)

  const canConfirm = !!trade && trade.status === 'active' && myReady && otherReady

  async function updateMyItems(next: Array<{ item_id: string; stacks: number }>) {
    if (!trade) return
    setBusy(true)
    const ok = await setTradeItems(trade.id, next)
    setBusy(false)
    if (!ok) {
      setError('Could not update your offer. Please try again in a moment.')
    }
  }

  function computeMyOfferSnapshot(): Record<string, number> {
    const snapshot: Record<string, number> = {}
    for (const it of myItems) {
      snapshot[it.item_id] = (snapshot[it.item_id] ?? 0) + (it.stacks ?? 0)
    }
    return snapshot
  }

  const myOfferMap = computeMyOfferSnapshot()

  const availableInventory = useMemo(() => {
    if (!inventory.length) return [] as Array<{ id: string; stacks: number }>
    return inventory.map(it => {
      const offered = myOfferMap[it.id] ?? 0
      const remaining = Math.max(0, (it.stacks ?? 0) - offered)
      return { id: it.id, stacks: remaining }
    })
  }, [inventory, myOfferMap])

  const pageSize = 15
  const totalPages = Math.max(1, Math.ceil(availableInventory.length / pageSize))
  const clampedPage = Math.min(invPage, totalPages - 1)
  const pagedInventory = useMemo(() => {
    const start = clampedPage * pageSize
    return availableInventory.slice(start, start + pageSize)
  }, [availableInventory, clampedPage])

  useEffect(() => {
    if (!open) return
    // Reset page when reopening to ensure we start from first page
    setInvPage(0)
  }, [open])

  useEffect(() => {
    if (!open) {
      setOtherOnline(null)
      return
    }
    // Determine the other user's id, preferring explicit prop, else from trade
    let targetId = otherUserId
    if (!targetId && trade && meId) {
      targetId = trade.user_a_id === meId ? trade.user_b_id : trade.user_a_id
    }
    if (!targetId) {
      setOtherOnline(null)
      return
    }
    const existing = supabase.getChannels().find(c => c.topic === 'realtime:presence:global')
    if (!existing) {
      setOtherOnline(null)
      return
    }
    try {
      const state = existing.presenceState() as Record<string, Array<{ user_id: string }>>
      let online = false
      Object.values(state).forEach(arr => {
        arr.forEach(meta => {
          if (meta.user_id === targetId) online = true
        })
      })
      setOtherOnline(online)
      if (!online) {
        setError('This player appears to be offline. Trading is disabled until they return.')
      }
    } catch {
      setOtherOnline(null)
    }
  }, [open, otherUserId, trade?.id, meId])

  if (!open) return null
  if (!trade) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trade"
        onClick={onClose}
        className="anim-fade-in"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1400 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="anim-scale-in anim-slide-up"
          style={{ width: 'min(520px, 92vw)', background: '#020617', border: '1px solid #111827', borderRadius: 12, padding: 16, color: '#e5e7ff' }}
        >
          <div style={{ fontSize: 14, marginBottom: 8 }}>Starting trade...</div>
          {error && <div style={{ fontSize: 12, color: '#f97373' }}>{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trade"
      onClick={onClose}
      className="anim-fade-in"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 1400 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-scale-in anim-slide-up"
        style={{ width: 'min(980px, 98vw)', maxHeight: '92vh', background: '#020617', border: '1px solid #111827', borderRadius: 16, padding: 16, color: '#e5e7ff', display: 'grid', gridTemplateColumns: '1fr auto 1fr', columnGap: 12, rowGap: 12 }}
      >
        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Your Offer</strong>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Items from your permanent inventory</span>
          </div>
          <div style={{ borderRadius: 10, border: '1px solid #1f2937', background: '#020617', padding: 8, display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 6, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af' }}>
              <span>Inventory</span>
              <span>Tap to add to offer</span>
            </div>
            <div style={{ overflowY: 'auto', minHeight: 80 }}>
              {availableInventory.length === 0 ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>No available items.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {pagedInventory.map((it) => {
                    const def = itemRegistry.get(it.id)
                    const iconUrl = def?.imageKey ? itemIconMap[def.imageKey.toLowerCase()] : undefined
                    const blessed = def?.rarity === 'epic'
                    const borderColor = blessed ? '#fbbf24' : '#1f2937'
                    const glow = blessed ? '0 0 8px rgba(251,191,36,0.7)' : 'none'
                    return (
                      <button
                        key={it.id}
                        type="button"
                        disabled={it.stacks <= 0 || busy}
                        onClick={() => {
                          if (it.stacks <= 0 || busy) return
                          const existing = myItems.find(x => x.item_id === it.id)
                          const nextStacks = (existing?.stacks ?? 0) + 1
                          const next = myItems
                            .filter(x => x.item_id !== it.id)
                            .map(x => ({ item_id: x.item_id, stacks: x.stacks }))
                          next.push({ item_id: it.id, stacks: nextStacks })
                          void updateMyItems(next)
                        }}
                        className="hover-chip"
                        style={{ padding: 4, borderRadius: 8, border: `1px solid ${borderColor}`, background: '#020617', color: '#e5e7ff', fontSize: 10, display: 'grid', rowGap: 3, textAlign: 'left', opacity: it.stacks <= 0 ? 0.4 : 1, boxShadow: glow }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid #1f2937', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden', margin: '0 auto' }}>
                          {iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={iconUrl} alt={def?.name ?? it.id} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 4 }} />
                          ) : (
                            <span style={{ fontSize: 10 }}>{(def?.name ?? it.id).slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def?.name ?? it.id}</span>
                        <span style={{ fontSize: 9, color: '#9ca3af' }}>Owned: {it.stacks + (myOfferMap[it.id] ?? 0)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {availableInventory.length > pageSize && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#9ca3af' }}>
                <button
                  type="button"
                  disabled={clampedPage === 0}
                  onClick={() => setInvPage((p) => Math.max(0, p - 1))}
                  className="hover-chip"
                  style={{ height: 22, padding: '0 8px', borderRadius: 999, border: '1px solid #1f2937', background: '#020617', color: clampedPage === 0 ? '#4b5563' : '#e5e7ff', cursor: clampedPage === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Prev
                </button>
                <span>Page {clampedPage + 1} / {totalPages}</span>
                <button
                  type="button"
                  disabled={clampedPage >= totalPages - 1}
                  onClick={() => setInvPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="hover-chip"
                  style={{ height: 22, padding: '0 8px', borderRadius: 999, border: '1px solid #1f2937', background: '#020617', color: clampedPage >= totalPages - 1 ? '#4b5563' : '#e5e7ff', cursor: clampedPage >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 8, borderRadius: 10, border: '1px solid #1f2937', background: '#020617', padding: 8, display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 6, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af' }}>
              <span>Your offer ({myOfferedTotal} total)</span>
              <span>Tap to remove</span>
            </div>
            <div style={{ overflowY: 'auto', minHeight: 80 }}>
              {myItems.length === 0 ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>No items offered yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                  {myItems.map((it) => {
                    const def = itemRegistry.get(it.item_id)
                    const iconUrl = def?.imageKey ? itemIconMap[def.imageKey.toLowerCase()] : undefined
                    const blessed = def?.rarity === 'epic'
                    const borderColor = blessed ? '#fbbf24' : '#1f2937'
                    const glow = blessed ? '0 0 8px rgba(251,191,36,0.7)' : 'none'
                    return (
                      <button
                        key={it.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (busy) return
                          const remaining = Math.max(0, (it.stacks ?? 0) - 1)
                          const next = myItems
                            .filter(x => x.id !== it.id)
                            .map(x => ({ item_id: x.item_id, stacks: x.stacks }))
                          if (remaining > 0) next.push({ item_id: it.item_id, stacks: remaining })
                          void updateMyItems(next)
                        }}
                        className="hover-chip"
                        style={{ padding: 6, borderRadius: 8, border: `1px solid ${borderColor}`, background: '#020617', color: '#e5e7ff', fontSize: 11, display: 'grid', rowGap: 4, textAlign: 'left', boxShadow: glow }}
                      >
                        <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 6, border: '1px solid #1f2937', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                          {iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={iconUrl} alt={def?.name ?? it.item_id} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 4 }} />
                          ) : (
                            <span style={{ fontSize: 10 }}>{(def?.name ?? it.item_id).slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def?.name ?? it.item_id}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>Stacks: {it.stacks}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', alignContent: 'center', rowGap: 8, padding: '0 4px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>Trade</div>
          <button
            type="button"
            disabled={busy || otherOnline === false}
            onClick={async () => {
              if (busy || !trade) return
              setBusy(true)
              const next = await setTradeReady(trade.id, !myReady)
              setBusy(false)
              if (next) setTrade(next)
            }}
            className="hover-chip"
            style={{ minWidth: 120, padding: '6px 12px', borderRadius: 999, border: '1px solid #4f46e5', background: myReady ? '#111827' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#e5e7ff', fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            {myReady ? 'Unready' : 'Accept Offer'}
          </button>
          <div style={{ fontSize: 11, color: otherReady ? '#4ade80' : '#9ca3af', textAlign: 'center' }}>
            {otherReady ? 'Other player ready' : 'Waiting for other player'}
          </div>
          <button
            type="button"
            disabled={!canConfirm || busy || otherOnline === false}
            onClick={async () => {
              if (!trade || !canConfirm || busy) return
              setBusy(true)
              const next = await finalizeTrade(trade.id)
              setBusy(false)
              if (next && next.status === 'completed') {
                onClose()
              }
            }}
            className="hover-chip"
            style={{ minWidth: 140, padding: '6px 12px', borderRadius: 999, border: '1px solid #22c55e', background: canConfirm ? 'linear-gradient(135deg,#16a34a,#22c55e)' : '#022c22', color: canConfirm ? '#ecfdf5' : '#4ade80', fontSize: 12, cursor: !canConfirm || busy ? 'not-allowed' : 'pointer', marginTop: 12 }}
          >
            Confirm Trade
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="hover-chip"
            style={{ minWidth: 120, padding: '6px 12px', borderRadius: 999, border: '1px solid #374151', background: '#020617', color: '#e5e7ff', fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', marginTop: 4 }}
          >
            Cancel
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <strong style={{ fontSize: 14 }}>Their Offer</strong>
          </div>
          <div style={{ borderRadius: 10, border: '1px solid #1f2937', background: '#020617', padding: 8, display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 6, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af' }}>
              <span>Items offered ({otherOfferedTotal} total)</span>
            </div>
            <div style={{ overflowY: 'auto', minHeight: 80 }}>
              {otherItems.length === 0 ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>No items offered yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                  {otherItems.map((it) => {
                    const def = itemRegistry.get(it.item_id)
                    const iconUrl = def?.imageKey ? itemIconMap[def.imageKey.toLowerCase()] : undefined
                    const blessed = def?.rarity === 'epic'
                    const borderColor = blessed ? '#fbbf24' : '#1f2937'
                    const glow = blessed ? '0 0 8px rgba(251,191,36,0.7)' : 'none'
                    return (
                      <div key={it.id} style={{ padding: 6, borderRadius: 8, border: `1px solid ${borderColor}`, background: '#020617', color: '#e5e7ff', fontSize: 11, display: 'grid', rowGap: 4, boxShadow: glow }}>
                        <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 6, border: '1px solid #1f2937', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                          {iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={iconUrl} alt={def?.name ?? it.item_id} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 4 }} />
                          ) : (
                            <span style={{ fontSize: 10 }}>{(def?.name ?? it.item_id).slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def?.name ?? it.item_id}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>Stacks: {it.stacks}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
