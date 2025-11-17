import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppState } from '../lib/state'
import { uploadAvatar, validateAvatarFile, deleteAvatarByUrl } from '../lib/storage'
import { updateMyAvatarUrl, updateMyCharacterSprite } from '../lib/profile'

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
  const username = useAppState((s) => s.player.username)
  const avatarUrl = useAppState((s) => s.player.avatarUrl)
  const level = useAppState((s) => s.player.level)
  const characterSprite = useAppState((s) => s.player.characterSprite)
  const setPlayer = useAppState((s) => s.setPlayer)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Discover available character models (same folder GameScene uses)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const characterUrls = import.meta.glob('../assets/character_models/*.png', { eager: true, as: 'url' }) as Record<string, string>
  const spriteOptions = useMemo(() => {
    const entries = Object.entries(characterUrls).map(([path, url]) => {
      const fname = path.split('/').pop() as string
      const base = fname.replace(/\.png$/i, '')
      const key = `player:${base.toLowerCase()}`
      const label = base.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      return { key, url, label }
    })
    // Stable ordering by filename
    entries.sort((a, b) => a.key.localeCompare(b.key))
    return entries
  }, [])

  const unlockLevels = [0, 5, 15, 25, 50]

  function requiredLevelForIndex(idx: number): number {
    const i = Math.min(idx, unlockLevels.length - 1)
    return unlockLevels[i]
  }

  async function onAvatarChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const err = validateAvatarFile(file)
    if (err) { setMsg(err); return }
    setBusy(true)
    setMsg('Uploading avatar...')
    const url = await uploadAvatar(file)
    if (!url) {
      setMsg('Upload failed. Try a different image.')
      setBusy(false)
      return
    }
    setMsg('Saving profile...')
    const updated = await updateMyAvatarUrl(url)
    setBusy(false)
    if (!updated) {
      setMsg('Could not save avatar URL. Please retry.')
      return
    }
    setPlayer({ avatarUrl: updated.avatar_url })
    setMsg('Avatar updated!')
  }

  async function signOut() {
    await supabase.auth.signOut()
    // Enforce returning to login page
    window.location.reload()
  }

  async function removeAvatar() {
    if (!avatarUrl) return
    setBusy(true)
    setMsg('Removing avatar...')
    // Best-effort remove from storage (public bucket)
    await deleteAvatarByUrl(avatarUrl)
    const updated = await updateMyAvatarUrl('')
    setBusy(false)
    if (!updated) {
      setMsg('Could not clear avatar. Please retry.')
      return
    }
    setPlayer({ avatarUrl: null })
    setMsg('Avatar removed.')
  }

  async function onSpriteSelect(spriteKey: string | null) {
    if (busy) return
    setBusy(true)
    setMsg('Saving character sprite...')
    const updated = await updateMyCharacterSprite(spriteKey)
    setBusy(false)
    if (!updated) {
      setMsg('Could not save character sprite. Please retry.')
      return
    }
    setPlayer({ characterSprite: updated.character_sprite ?? null })
    setMsg('Character sprite updated!')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Account settings"
      onClick={onClose}
      className="anim-fade-in"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'grid', placeItems: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-scale-in anim-slide-up"
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
            Username
            <input value={username ?? ''} readOnly style={{ height: 32, background: '#0b0e1a', border: '1px solid #2a2f55', borderRadius: 6, color: '#e5e7ff', padding: '0 8px' }} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#b3c0ff' }}>
            Email
            <input value={email} readOnly style={{ height: 32, background: '#0b0e1a', border: '1px solid #2a2f55', borderRadius: 6, color: '#e5e7ff', padding: '0 8px' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 96, height: 96, borderRadius: 12, overflow: 'hidden', border: '1px solid #1f2447', background: '#0b0e1a', display: 'grid', placeItems: 'center' }}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#b3c0ff', fontSize: 12 }}>No avatar</span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#b3c0ff' }}>Upload new avatar (PNG, JPG, WEBP, GIF; max 5MB)</label>
              <input disabled={busy} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" onChange={(e) => onAvatarChange(e as unknown as Event)} />
              {msg && <div style={{ fontSize: 12, color: busy ? '#b3c0ff' : '#91ffb3' }}>{msg}</div>}
            </div>
          </div>

          {spriteOptions.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2447', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#b3c0ff' }}>In-game Character Sprite</div>
              <div style={{ fontSize: 11, color: '#9db0ff' }}>Unlocked by level: 5, 15, 25, 50</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {spriteOptions.map((opt, idx) => {
                  const req = requiredLevelForIndex(idx)
                  const unlocked = level >= req
                  const selected = characterSprite === opt.key || (!characterSprite && idx === 0)
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={busy || !unlocked}
                      onClick={() => { if (unlocked) void onSpriteSelect(opt.key) }}
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 8,
                        border: selected ? '2px solid #6aa6ff' : '1px solid #2a2f55',
                        background: unlocked ? '#0b0e1a' : '#050716',
                        opacity: unlocked ? 1 : 0.4,
                        padding: 4,
                        position: 'relative',
                        cursor: unlocked && !busy ? 'pointer' : 'default',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={opt.url} alt={opt.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      {!unlocked && (
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 10, color: '#f97373', background: 'rgba(0,0,0,0.45)' }}>Lvl {req}</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', marginTop: 16, gap: 8, justifyContent: 'flex-end' }}>
          <button disabled={busy || !avatarUrl} onClick={removeAvatar} style={{ height: 32, padding: '0 12px', background: '#101531', border: '1px solid #2a2f55', borderRadius: 6, color: '#b3c0ff', cursor: busy || !avatarUrl ? 'default' : 'pointer' }}>Remove avatar</button>
          <button onClick={onClose} style={{ height: 32, padding: '0 12px', background: '#101531', border: '1px solid #2a2f55', borderRadius: 6, color: '#b3c0ff', cursor: 'pointer' }}>Close</button>
          <button onClick={signOut} style={{ height: 32, padding: '0 12px', background: '#e11d48', border: '1px solid #dc143c', borderRadius: 6, color: 'white', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
