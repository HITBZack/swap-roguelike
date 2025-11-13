import { supabase } from './supabase'

export const AVATAR_BUCKET = 'avatars'
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]

/** Validate avatar file client-side. */
export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return 'Unsupported file type. Use PNG, JPG, WEBP, or GIF.'
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'File is too large. Max size is 5 MB.'
  }
  return null
}

/** Derive the object path within the avatars bucket from a public URL. */
export function avatarPathFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/avatars/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.substring(idx + marker.length)
}

/** Delete an avatar by its public URL. Safe to call even if parsing fails. */
export async function deleteAvatarByUrl(url: string): Promise<boolean> {
  const path = avatarPathFromPublicUrl(url)
  if (!path) return false
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
  return !error
}

/**
 * Uploads the avatar to the public bucket under <uid>/filename and returns a public URL.
 */
export async function uploadAvatar(file: File): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  const path = `${user.id}/${Date.now()}_${file.name}`
  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })
  if (upErr) {
    // eslint-disable-next-line no-console
    console.warn('uploadAvatar error', upErr)
    return null
  }
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
