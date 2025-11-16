import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { acceptFriendRequest, denyFriendRequest, listPendingRequests } from '../lib/friends'

type ChatProfile = {
  username: string | null
  avatar_url: string | null
}

type ChatMessage = {
  id: string
  user_id: string
  content: string
  created_at: string
  profiles: ChatProfile | null
}

export interface ChatPanelProps {
  onUserClick: (userId: string) => void
}

export function ChatPanel({ onUserClick }: ChatPanelProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const maxLen = 500
  const [online, setOnline] = useState<Record<string, { user_id: string, username: string | null, avatar_url: string | null }>>({})
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  const [atBottom, setAtBottom] = useState(true)
  const profileCache = useRef<Record<string, ChatProfile>>({})
  const [cooldownMs, setCooldownMs] = useState(0)
  const sendTimesRef = useRef<number[]>([])
  const [pendingReqs, setPendingReqs] = useState<Array<{ id: string, requester_id: string, requester_name: string | null }>>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id ?? null
      if (mounted) setMyUserId(uid)
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id,user_id,content,created_at,profiles(username,avatar_url)')
        .order('created_at', { ascending: true })
        .limit(50)
      if (!error && data && mounted) setMessages(data as unknown as ChatMessage[])

      // Presence & typing channel
      const presenceChannel = supabase.channel('presence:global', {
        config: { presence: { key: uid || 'anon' } }
      })
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState() as Record<string, Array<{ user_id: string, username: string | null, avatar_url: string | null }>>
          const flat: Record<string, { user_id: string, username: string | null, avatar_url: string | null }> = {}
          Object.values(state).forEach((arr) => {
            arr.forEach((meta) => {
              if (!meta.user_id || meta.user_id === uid) return
              flat[meta.user_id] = meta
            })
          })
          if (mounted) setOnline(flat)
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const p = payload as { user_id: string }
          if (!p?.user_id) return
          setTypingUsers((prev) => ({ ...prev, [p.user_id]: Date.now() }))
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Load my profile meta for presence track
            let myMeta: { username: string | null, avatar_url: string | null } = { username: null, avatar_url: null }
            if (uid) {
              const { data: prof } = await supabase.from('profiles').select('username,avatar_url').eq('id', uid).single()
              myMeta = { username: prof?.username ?? null, avatar_url: prof?.avatar_url ?? null }
            }
            await presenceChannel.track({ user_id: uid || 'anon', username: myMeta.username, avatar_url: myMeta.avatar_url })
          }
        })

      // DB changes channel for messages
      const msgChannel = supabase
        .channel('public:chat_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
          const row = payload.new as any
          let prof = profileCache.current[row.user_id]
          if (!prof) {
            const { data: p } = await supabase.from('profiles').select('username,avatar_url').eq('id', row.user_id).single()
            prof = { username: p?.username ?? null, avatar_url: p?.avatar_url ?? null }
            profileCache.current[row.user_id] = prof
          }
          setMessages((prev) => [...prev, { ...row, profiles: prof }])
        })
        .subscribe()

      const interval = setInterval(() => {
        const cutoff = Date.now() - 4000
        setTypingUsers((prev) => {
          const next: Record<string, number> = {}
          Object.entries(prev).forEach(([k, v]) => { if (v > cutoff) next[k] = v })
          return next
        })
      }, 1500)

      return () => {
        mounted = false
        clearInterval(interval)
        supabase.removeChannel(presenceChannel)
        supabase.removeChannel(msgChannel)
      }
    })()
  }, [])

  // Load pending friend requests (addressed to me)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!myUserId) return
      const rows = await listPendingRequests()
      if (mounted && rows) setPendingReqs(rows)
    })()
    const fr = supabase
      .channel('public:friendships')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, async () => {
        const rows = await listPendingRequests()
        if (mounted && rows) setPendingReqs(rows)
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(fr) }
  }, [myUserId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function sanitize(input: string): string {
    // Allow printable ASCII and newlines. This supports symbols like < > [ ] { } ^ * + = / \ | ~ ` ; : etc.
    const cleaned = input.replace(/[^\x20-\x7E\n]/g, '')
    return cleaned.slice(0, maxLen)
  }

  async function send() {
    const trimmed = sanitize(input).trim()
    if (!trimmed) return
    if (!myUserId) return
    if (cooldownMs > 0) return
    // Rate limit: 10 messages / 30s window
    const now = Date.now()
    const windowMs = 30000
    const limit = 10
    sendTimesRef.current = sendTimesRef.current.filter((t) => now - t < windowMs)
    if (sendTimesRef.current.length >= limit) {
      const oldest = sendTimesRef.current[0]
      const remain = windowMs - (now - oldest)
      setCooldownMs(remain)
      // countdown ticker
      const t = setInterval(() => {
        setCooldownMs((ms) => {
          const next = ms - 250
          if (next <= 0) { clearInterval(t); return 0 }
          return next
        })
      }, 250)
      return
    }
    sendTimesRef.current.push(now)
    setSending(true)
    // Optimistic local append with my profile cached/enriched
    let me = profileCache.current[myUserId]
    if (!me) {
      const { data: p } = await supabase.from('profiles').select('username,avatar_url').eq('id', myUserId).single()
      me = { username: p?.username ?? null, avatar_url: p?.avatar_url ?? null }
      profileCache.current[myUserId] = me
    }
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, user_id: myUserId, content: trimmed, created_at: new Date().toISOString(), profiles: me }
    setMessages((prev) => [...prev, optimistic])
    await supabase.from('chat_messages').insert({ content: trimmed, user_id: myUserId })
    setSending(false)
    setInput('')
  }

  const canSend = useMemo(() => input.trim().length > 0 && !sending && cooldownMs <= 0, [input, sending, cooldownMs])

  function onTyping() {
    if (!myUserId) return
    const existing = supabase.getChannels().find(c => c.topic === 'realtime:presence:global')
    const channel = existing ?? supabase.channel('presence:global')
    channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: myUserId } })
  }

  function linkify(text: string): JSX.Element[] {
    const parts = text.split(/(https?:\/\/[^\s]+)/g)
    return parts.map((part, i) => {
      if (/^https?:\/\//.test(part)) {
        return <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: '#91ffb3' }}>{part}</a>
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #1f2447', background: '#0f1226' }}>
        <strong style={{ fontSize: 14 }}>Friends & Chat</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: '1fr 2fr', minHeight: 0 }}>
        {/* Friends top 1/3 */}
        <div style={{ padding: 12, borderBottom: '1px solid #1f2447', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#9db0ff', marginBottom: 8 }}>Online ({Object.keys(online).length})</div>
          {Object.values(online).length === 0 ? (
            <div style={{ color: '#7a83c8', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>No one online</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.values(online).map((u) => (
                <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => onUserClick(u.user_id)} title={u.username ?? u.user_id} className="hover-circle" style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #2a2f55', background: '#0f1226', color: '#e5e7ff', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 0, cursor: 'pointer' }}>
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ fontSize: 10 }}>{(u.username ?? 'U')[0]?.toUpperCase() ?? 'U'}</span>
                    )}
                  </button>
                  <button onClick={() => onUserClick(u.user_id)} className="hover-chip" style={{ background: 'transparent', border: '1px solid #2a2f55', color: '#b3c0ff', borderRadius: 6, height: 20, padding: '0 6px', fontSize: 11, cursor: 'pointer' }}>{u.username ?? u.user_id.slice(0, 6)}</button>
                  <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#9db0ff', marginBottom: 6 }}>Friend Requests</div>
            {pendingReqs.length === 0 ? (
              <div style={{ color: '#7a83c8', fontSize: 12 }}>None</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {pendingReqs.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#e5e7ff' }}>{r.requester_name ?? r.requester_id.slice(0,6)}</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button className="hover-chip" onClick={() => acceptFriendRequest(r.id)} style={{ height: 24, padding: '0 8px', borderRadius: 6, border: '1px solid #2a2f55', background: '#194a2a', color: '#c8ffda', cursor: 'pointer', fontSize: 11 }}>Accept</button>
                      <button className="hover-chip" onClick={() => denyFriendRequest(r.id)} style={{ height: 24, padding: '0 8px', borderRadius: 6, border: '1px solid #2a2f55', background: '#4a1a1a', color: '#ffd1d1', cursor: 'pointer', fontSize: 11 }}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
              ))}
            </div>
          )}
        </div>
        {/* Chat bottom 2/3 */}
        <div ref={chatScrollRef} onScroll={() => {
          const el = chatScrollRef.current
          if (!el) return
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          setAtBottom(nearBottom)
        }} style={{ position: 'relative', padding: 12, overflowY: 'auto' }}>
          {messages.map((m) => {
            const name = m.profiles?.username ?? m.user_id.slice(0, 8)
            return (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, marginBottom: 10 }}>
                <button onClick={() => onUserClick(m.user_id)} title={name} className="hover-circle" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #2a2f55', background: '#0f1226', color: '#e5e7ff', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 0, cursor: 'pointer' }}>
                  {m.profiles?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.profiles.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <span style={{ fontSize: 11 }}>{name[0]?.toUpperCase() ?? 'U'}</span>
                  )}
                </button>
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <button onClick={() => onUserClick(m.user_id)} className="hover-chip" style={{ background: 'transparent', border: '1px solid #2a2f55', color: '#b3c0ff', borderRadius: 6, height: 20, padding: '0 6px', fontSize: 11, cursor: 'pointer' }}>{name}</button>
                    <span style={{ fontSize: 10, color: '#7a83c8' }}>{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#e5e7ff', whiteSpace: 'pre-wrap' }}>{linkify(m.content)}</div>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
          {!atBottom && (
            <button onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })} className="hover-chip" style={{ position: 'sticky', left: '100%', marginLeft: -120, bottom: 8, height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #3a428a', background: '#111842', color: '#e5e7ff', cursor: 'pointer', fontSize: 12 }}>Jump to latest</button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, padding: 12, borderTop: '1px solid #1f2447', background: '#0f1226' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={input}
            onChange={(e) => { setInput(sanitize(e.target.value)); onTyping() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); if (canSend) void send() } }}
            rows={2}
            placeholder={cooldownMs > 0 ? `Rate limited… ${Math.ceil(cooldownMs/1000)}s` : 'Message #global'}
            style={{ resize: 'vertical', background: '#0b0e1a', border: '1px solid #2a2f55', borderRadius: 8, color: '#e5e7ff', padding: 10, fontSize: 12, opacity: cooldownMs > 0 ? 0.7 : 1 }}
          />
          {cooldownMs > 0 && (
            <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, color: '#ffd166' }}>{Math.ceil(cooldownMs/1000)}s</div>
          )}
        </div>
        <button disabled={!canSend} onClick={send} className="hover-chip" style={{ height: 38, padding: '0 14px', background: '#5865f2', border: '1px solid #4e5ae6', borderRadius: 8, color: 'white', cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.7 }}>Send</button>
      </div>
      <div style={{ padding: '0 12px 12px', color: '#9db0ff', minHeight: 18, fontSize: 11 }}>
        {Object.keys(typingUsers).length > 0 && (
          <span>{Object.keys(typingUsers).length === 1 ? 'Someone is typing…' : 'Several are typing…'}</span>
        )}
      </div>
    </div>
  )
}
