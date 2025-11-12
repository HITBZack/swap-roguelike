import React, { useMemo, useState } from 'react'
import { useAppState } from '../lib/state'
import { updateMyUsername } from '../lib/profile'

export interface UsernameModalProps {
  open: boolean
}

/**
 * UsernameModal
 * Prompts the user to choose a username after auth if none exists.
 */
export function UsernameModal({ open }: UsernameModalProps): JSX.Element | null {
  const setUi = useAppState((s) => s.setUi)
  const setPlayer = useAppState((s) => s.setPlayer)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = useMemo(() => /^[a-zA-Z0-9_]{3,20}$/.test(name), [name])

  if (!open) return null

  async function submit(): Promise<void> {
    setError(null)
    if (!valid) {
      setError('Username must be 3-20 chars: letters, numbers, underscore')
      return
    }
    setBusy(true)
    const updated = await updateMyUsername(name)
    setBusy(false)
    if (!updated) {
      setError('Could not update username. Try another name.')
      return
    }
    setPlayer({ username: updated.username ?? undefined })
    setUi({ needUsername: false })
  }

  function close(): void {
    // Force choosing a username by not allowing close without saving
    // If you want to allow skip, set needUsername to false here instead.
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a username"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}
    >
      <div style={{ width: 'min(520px, 92vw)', background: '#0f1226', border: '1px solid #1f2447', borderRadius: 10, padding: 16, color: '#e5e7ff' }}>
        <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Pick a username</h3>
        <p style={{ marginTop: 0, marginBottom: 12, fontSize: 12, color: '#b3c0ff' }}>This will be visible to other players.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            autoFocus
            placeholder="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ height: 36, background: '#0b0e1a', border: '1px solid #2a2f55', borderRadius: 6, color: '#e5e7ff', padding: '0 10px' }}
          />
          {!valid && name.length > 0 && (
            <div style={{ fontSize: 12, color: '#fca5a5' }}>Use 3-20 chars: a-z, A-Z, 0-9, _</div>
          )}
          {error && <div style={{ fontSize: 12, color: '#fca5a5' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button disabled={busy || !valid} onClick={submit} style={{ height: 32, padding: '0 12px', background: '#5865f2', border: '1px solid #4e5ae6', borderRadius: 6, color: 'white', cursor: 'pointer', opacity: busy || !valid ? 0.7 : 1 }}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
