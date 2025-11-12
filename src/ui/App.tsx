import React, { useEffect, useMemo, useState } from 'react'
import { BattleContainer } from './BattleContainer'
import { supabase } from '../lib/supabase'
import { AccountModal } from './AccountModal'
import { useAppState } from '../lib/state'
import { UsernameModal } from './UsernameModal'

export function App(): JSX.Element {
  const [email, setEmail] = useState<string>('')
  const [openAccount, setOpenAccount] = useState(false)
  const player = useAppState((s) => s.player)
  const needUsername = useAppState((s) => s.ui.needUsername)

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

  const displayName = player.username ?? email
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
            }}
          >
            {displayName || 'Guest'}
          </div>
          <button
            onClick={() => setOpenAccount(true)}
            aria-label="Open account settings"
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
            }}
          >
            <span style={{ fontSize: 14 }}>{initials}</span>
          </button>
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', gap: 12, padding: 12 }}>
        <aside style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Inventory</h3>
          {/* TODO: render inventory items via Zustand & Supabase */}
          <div style={{ opacity: 0.65, fontSize: 12 }}>No items yet</div>
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
        <aside style={{ background: '#0f1226', border: '1px solid #1f2447', borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Friends</h3>
          {/* TODO: Supabase Realtime presence / friends list */}
          <div style={{ opacity: 0.65, fontSize: 12 }}>No friends online</div>
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
      <UsernameModal open={Boolean(needUsername)} />
    </div>
  )
}
