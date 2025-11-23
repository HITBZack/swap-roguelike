import { supabase } from './supabase'

export type GuildDTO = {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  owner_id: string
  auto_accept: boolean
  max_members: number
  created_at: string
  member_count: number
}

export type GuildJoinResult = {
  outcome: 'joined' | 'pending' | 'full' | 'already_member'
  guild_id: string
  joined: boolean
  request_id: string | null
  member_count: number
}

export type GuildJoinRequestDTO = {
  id: string
  guild_id: string
  user_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  created_at: string
  decided_at: string | null
}

export async function listPublicGuilds(): Promise<GuildDTO[]> {
  const { data, error } = await supabase.rpc('guild_list_public')
  if (error || !data) return []
  return data as GuildDTO[]
}

export async function createMyGuild(input: {
  name: string
  description: string
  imageUrl: string | null
  autoAccept: boolean
  maxMembers: number
}): Promise<GuildDTO | null> {
  const { name, description, imageUrl, autoAccept, maxMembers } = input
  if (!name.trim()) return null
  const { data, error } = await supabase.rpc('guild_create', {
    p_name: name.trim(),
    p_description: description.trim(),
    p_image_url: imageUrl ?? null,
    p_auto_accept: autoAccept,
    p_max_members: maxMembers,
  })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return row as GuildDTO
}

export async function requestJoinGuild(guildId: string): Promise<GuildJoinResult | null> {
  if (!guildId) return null
  const { data, error } = await supabase.rpc('guild_request_join', { p_guild_id: guildId })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    outcome: row.outcome,
    guild_id: row.guild_id,
    joined: row.joined,
    request_id: row.request_id,
    member_count: Number(row.member_count ?? 0),
  } as GuildJoinResult
}

export async function listMyGuildJoinRequestsAsLeader(): Promise<GuildJoinRequestDTO[]> {
  const { data, error } = await supabase
    .from('guild_join_requests')
    .select('id,guild_id,user_id,status,created_at,decided_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data as unknown as GuildJoinRequestDTO[]
}

export async function handleGuildJoinRequest(requestId: string, accept: boolean): Promise<boolean> {
  if (!requestId) return false
  const { data, error } = await supabase.rpc('guild_handle_request', {
    p_request_id: requestId,
    p_accept: accept,
  })
  if (error || !data) return false
  return true
}

export async function leaveMyGuild(): Promise<boolean> {
  const { data, error } = await supabase.rpc('guild_leave')
  if (error) return false
  return Boolean(data)
}

export async function transferGuildOwnership(newOwnerId: string): Promise<boolean> {
  if (!newOwnerId) return false
  const { data, error } = await supabase.rpc('guild_transfer_owner', {
    p_new_owner: newOwnerId,
  })
  if (error) return false
  return Boolean(data)
}
