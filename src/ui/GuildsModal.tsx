import { useEffect, useRef, useState } from 'react'
import { listPublicGuilds, createMyGuild, requestJoinGuild, leaveMyGuild, transferGuildOwnership, type GuildDTO, type GuildJoinResult } from '../lib/guilds'
import { supabase } from '../lib/supabase'
import { uploadAvatar, validateAvatarFile } from '../lib/storage'

export interface GuildsModalProps {
  open: boolean
  onClose: () => void
}

export function GuildsModal({ open, onClose }: GuildsModalProps): JSX.Element | null {
  const [guilds, setGuilds] = useState<GuildDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageMsg, setImageMsg] = useState<string | null>(null)
  const [autoAccept, setAutoAccept] = useState(false)
  const [maxMembers, setMaxMembers] = useState(100)
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null)
  const [joinOutcomes, setJoinOutcomes] = useState<Record<string, GuildJoinResult>>({})
  const [myGuildId, setMyGuildId] = useState<string | null>(null)
  const overlayMouseDownOutsideRef = useRef(false)

  async function onImageChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const err = validateAvatarFile(file)
    if (err) { setImageMsg(err); return }
    // Store locally; upload will happen only if guild is actually created
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
    setImageMsg(null)
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const list = await listPublicGuilds()
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id ?? null

      if (!cancelled) {
        setGuilds(list)
        // If we know the current user id, infer their guild from ownership
        if (uid) {
          const mine = list.find(g => g.owner_id === uid)
          setMyGuildId(mine ? mine.id : null)
        } else {
          setMyGuildId(null)
        }
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  const membersLabel = (g: GuildDTO) => `${g.member_count}/${g.max_members}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guilds"
      onMouseDown={(e) => {
        // Only mark as outside-start if the initial press is on the backdrop itself
        if (e.target === e.currentTarget && !imageBusy) {
          overlayMouseDownOutsideRef.current = true
        }
      }}
      onClick={(e) => {
        // Close only if the click began on the backdrop (not a drag starting inside)
        if (e.target === e.currentTarget && overlayMouseDownOutsideRef.current && !imageBusy) {
          onClose()
        }
        overlayMouseDownOutsideRef.current = false
      }}
      className="anim-fade-in"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1300 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-scale-in anim-slide-up"
        style={{ width: 'min(880px, 96vw)', maxHeight: '90vh', background: '#020617', border: '1px solid #1f2937', borderRadius: 14, padding: 16, color: '#e5e7ff', display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', columnGap: 16, rowGap: 12, overflow: 'hidden' }}
      >
        <div style={{ display: 'grid', rowGap: 10, borderRight: '1px solid #111827', paddingRight: 12, alignContent: 'flex-start', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{myGuildId ? 'Your Guild' : 'Create a Guild'}</strong>
            <button
              type="button"
              disabled={imageBusy}
              onClick={onClose}
              style={{ marginLeft: 'auto', height: 26, padding: '0 10px', borderRadius: 999, border: '1px solid #374151', background: '#020617', color: '#9ca3af', fontSize: 11, cursor: imageBusy ? 'not-allowed' : 'pointer', opacity: imageBusy ? 0.6 : 1 }}
            >
              Close
            </button>
          </div>
          {!myGuildId && (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Pick a name, image, and description for your guild. You can choose whether to auto-accept join requests.</div>
          )}
          {myGuildId && (
            <GuildDetails guilds={guilds} myGuildId={myGuildId} />
          )}
          {!myGuildId && (
          <label style={{ display: 'grid', rowGap: 4, fontSize: 12, color: '#9ca3af' }}>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              style={{ height: 30, borderRadius: 8, border: '1px solid #1f2937', background: '#020617', color: '#e5e7ff', padding: '0 8px', fontSize: 13 }}
            />
          </label>
          )}
          {!myGuildId && (
          <div style={{ display: 'grid', rowGap: 6, fontSize: 12, color: '#9ca3af' }}>
            <span>Guild image</span>
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', columnGap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, border: '1px solid #1f2937', background: '#020617', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Guild" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>No image</span>
                )}
                {imageBusy && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '999px', border: '2px solid #4f46e5', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', rowGap: 4 }}>
                <input
                  disabled={imageBusy}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  onChange={(e) => onImageChange(e as unknown as Event)}
                  style={{ fontSize: 11 }}
                />
                <span style={{ fontSize: 11, color: '#6b7280' }}>PNG, JPG, WEBP, GIF; max 5MB</span>
                {imageMsg && (
                  <div style={{ fontSize: 11, color: imageBusy ? '#a5b4fc' : '#bbf7d0' }}>{imageMsg}</div>
                )}
              </div>
            </div>
          </div>
          )}
          {!myGuildId && (
          <label style={{ display: 'grid', rowGap: 4, fontSize: 12, color: '#9ca3af' }}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={400}
              style={{ resize: 'vertical', borderRadius: 8, border: '1px solid #1f2937', background: '#020617', color: '#e5e7ff', padding: 8, fontSize: 12 }}
            />
          </label>
          )}
          {!myGuildId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#9ca3af' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={autoAccept}
                onChange={(e) => setAutoAccept(e.target.checked)}
              />
              <span>Auto-accept join requests</span>
            </label>
          </div>
          )}
          {!myGuildId && (
          <label style={{ display: 'grid', rowGap: 4, fontSize: 12, color: '#9ca3af', maxWidth: 160 }}>
            Max members
            <input
              type="number"
              min={1}
              max={1000}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
              style={{ height: 30, borderRadius: 8, border: '1px solid #1f2937', background: '#020617', color: '#e5e7ff', padding: '0 8px', fontSize: 13 }}
            />
          </label>
          )}
          {error && (
            <div style={{ fontSize: 12, color: '#f97373' }}>{error}</div>
          )}
          {!myGuildId && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              disabled={creating || !name.trim()}
              onClick={async () => {
                if (!name.trim()) return
                setCreating(true)
                setError(null)
                let finalImageUrl: string | null = null
                if (imageFile) {
                  setImageBusy(true)
                  setImageMsg('Uploading image...')
                  const url = await uploadAvatar(imageFile)
                  setImageBusy(false)
                  if (!url) {
                    setImageMsg('Upload failed. Try a different image.')
                    setCreating(false)
                    return
                  }
                  finalImageUrl = url
                }
                const created = await createMyGuild({
                  name,
                  description,
                  imageUrl: finalImageUrl,
                  autoAccept,
                  maxMembers,
                })
                setCreating(false)
                if (!created) {
                  setError('Failed to create guild. Try a different name or try again later.')
                  return
                }
                setGuilds((prev) => {
                  const next = [created, ...prev]
                  next.sort((a, b) => Number(b.member_count) - Number(a.member_count) || a.created_at.localeCompare(b.created_at))
                  return next
                })
                setMyGuildId(created.id)
                setJoinOutcomes((prev) => ({
                  ...prev,
                  [created.id]: {
                    outcome: 'already_member',
                    guild_id: created.id,
                    joined: true,
                    request_id: null,
                    member_count: created.member_count,
                  } as GuildJoinResult,
                }))
                setName('')
                setDescription('')
                setImageUrl('')
                setImageFile(null)
                setAutoAccept(false)
                setMaxMembers(100)
              }}
              className="hover-chip"
              style={{ height: 32, padding: '0 14px', borderRadius: 999, border: '1px solid #4f46e5', background: creating ? '#111827' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#e5e7ff', fontSize: 13, cursor: creating || !name.trim() ? 'not-allowed' : 'pointer' }}
            >
              {creating ? 'Creating...' : 'Create Guild'}
            </button>
          </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', rowGap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>Browse Guilds</strong>
            <button
              type="button"
              title="Sorted by member count"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid #1f2937',
                background: '#020617',
                color: '#9ca3af',
                fontSize: 11,
                cursor: 'default',
              }}
            >
              <span style={{ fontSize: 10 }}>⇅</span>
              <span>Members</span>
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 10, border: '1px solid #111827', background: '#020617', padding: 8, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading guilds...</div>
            ) : guilds.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No guilds yet. Be the first to create one.</div>
            ) : (
              <div style={{ display: 'grid', rowGap: 8 }}>
                {guilds.map((g) => {
                  const joinOut = joinOutcomes[g.id]
                  const isMine = myGuildId === g.id
                  const disabled = joinBusyId === g.id || isMine
                  const isFull = g.member_count >= g.max_members
                  let joinLabel = isMine ? 'Your guild' : 'Join'
                  let joinColor = isMine ? '#bbf7d0' : '#e5e7ff'
                  let joinBg = isMine ? '#14532d' : '#0b1024'
                  if (!isMine && joinOut) {
                    if (joinOut.outcome === 'joined' || joinOut.outcome === 'already_member') {
                      joinLabel = 'Joined'
                      joinColor = '#bbf7d0'
                      joinBg = '#14532d'
                    } else if (joinOut.outcome === 'pending') {
                      joinLabel = 'Request sent'
                      joinColor = '#a5b4fc'
                      joinBg = '#111827'
                    } else if (joinOut.outcome === 'full') {
                      joinLabel = 'Full'
                      joinColor = '#fecaca'
                      joinBg = '#450a0a'
                    }
                  } else if (isFull) {
                    joinLabel = 'Full'
                    joinColor = '#fecaca'
                    joinBg = '#450a0a'
                  }
                  return (
                    <div key={g.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 10, rowGap: 4, alignItems: 'center', padding: 8, borderRadius: 10, border: '1px solid #111827', background: '#020617' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #1f2937', background: '#020617', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                        {g.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.image_url} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <span style={{ fontSize: 16 }}>{g.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{membersLabel(g)} members</span>
                          {g.auto_accept && (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a7f3d0', padding: '2px 6px', borderRadius: 999, border: '1px solid #064e3b', background: '#022c22' }}>Auto-accept</span>
                          )}
                        </div>
                        {g.description && (
                          <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.description}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={disabled || isFull || (joinOut && (joinOut.outcome === 'joined' || joinOut.outcome === 'already_member'))}
                        onClick={async () => {
                          if (disabled) return
                          setJoinBusyId(g.id)
                          const res = await requestJoinGuild(g.id)
                          setJoinBusyId(null)
                          if (res) {
                            setJoinOutcomes((prev) => ({ ...prev, [g.id]: res }))
                          }
                        }}
                        className="hover-chip"
                        style={{ height: 30, padding: '0 12px', borderRadius: 999, border: '1px solid #1f2937', background: joinBg, color: joinColor, fontSize: 12, cursor: disabled || isFull ? 'not-allowed' : 'pointer', minWidth: 90, textAlign: 'center' }}
                      >
                        {joinBusyId === g.id ? 'Working...' : joinLabel}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface GuildDetailsProps {
  guilds: GuildDTO[]
  myGuildId: string
}

function GuildDetails({ guilds, myGuildId }: GuildDetailsProps): JSX.Element {
  const guild = guilds.find(g => g.id === myGuildId) ?? null
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; username: string | null; avatar_url: string | null }>>([])
  const [selfId, setSelfId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNewOwner, setSelectedNewOwner] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!guild) return
      setLoading(true)
      setError(null)
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id ?? null
      if (!cancelled) setSelfId(uid)

      const { data, error: mErr } = await supabase
        .from('guild_members')
        .select('user_id, role, profiles(username,avatar_url)')
        .eq('guild_id', guild.id)
        .order('role', { ascending: false })
      if (cancelled) return
      if (mErr || !data) {
        setMembers([])
        setError('Could not load members.')
      } else {
        let mapped = (data as any[]).map(row => ({
          user_id: row.user_id as string,
          role: (row.role as string) ?? 'member',
          username: (row.profiles?.username ?? null) as string | null,
          avatar_url: (row.profiles?.avatar_url ?? null) as string | null,
        }))

        // If the guild owner is not present in guild_members (e.g. older guilds),
        // synthesize a leader entry so the UI still shows them.
        if (guild.owner_id && !mapped.some(m => m.user_id === guild.owner_id)) {
          const { data: ownerProf } = await supabase
            .from('profiles')
            .select('username,avatar_url')
            .eq('id', guild.owner_id)
            .single()
          mapped = [
            {
              user_id: guild.owner_id,
              role: 'leader',
              username: (ownerProf as any)?.username ?? null,
              avatar_url: (ownerProf as any)?.avatar_url ?? null,
            },
            ...mapped,
          ]
        }

        setMembers(mapped)
        const firstOther = mapped.find(m => m.user_id !== uid)
        setSelectedNewOwner(firstOther ? firstOther.user_id : null)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [guild?.id])

  if (!guild) {
    return (
      <div style={{ fontSize: 12, color: '#9ca3af', paddingTop: 4 }}>
        You are already in a guild.
      </div>
    )
  }

  const isLeader = selfId != null && guild.owner_id === selfId
  const canLeaderLeaveDirectly = isLeader && members.length <= 1

  async function onLeaveGuild() {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await leaveMyGuild()
    setBusy(false)
    if (!ok) {
      setError(isLeader && !canLeaderLeaveDirectly
        ? 'Transfer ownership to another member before leaving.'
        : 'Could not leave guild. Please try again.')
      return
    }
    window.location.reload()
  }

  async function onTransfer() {
    if (busy || !selectedNewOwner) return
    setBusy(true)
    setError(null)
    const ok = await transferGuildOwnership(selectedNewOwner)
    setBusy(false)
    if (!ok) {
      setError('Could not transfer ownership. Please try again.')
      return
    }
    window.location.reload()
  }

  return (
    <div style={{ display: 'grid', rowGap: 10, fontSize: 12, color: '#e5e7ff', paddingTop: 4, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #1f2937', background: '#020617', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {guild.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guild.image_url} alt={guild.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <span style={{ fontSize: 16 }}>{guild.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guild.name}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{guild.member_count}/{guild.max_members} members</div>
        </div>
      </div>
      {guild.description && (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>{guild.description}</div>
      )}
      <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, background: '#020617', maxHeight: 180, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading members...</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>No members yet.</div>
        ) : (
          <div style={{ display: 'grid', rowGap: 6 }}>
            {members.map((m) => {
              const label = m.username ?? m.user_id.slice(0, 8)
              const isSelf = m.user_id === selfId
              const roleLabel = m.role === 'leader' ? 'Leader' : 'Member'
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('social:open-player-card', { detail: { userId: m.user_id } }))
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 6,
                    border: '1px solid #1f2937',
                    background: '#020617',
                    padding: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 999, border: '1px solid #1f2937', background: '#0b0e1a', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ fontSize: 11 }}>{label.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#e5e7ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}{isSelf ? ' (You)' : ''}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{roleLabel}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy || (isLeader && !canLeaderLeaveDirectly)}
          onClick={() => { void onLeaveGuild() }}
          className="hover-chip"
          style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid #5d2f2f', background: '#3a1515', color: '#ffd1d1', fontSize: 11, cursor: busy || (isLeader && !canLeaderLeaveDirectly) ? 'not-allowed' : 'pointer' }}
        >
          {busy ? 'Working...' : isLeader && !canLeaderLeaveDirectly ? 'Transfer ownership to leave' : 'Leave guild'}
        </button>
        {isLeader && members.length > 1 && (
          <>
            <select
              value={selectedNewOwner ?? ''}
              onChange={(e) => setSelectedNewOwner(e.target.value || null)}
              disabled={busy}
              style={{ height: 28, borderRadius: 6, border: '1px solid #1f2937', background: '#020617', color: '#e5e7ff', fontSize: 11, padding: '0 6px' }}
            >
              <option value="">Select new leader</option>
              {members.filter(m => m.user_id !== selfId).map(m => {
                const label = m.username ?? m.user_id.slice(0, 8)
                return <option key={m.user_id} value={m.user_id}>{label}</option>
              })}
            </select>
            <button
              type="button"
              disabled={busy || !selectedNewOwner}
              onClick={() => { void onTransfer() }}
              className="hover-chip"
              style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid #3a428a', background: '#111842', color: '#e5e7ff', fontSize: 11, cursor: busy || !selectedNewOwner ? 'not-allowed' : 'pointer' }}
            >
              Transfer ownership
            </button>
          </>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#f97373' }}>{error}</div>
      )}
    </div>
  )
}
