import { supabase } from './supabase'

export interface ProfileDTO {
  id: string
  username: string | null
  avatar_url: string | null
  level: number
  xp?: number | null
  last_active: string
  about?: string | null
  title?: string | null
  showcase_items?: string[] | null
  deaths?: number | null
  equipped_titles?: string[] | null
  character_sprite?: string | null
  stat_points_pending?: number | null
  stat_points_spent?: number | null
  stat_allocations?: Record<string, number> | null
}

export async function fetchProfileById(userId: string): Promise<ProfileDTO | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('fetchProfileById error', error)
    return null
  }
  return data as unknown as ProfileDTO
}

/**
 * Update current user's in-game character sprite key.
 */
export async function updateMyCharacterSprite(spriteKey: string | null): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .update({ character_sprite: spriteKey })
    .eq('id', uid)
    .select('*')
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('updateMyCharacterSprite error', error)
    return null
  }
  return data as unknown as ProfileDTO
}

/**
 * Add XP to the current user via RPC (auto-level handled server-side).
 *
 * The underlying `profile_add_xp` function may also return additional
 * profile fields such as stat_points_pending or stat_allocations; we
 * surface the guaranteed level/xp plus allow callers to inspect the
 * raw payload if needed.
 */
export async function addMyXp(amount: number): Promise<{ level: number; xp: number; raw?: any } | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid || !Number.isFinite(amount) || amount <= 0) return null
  const { data, error } = await supabase.rpc('profile_add_xp', { p_user: uid, p_xp: Math.floor(amount) })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('addMyXp error', error)
    return null
  }
  const row: any = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { level: Number(row.level ?? 1), xp: Number(row.xp ?? 0), raw: row }
}

/**
 * Spend a single pending stat point on a chosen stat key.
 *
 * The corresponding Supabase RPC `profile_spend_stat_point` is
 * responsible for validating that the user has pending points and
 * that the provided stat key is allowed.
 */
export async function spendMyStatPoint(statKey: string): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid || !statKey) return null
  const { data, error } = await supabase.rpc('profile_spend_stat_point', {
    p_user: uid,
    p_stat: statKey
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('spendMyStatPoint error', error)
    return null
  }
  const row: any = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return row as ProfileDTO
}

/**
 * Increment deaths counter for the current user via RPC.
 */
export async function incMyDeaths(by = 1): Promise<number | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid || !Number.isFinite(by) || by <= 0) return null
  try {
    const { data, error } = await supabase.rpc('profile_inc_deaths', { p_user: uid, p_by: Math.floor(by) })
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('incMyDeaths error', error)
      return null
    }
    return data as number
  } catch (err) {
    // Network or RPC-level failure should never break game flow
    // eslint-disable-next-line no-console
    console.warn('incMyDeaths exception', err)
    return null
  }
}


/**
 * Update current user's avatar_url.
 */
export async function updateMyAvatarUrl(avatarUrl: string): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', uid)
    .select('*')
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('updateMyAvatarUrl error', error)
    return null
  }
  return data as unknown as ProfileDTO
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
  if (!error && data) {
    return data as unknown as ProfileDTO
  }

  // If no profile row exists yet, Supabase/PostgREST returns 406 / PGRST116 for .single().
  const code = (error as any)?.code
  if (code === 'PGRST116') {
    // Create a default profile row for this user. Rely on DB defaults for most fields.
    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert({ id: uid })
      .select('*')
      .single()
    if (insertErr) {
      // eslint-disable-next-line no-console
      console.warn('fetchMyProfile insert error', insertErr)
      return null
    }
    return created as unknown as ProfileDTO
  }

  // Any other error should be logged but not crash the app.
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('fetchMyProfile error', error)
  }
  return null
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

export async function tryUpdateMyUsername(
  username: string
): Promise<{ profile: ProfileDTO | null; error: string | null; code?: string }> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { profile: null, error: 'not_authenticated' }
  const { data, error } = await supabase
    .from('profiles')
    .update({ username })
    .eq('id', uid)
    .select('*')
    .single()
  if (error) {
    return { profile: null, error: error.message ?? 'update_failed', code: (error as any).code }
  }
  return { profile: data as unknown as ProfileDTO, error: null }
}

/**
 * Update current user's about text.
 */
export async function updateMyAbout(about: string): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .update({ about })
    .eq('id', uid)
    .select('*')
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('updateMyAbout error', error)
    return null
  }
  return data as unknown as ProfileDTO
}

/**
 * Update current user's equipped titles (up to 2).
 */
export async function updateMyTitles(titles: string[]): Promise<ProfileDTO | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const safe = Array.isArray(titles) ? titles.slice(0, 2) : []
  const { data, error } = await supabase
    .from('profiles')
    .update({ equipped_titles: safe })
    .eq('id', uid)
    .select('*')
    .single()
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('updateMyTitles error', error)
    return null
  }
  return data as unknown as ProfileDTO
}
