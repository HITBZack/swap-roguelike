import { supabase } from './supabase'

export interface ProfileDTO {
  id: string
  username: string | null
  avatar_url: string | null
  level: number
  last_active: string
}

/**
 * Fetch the current user's profile.
 */
export async function fetchMyProfile(): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('fetchMyProfile error', error)
    return null
  }
  return data as unknown as ProfileDTO
}

/**
 * Update current user's username.
 */
export async function updateMyUsername(username: string): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .update({ username })
    .eq('id', uid)
    .select('*')
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('updateMyUsername error', error)
    return null
  }
  return data as unknown as ProfileDTO
}
