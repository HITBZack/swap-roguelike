import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMyProfile, fetchProfileById, updateMyAbout, updateMyTitles } from '../lib/profile'
import { listMyGuildJoinRequestsAsLeader, handleGuildJoinRequest, type GuildJoinRequestDTO } from '../lib/guilds'
import { TradeModal } from './TradeModal'
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
  const titleOptions = useMemo(() => ['Noob', 'buying gf', 'Goblin Slayer', 'Charizard', 'Zero to Hero', 'Solo'], [])
  const aboutMax = 220
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none')
  const [friendStatusLoaded, setFriendStatusLoaded] = useState(false)
  const [itemsOwned, setItemsOwned] = useState<number | null>(null)
  const [guildRequests, setGuildRequests] = useState<GuildJoinRequestDTO[]>([])
  const [guildReqProfiles, setGuildReqProfiles] = useState<Record<string, { username: string | null; avatar_url: string | null }>>({})
  const [guildReqLoading, setGuildReqLoading] = useState(false)
  const [guildReqBusyId, setGuildReqBusyId] = useState<string | null>(null)
  const [openTrade, setOpenTrade] = useState(false)
  const [tradeTargetId, setTradeTargetId] = useState<string | null>(null)
  const [guildName, setGuildName] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState<boolean | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [targetOnline, setTargetOnline] = useState<boolean | null>(null)

  const initials = useMemo(() => {
    // For self, fall back to props. For others, rely on loaded profile only.
    const base = profile?.username || (isSelf ? (username || email) : '')
    if (!base) return '🙂'
    const name = base.split('@')[0]
    const first = name[0]?.toUpperCase() ?? 'U'
    return first
  }, [profile?.username, username, email, isSelf])

  useEffect(() => {
    if (!open) return
    let mounted = true
    // Reset any stale profile data from previous opens so we don't flash old info.
    setLoadingProfile(true)
    setProfile(null)
    setIsSelf(null)
    setCanEdit(false)
    setGuildName(null)
    setFriendStatus('none')
    setFriendStatusLoaded(false)
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      const authId = data.user?.id
      const target = userId && userId !== authId ? await fetchProfileById(userId) : await fetchMyProfile()
      if (!mounted) return
      const isSelf = target?.id === authId
      setIsSelf(isSelf)
      setCanEdit(Boolean(isSelf))
      if (target) {
        setProfile(target)
        setAbout(target.about ?? '')
        setTitles(target.equipped_titles ?? [])
      }
      // Resolve guild name for this profile
      if (target?.id) {
        let resolved: string | null = null

        // First, see if this user owns a guild (leader/owner)
        const { data: owned, error: ownedErr } = await supabase
          .from('guilds')
          .select('id,name,owner_id')
          .eq('owner_id', target.id)
          .limit(1)
          .maybeSingle()
        if (!ownedErr && owned && (owned as any).name) {
          resolved = (owned as any).name as string
        }

        // If not the owner of any guild, fall back to membership lookup
        if (!resolved) {
          const { data: gm, error: gmErr } = await supabase
            .from('guild_members')
            .select('guild_id, guilds(name)')
            .eq('user_id', target.id)
            .limit(1)
            .maybeSingle()
          if (!gmErr && gm && (gm as any).guilds && (gm as any).guilds.name) {
            resolved = ((gm as any).guilds as any).name as string
          }
        }

        setGuildName(resolved)
      } else {
        setGuildName(null)
      }
      if (!isSelf && target?.id) {
        const st = await getFriendshipStatus(target.id)
        if (st) setFriendStatus(st)
        setFriendStatusLoaded(true)
      } else {
        setFriendStatusLoaded(false)
      }
      // Items owned only for self (we cannot read others' inventory)
      if (isSelf) {
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
      setLoadingProfile(false)
    })()
    return () => { mounted = false }
  }, [open, userId])

  useEffect(() => {
    if (!open || !profile?.id || isSelf) {
      setTargetOnline(null)
      return
    }
    const existing = supabase.getChannels().find(c => c.topic === 'realtime:presence:global')
    if (!existing) {
      setTargetOnline(null)
      return
    }
    try {
      const state = existing.presenceState() as Record<string, Array<{ user_id: string }>>
      let online = false
      Object.values(state).forEach(arr => {
        arr.forEach(meta => {
          if (meta.user_id === profile.id) online = true
        })
      })
      setTargetOnline(online)
    } catch {
      setTargetOnline(null)
    }
  }, [open, profile?.id, isSelf])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      if (!canEdit) return
      setGuildReqLoading(true)
      const reqs = await listMyGuildJoinRequestsAsLeader()
      if (cancelled) return
      setGuildRequests(reqs)
      setGuildReqLoading(false)
      const ids = Array.from(new Set(reqs.map(r => r.user_id)))
      if (!ids.length) {
        setGuildReqProfiles({})
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id,username,avatar_url')
        .in('id', ids)
      if (cancelled || error || !data) return
      const map: Record<string, { username: string | null; avatar_url: string | null }> = {}
      for (const row of data as any[]) {
        map[row.id as string] = { username: row.username ?? null, avatar_url: row.avatar_url ?? null }
      }
      setGuildReqProfiles(map)
    })()
    return () => { cancelled = true }
  }, [open, canEdit])

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
              {loadingProfile && isSelf === null ? (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg,#111827,#1f2937,#111827)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }} />
              ) : (
                (() => {
                  const avatarSrc = isSelf ? (profile?.avatar_url ?? avatarUrl ?? null) : (profile?.avatar_url ?? null)
                  if (avatarSrc) {
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )
                  }
                  return (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#b3c0ff', fontSize: 28 }}>{initials}</div>
                  )
                })()
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>
                  {loadingProfile && isSelf === null
                    ? 'Loading...'
                    : (profile?.username || (isSelf ? username : '') || 'Adventurer')}
                </h2>
                {isSelf && (
                  <span style={{ fontSize: 12, color: '#9db0ff' }}>{email}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {profile ? (
                  guildName ? (
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('social:open-guilds'))
                      }}
                      className="hover-chip"
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842', color: '#e5e7ff', cursor: 'pointer' }}
                    >
                      Guild: {guildName}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842' }}>
                      No guild yet
                    </span>
                  )
                ) : (
                  <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842' }}>
                    Guild: —
                  </span>
                )}
                {!isSelf && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid #1f2937',
                      background: targetOnline ? 'rgba(22,163,74,0.16)' : 'rgba(55,65,81,0.6)',
                      color: targetOnline ? '#4ade80' : '#d1d5db',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: targetOnline ? '#22c55e' : '#6b7280',
                      }}
                    />
                    <span>{targetOnline ? 'Online' : 'Offline'}</span>
                  </span>
                )}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {!canEdit && profile?.id && friendStatusLoaded && (
                <>
                  {friendStatus === 'none' ? (
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
                  )}
                  <button
                    type="button"
                    disabled={targetOnline !== true}
                    onClick={() => { if (targetOnline !== true) return; setTradeTargetId(profile.id); setOpenTrade(true) }}
                    className="hover-chip"
                    style={{ background: '#0b1024', border: '1px solid #3a428a', color: targetOnline === true ? '#e5e7ff' : '#6b7280', borderRadius: 8, height: 32, padding: '0 10px', cursor: targetOnline === true ? 'pointer' : 'not-allowed', fontSize: 12, opacity: targetOnline === true ? 1 : 0.6 }}
                  >
                    {targetOnline === true ? 'Trade' : 'Trade (offline)'}
                  </button>
                </>
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

            {canEdit && !guildReqLoading && guildRequests.length > 0 && (
              <div style={{ border: '1px solid #1f2447', borderRadius: 10, background: '#0f1226', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#a5b4fc' }} />
                  <strong style={{ fontSize: 13 }}>Guild Join Requests</strong>
                </div>
                {guildReqLoading ? (
                  <div style={{ fontSize: 12, color: '#9db0ff' }}>Loading requests...</div>
                ) : guildRequests.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9db0ff' }}>No pending requests.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                    {guildRequests.map((r) => {
                      const prof = guildReqProfiles[r.user_id]
                      const usernameLabel = prof?.username || r.user_id.slice(0, 8)
                      const avatarUrl = prof?.avatar_url ?? null
                      const busy = guildReqBusyId === r.id
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #3a428a', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrl} alt={usernameLabel} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            ) : (
                              <span style={{ fontSize: 12 }}>{usernameLabel.slice(0, 1).toUpperCase()}</span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: '#e5e7ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{usernameLabel}</div>
                            <div style={{ fontSize: 11, color: '#9db0ff' }}>wants to join your guild</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (busy) return
                                setGuildReqBusyId(r.id)
                                const ok = await handleGuildJoinRequest(r.id, true)
                                setGuildReqBusyId(null)
                                if (ok) {
                                  setGuildRequests((prev) => prev.filter(x => x.id !== r.id))
                                }
                              }}
                              className="hover-chip"
                              style={{ height: 26, padding: '0 10px', borderRadius: 8, border: '1px solid #2f5d3d', background: '#194a2a', color: '#c8ffda', fontSize: 11, cursor: busy ? 'default' : 'pointer' }}
                            >
                              {busy ? 'Working...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (busy) return
                                setGuildReqBusyId(r.id)
                                const ok = await handleGuildJoinRequest(r.id, false)
                                setGuildReqBusyId(null)
                                if (ok) {
                                  setGuildRequests((prev) => prev.filter(x => x.id !== r.id))
                                }
                              }}
                              className="hover-chip"
                              style={{ height: 26, padding: '0 10px', borderRadius: 8, border: '1px solid #5d2f2f', background: '#3a1515', color: '#ffd1d1', fontSize: 11, cursor: busy ? 'default' : 'pointer' }}
                            >
                              {busy ? 'Working...' : 'Reject'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
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
    <TradeModal
      open={openTrade}
      onClose={() => { setOpenTrade(false); setTradeTargetId(null) }}
      otherUserId={tradeTargetId ?? undefined}
    />
    </>
  )
}
