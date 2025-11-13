import { supabase } from './supabase'

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

// Returns current friendship status between auth user and target user
export async function getFriendshipStatus(targetUserId: string): Promise<FriendshipStatus> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me || !targetUserId || targetUserId === me) return 'none'
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${me})`)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return 'none'
  const row = (data ?? [])[0]
  if (!row) return 'none'
  if (row.status === 'accepted') return 'accepted'
  if (row.status === 'pending') {
    return row.requester_id === me ? 'pending_sent' : 'pending_received'
  }
  return 'none'
}

// Send a friend request from auth user to target user
export async function sendFriendRequest(targetUserId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me || !targetUserId || targetUserId === me) return false
  // Avoid duplicates: if any existing row, do nothing
  const existing = await supabase
    .from('friendships')
    .select('id, status, requester_id, addressee_id')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${me})`)
    .maybeSingle()
  if (existing.data) {
    // If previously denied, create new; if pending/accepted, skip
    if (existing.data.status === 'denied') {
      await supabase.from('friendships').insert({ requester_id: me, addressee_id: targetUserId, status: 'pending' })
      return true
    }
    return true
  }
  const ins = await supabase.from('friendships').insert({ requester_id: me, addressee_id: targetUserId, status: 'pending' })
  return !ins.error
}

// Accept a friend request. The id can be a friendship id OR a requester user id.
export async function acceptFriendRequest(idOrUserId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return false
  // Try by friendship id first
  let { data } = await supabase.from('friendships').select('id').eq('id', idOrUserId).single()
  if (data) {
    const upd = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', idOrUserId)
    return !upd.error
  }
  // Else, treat as requester user id
  const { data: row } = await supabase
    .from('friendships')
    .select('id')
    .eq('requester_id', idOrUserId)
    .eq('addressee_id', me)
    .eq('status', 'pending')
    .single()
  if (!row) return false
  const upd = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', row.id)
  return !upd.error
}

// Deny a friend request. The id can be a friendship id OR a requester user id.
export async function denyFriendRequest(idOrUserId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return false
  // Try by friendship id first
  let { data } = await supabase.from('friendships').select('id').eq('id', idOrUserId).single()
  if (data) {
    const upd = await supabase.from('friendships').update({ status: 'denied' }).eq('id', idOrUserId)
    return !upd.error
  }
  // Else, treat as requester user id
  const { data: row } = await supabase
    .from('friendships')
    .select('id')
    .eq('requester_id', idOrUserId)
    .eq('addressee_id', me)
    .eq('status', 'pending')
    .single()
  if (!row) return false
  const upd = await supabase.from('friendships').update({ status: 'denied' }).eq('id', row.id)
  return !upd.error
}

// List pending requests for the signed-in user (incoming only)
export async function listPendingRequests(): Promise<Array<{ id: string, requester_id: string, requester_name: string | null }> | null> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return []
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, profiles:requester_id(username)')
    .eq('addressee_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []).map((r: any) => ({ id: r.id, requester_id: r.requester_id, requester_name: r.profiles?.username ?? null }))
}
