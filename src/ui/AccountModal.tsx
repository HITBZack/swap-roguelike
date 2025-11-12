import React from 'react'
import { supabase } from '../lib/supabase'

export interface AccountModalProps {
  open: boolean
  onClose: () => void
  email: string
}

/**
 * AccountModal
 * Simple account settings modal. Shows email, placeholder settings, and sign-out.
 */
export function AccountModal({ open, onClose, email }: AccountModalProps): JSX.Element | null {
  if (!open) return null

  async function signOut() {
    await supabase.auth.signOut()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Account settings"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'grid', placeItems: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)', background: '#0f1226', border: '1px solid #1f2447', borderRadius: 10,
          padding: 16, color: '#e5e7ff', boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Account Settings</h3>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: '#b3c0ff', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#b3c0ff' }}>
            Email
            <input value={email} readOnly style={{ height: 32, background: '#0b0e1a', border: '1px solid #2a2f55', borderRadius: 6, color: '#e5e7ff', padding: '0 8px' }} />
          </label>

          {/* TODO: Link to profile (username, avatar_url) from Supabase profiles table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#b3c0ff' }}>
              Username
              <input placeholder="Coming soon" disabled style={{ height: 32, background: '#0b0e1a', border: '1px dashed #2a2f55', borderRadius: 6, color: '#94a3b8', padding: '0 8px' }} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#b3c0ff' }}>
              Avatar URL
              <input placeholder="Coming soon" disabled style={{ height: 32, background: '#0b0e1a', border: '1px dashed #2a2f55', borderRadius: 6, color: '#94a3b8', padding: '0 8px' }} />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', marginTop: 16, gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ height: 32, padding: '0 12px', background: '#101531', border: '1px solid #2a2f55', borderRadius: 6, color: '#b3c0ff', cursor: 'pointer' }}>Close</button>
          <button onClick={signOut} style={{ height: 32, padding: '0 12px', background: '#e11d48', border: '1px solid #dc143c', borderRadius: 6, color: 'white', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
