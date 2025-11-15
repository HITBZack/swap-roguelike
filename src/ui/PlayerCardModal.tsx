import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMyProfile, fetchProfileById, updateMyAbout, updateMyTitles } from '../lib/profile'
import { getFriendshipStatus, sendFriendRequest, acceptFriendRequest, denyFriendRequest } from '../lib/friends'
import type { ProfileDTO } from '../lib/profile'
import { listInventory } from '../services/Inventory'

export interface PlayerCardModalProps {
  open: boolean
  onClose: () => void
  username: string
  email: string
  avatarUrl: string | null
  userId?: string
}

export function PlayerCardModal({ open, onClose, username, email, avatarUrl, userId }: PlayerCardModalProps): JSX.Element | null {
  // Hooks must be declared before any early returns
  const [profile, setProfile] = useState<ProfileDTO | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [about, setAbout] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingTitles, setSavingTitles] = useState(false)
  const [titles, setTitles] = useState<string[]>([])
  const [openTitles, setOpenTitles] = useState(false)
  const titleOptions = useMemo(() => ['Noob', 'buying gf', 'Goblin Slayer'], [])
  const aboutMax = 300
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none')
  const [itemsOwned, setItemsOwned] = useState<number | null>(null)

  const initials = useMemo(() => {
    const base = username || email
    if (!base) return '🙂'
    const name = base.split('@')[0]
    const first = name[0]?.toUpperCase() ?? 'U'
    return first
  }, [username, email])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const authId = data.user?.id
      const target = userId && userId !== authId ? await fetchProfileById(userId) : await fetchMyProfile()
      const isSelf = target?.id === authId
      if (mounted) setCanEdit(Boolean(isSelf))
      if (mounted && target) {
        setProfile(target)
        setAbout(target.about ?? '')
        setTitles(target.equipped_titles ?? [])
      }
      if (mounted && !isSelf && target?.id) {
        const st = await getFriendshipStatus(target.id)
        if (st) setFriendStatus(st)
      }
      // Items owned only for self (we cannot read others' inventory)
      if (mounted && isSelf) {
        try {
          const inv = await listInventory()
          const total = inv.reduce((acc, it) => acc + (it.stacks ?? 0), 0)
          setItemsOwned(total)
        } catch {
          setItemsOwned(null)
        }
      } else {
        setItemsOwned(null)
      }
    })()
    return () => { mounted = false }
  }, [email, userId])

  function sanitizeAbout(input: string): string {
    // Allow letters, numbers, basic punctuation, spaces, emojis stripped if unsupported. Newlines allowed.
    const cleaned = input.replace(/[^A-Za-z0-9 .,!?@#'"()\-:_\n]/g, '')
    return cleaned.slice(0, aboutMax)
  }

  function onAboutChange(e: { target: { value: string } }) {
    const val = e.target.value
    const cleaned = sanitizeAbout(val)
    setAbout(cleaned)
  }

  async function saveAbout() {
    setSaving(true)
    const updated = await updateMyAbout(about)
    setSaving(false)
    if (updated) setProfile(updated)
  }

  function toggleTitle(t: string) {
    setTitles((prev) => {
      const has = prev.includes(t)
      if (has) return prev.filter((x) => x !== t)
      if (prev.length >= 2) return prev // prevent adding beyond 2
      return [...prev, t]
    })
  }

  async function saveTitles() {
    setSavingTitles(true)
    const updated = await updateMyTitles(titles)
    setSavingTitles(false)
    if (updated) setProfile(updated)
  }

  if (!open) return null

  return (
    <>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Player card"
      onClick={onClose}
      className="anim-fade-in"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-scale-in anim-slide-up"
        style={{
          width: 'min(720px, 95vw)',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid #2a2f55',
          background: 'linear-gradient(135deg, #0f1226 0%, #101a3a 60%, #0f1226 100%)',
          color: '#e5e7ff',
          boxShadow: '0 18px 60px rgba(0,0,0,0.45)'
        }}
      >
        <div style={{ position: 'relative', padding: 16, background: 'linear-gradient(180deg, rgba(88,101,242,0.14), rgba(16,21,49,0))' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(800px 220px at 20% -30%, rgba(88,101,242,0.18), transparent 60%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 90, height: 90, borderRadius: 12, border: '1px solid #3a428a', overflow: 'hidden', background: '#0b0e1a', flex: '0 0 auto' }}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#b3c0ff', fontSize: 28 }}>{initials}</div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{username || 'Adventurer'}</h2>
                <span style={{ fontSize: 12, color: '#9db0ff' }}>{email}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842' }}>Guild: Silver Serpents</span>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842' }}>Rank: Acolyte</span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {!canEdit && profile?.id && (
                friendStatus === 'none' ? (
                  <button onClick={async () => { await sendFriendRequest(profile.id); setFriendStatus('pending_sent') }} className="hover-chip" style={{ background: '#194a2a', border: '1px solid #2f5d3d', color: '#c8ffda', borderRadius: 8, height: 32, padding: '0 10px', cursor: 'pointer', fontSize: 12 }}>Add Friend</button>
                ) : friendStatus === 'pending_sent' ? (
                  <span style={{ alignSelf: 'center', fontSize: 12, color: '#9db0ff' }}>Request sent</span>
                ) : friendStatus === 'pending_received' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={async () => { if (!profile?.id) return; await acceptFriendRequest(profile.id); setFriendStatus('accepted') }} className="hover-chip" style={{ background: '#194a2a', border: '1px solid #2f5d3d', color: '#c8ffda', borderRadius: 8, height: 32, padding: '0 10px', cursor: 'pointer', fontSize: 12 }}>Accept</button>
                    <button onClick={async () => { if (!profile?.id) return; await denyFriendRequest(profile.id); setFriendStatus('none') }} className="hover-chip" style={{ background: '#4a1a1a', border: '1px solid #5d2f2f', color: '#ffd1d1', borderRadius: 8, height: 32, padding: '0 10px', cursor: 'pointer', fontSize: 12 }}>Deny</button>
                  </div>
                ) : (
                  <span style={{ alignSelf: 'center', fontSize: 12, color: '#9db0ff' }}>Friends</span>
                )
              )}
              <button onClick={onClose} aria-label="Close" style={{ background: '#101531', border: '1px solid #2a2f55', color: '#b3c0ff', borderRadius: 8, height: 32, padding: '0 10px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14, padding: 16 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid #1f2447', borderRadius: 10, background: '#0f1226', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#91ffb3' }} />
                <strong style={{ fontSize: 13 }}>Statistics</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 12 }}>
                <div style={{ padding: 10, border: '1px solid #2a2f55', borderRadius: 8, background: '#101531' }}>
                  <div style={{ color: '#9db0ff' }}>Level</div>
                  <div style={{ fontSize: 18 }}>{profile?.level ?? '—'}</div>
                </div>
                <div style={{ padding: 10, border: '1px solid #2a2f55', borderRadius: 8, background: '#101531' }}>
                  <div style={{ color: '#9db0ff' }}>Deaths</div>
                  <div style={{ fontSize: 18 }}>{profile?.deaths ?? 0}</div>
                </div>
                <div style={{ padding: 10, border: '1px solid #2a2f55', borderRadius: 8, background: '#101531' }}>
                  <div style={{ color: '#9db0ff' }}>Items Owned</div>
                  <div style={{ fontSize: 18 }}>{itemsOwned != null ? itemsOwned : '—'}</div>
                </div>
                <div style={{ padding: 10, border: '1px solid #2a2f55', borderRadius: 8, background: '#101531' }}>
                  <div style={{ color: '#9db0ff' }}>—</div>
                  <div style={{ fontSize: 18 }}>—</div>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #1f2447', borderRadius: 10, background: '#0f1226', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#ffd166' }} />
                <strong style={{ fontSize: 13 }}>Showcase Items</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const item = profile?.showcase_items?.[i]
                  return (
                    <div key={i} style={{ height: 64, border: '1px dashed #2a2f55', borderRadius: 8, background: '#0b0e1a', display: 'grid', placeItems: 'center', color: item ? '#e5e7ff' : '#3e4aa6', fontSize: 12 }}>
                      {item ?? 'Empty'}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid #1f2447', borderRadius: 10, background: '#0f1226', overflow: 'hidden' }}>
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#7dd3fc' }} />
                <strong style={{ fontSize: 13 }}>Titles</strong>
                {canEdit && (
                  <button onClick={() => setOpenTitles(true)} className="hover-chip" style={{ marginLeft: 'auto', height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #3a428a', background: '#111842', color: '#e5e7ff', cursor: 'pointer', fontSize: 12 }}>Edit titles</button>
                )}
              </div>
              <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {profile?.equipped_titles && profile.equipped_titles.length > 0 ? (
                  profile.equipped_titles.map((t) => (
                    <span key={t} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842' }}>{t}</span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: '#9db0ff' }}>No titles equipped</span>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid #1f2447', borderRadius: 10, background: '#0f1226', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#f472b6' }} />
                <strong style={{ fontSize: 13 }}>About</strong>
              </div>
              {canEdit ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <textarea value={about} onChange={onAboutChange} rows={4} style={{ resize: 'vertical', width: '100%', background: '#0b0e1a', border: '1px solid #2a2f55', borderRadius: 8, color: '#e5e7ff', padding: 10, fontSize: 12 }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: about.length > aboutMax - 20 ? '#ffd166' : '#9db0ff' }}>{about.length}/{aboutMax}</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button disabled={saving} onClick={saveAbout} className="hover-chip" style={{ height: 30, padding: '0 12px', background: '#5865f2', border: '1px solid #4e5ae6', borderRadius: 8, color: 'white', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#b3c0ff', lineHeight: 1.5 }}>
                  {profile?.about || 'No bio yet.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    {openTitles && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit titles"
        onClick={() => setOpenTitles(false)}
        className="anim-fade-in"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1200 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="anim-scale-in anim-slide-up"
          style={{ width: 'min(560px, 92vw)', background: '#0f1226', border: '1px solid #1f2447', borderRadius: 12, padding: 16, color: '#e5e7ff' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <strong style={{ fontSize: 14 }}>Select up to 2 titles</strong>
            <button onClick={() => setOpenTitles(false)} aria-label="Close" className="hover-chip" style={{ marginLeft: 'auto', height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #2a2f55', background: '#101531', color: '#b3c0ff', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                title="None"
                onClick={() => setTitles([])}
                className="hover-chip"
                style={{ fontSize: 13, padding: '8px 12px', borderRadius: 999, border: '1px solid #3a428a', background: titles.length === 0 ? '#1a2255' : '#111842', color: '#e5e7ff', cursor: 'pointer', transform: titles.length === 0 ? 'scale(1.07)' : 'scale(1)' }}
              >None</button>
              {titleOptions.map((t) => {
                const selected = titles.includes(t)
                const disabled = !selected && titles.length >= 2
                return (
                  <button
                    key={t}
                    type="button"
                    title={selected ? 'Click to remove' : (disabled ? 'Max 2 titles' : 'Click to add')}
                    onClick={() => toggleTitle(t)}
                    disabled={disabled}
                    className="hover-chip"
                    style={{ fontSize: 13, padding: '8px 12px', borderRadius: 999, border: '1px solid #3a428a', background: selected ? '#1a2255' : '#111842', color: disabled ? '#7a83c8' : '#e5e7ff', cursor: disabled ? 'not-allowed' : 'pointer', transform: selected ? 'scale(1.07)' : 'scale(1)' }}
                  >{t}</button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpenTitles(false)} className="hover-chip" style={{ height: 30, padding: '0 12px', background: '#101531', border: '1px solid #2a2f55', borderRadius: 8, color: '#b3c0ff', cursor: 'pointer' }}>Cancel</button>
              <button disabled={savingTitles} onClick={async () => { await saveTitles(); setOpenTitles(false) }} className="hover-chip" style={{ height: 30, padding: '0 12px', background: '#5865f2', border: '1px solid #4e5ae6', borderRadius: 8, color: 'white', cursor: 'pointer' }}>{savingTitles ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
