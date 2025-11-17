import { supabase } from './supabase'
import { useAppState } from './state'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { fetchMyProfile } from './profile'

/**
 * ensureAuth
 * Renders a minimal email OTP form if the user is not signed in, and resolves after auth.
 */
export async function ensureAuth(container: HTMLElement): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    await applyProfile()
    return
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:#fff;background:#0f1226;font-family:sans-serif">
      <form id="auth-form" style="background:#1a1f3a;padding:16px;border-radius:8px;min-width:320px">
        <h3 style="margin:0 0 12px">Sign in</h3>
        <p style="margin:0 0 12px;font-size:12px;color:#b3c0ff">Enter your email to receive a magic link.</p>
        <input id="email" type="email" placeholder="you@example.com" required style="width:100%;padding:8px;border-radius:4px;border:1px solid #2a2f55;background:#0f1226;color:#fff" />
        <button id="send" type="submit" style="margin-top:12px;width:100%;padding:8px;border:0;border-radius:4px;background:#5865f2;color:#fff;cursor:pointer">Send Magic Link</button>
        <div style="display:flex;align-items:center;gap:8;margin:12px 0;color:#93a2ff;font-size:12px"><span style="height:1px;background:#2a2f55;flex:1"></span><span>or</span><span style="height:1px;background:#2a2f55;flex:1"></span></div>
        <button id="google" type="button" style="width:100%;padding:8px;border:1px solid #2a2f55;border-radius:4px;background:#0f1226;color:#e5e7ff;cursor:pointer">Continue with Google</button>
        <div id="msg" style="margin-top:8px;font-size:12px;color:#d6d9ff"></div>
      </form>
    </div>
  `

  const form = document.getElementById('auth-form') as HTMLFormElement
  const emailInput = document.getElementById('email') as HTMLInputElement
  const msg = document.getElementById('msg') as HTMLDivElement

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    msg.textContent = 'Sending magic link...'
    const { error } = await supabase.auth.signInWithOtp({ email: emailInput.value })
    if (error) {
      msg.textContent = `Error: ${error.message}`
      return
    }
    msg.textContent = 'Check your email for the sign-in link.'
  })

  const googleBtn = document.getElementById('google') as HTMLButtonElement
  googleBtn?.addEventListener('click', async () => {
    msg.textContent = 'Redirecting to Google...'
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) msg.textContent = `Error: ${error.message}`
  })

  // Wait until the session exists
  await new Promise<void>((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session) {
        sub.subscription.unsubscribe()
        container.innerHTML = ''
        applyProfile()
        resolve()
      }
    })
  })
}

async function applyProfile(): Promise<void> {
  const setPlayer = useAppState.getState().setPlayer
  const setUi = useAppState.getState().setUi
  const prof = await fetchMyProfile()
  if (prof) {
    setPlayer({ id: prof.id, username: prof.username, level: prof.level, avatarUrl: prof.avatar_url ?? null, characterSprite: prof.character_sprite ?? null })
    if (!prof.username) setUi({ needUsername: true })
  }
}
