import { useEffect, useRef } from 'react'
import { ensureAuth } from '../lib/auth'
import { bootGame } from '../lib/bootPhaser'

/**
 * BattleContainer
 * Hosts the Phaser canvas within a fixed-aspect container.
 */
export function BattleContainer(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Ensure auth first; BattleScene can assume session exists
      await ensureAuth(document.body)
      if (cancelled) return
      if (hostRef.current) {
        // Boot Phaser inside this host element
        await bootGame(hostRef.current)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        maxWidth: 960,
        aspectRatio: '16 / 9',
        background: '#0f1226',
        border: '1px solid #1f2447',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    />
  )
}
