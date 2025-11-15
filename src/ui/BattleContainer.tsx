import { useEffect, useRef, useState } from 'react'
import { ensureAuth } from '../lib/auth'
import { bootGame } from '../lib/bootPhaser'

/**
 * BattleContainer
 * Hosts the Phaser canvas within a fixed-aspect container.
 */
export function BattleContainer(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const onReady = () => { setLoading(false); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }
    if (typeof window !== 'undefined') {
      window.addEventListener('game:scene-ready', onReady as EventListener)
    }
    ;(async () => {
      // Ensure we start at top before any async work
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      // Ensure auth first; BattleScene can assume session exists
      await ensureAuth(document.body)
      if (cancelled) return
      if (hostRef.current) {
        // Boot Phaser inside this host element
        await bootGame(hostRef.current)
        // After Phaser boot, keep viewport pinned to top
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      }
    })()
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('game:scene-ready', onReady as EventListener)
      }
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 960 }}>
      <div
        ref={hostRef}
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#0f1226',
          border: '1px solid #1f2447',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, rgba(11,14,26,0.92), rgba(11,14,26,0.92))',
            border: '1px solid #1f2447',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                border: '3px solid #243057',
                borderTopColor: '#9db0ff',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ color: '#9db0ff', fontFamily: 'system-ui, sans-serif', fontSize: 12 }}>Loading game…</div>
          </div>
          <style>
            {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
          </style>
        </div>
      )}
    </div>
  )
}
