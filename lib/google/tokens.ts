/**
 * Google OAuth token management.
 * Tokens are stored in the profiles table (single-user app).
 */

import { createClient } from '@/lib/supabase/server'

export interface GoogleTokens {
  access_token: string
  refresh_token: string
  expiry_date: number   // ms timestamp
}

/** Fetch stored tokens from the DB */
export async function getStoredTokens(): Promise<GoogleTokens | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .single()

  if (!data?.google_refresh_token) return null
  return {
    access_token:  data.google_access_token  ?? '',
    refresh_token: data.google_refresh_token,
    expiry_date:   data.google_token_expiry  ?? 0,
  }
}

/** Persist tokens back to the DB */
export async function saveTokens(tokens: Partial<GoogleTokens>) {
  const supabase = await createClient()
  const updates: Record<string, unknown> = {}
  if (tokens.access_token)  updates.google_access_token  = tokens.access_token
  if (tokens.refresh_token) updates.google_refresh_token = tokens.refresh_token
  if (tokens.expiry_date)   updates.google_token_expiry  = tokens.expiry_date

  // Upsert — create profile row if it doesn't exist yet
  const { data: existing, error: selectErr } = await supabase.from('profiles').select('id').single()
  if (selectErr && selectErr.code !== 'PGRST116') {
    console.error('[saveTokens] select error:', selectErr)
  }
  if (existing) {
    const { error: updateErr } = await supabase.from('profiles').update(updates).eq('id', existing.id)
    if (updateErr) console.error('[saveTokens] update error:', updateErr)
  } else {
    const { error: insertErr } = await supabase.from('profiles').insert({ ...updates, name: '', role: '' })
    if (insertErr) console.error('[saveTokens] insert error:', insertErr)
  }
}

/** Return a valid access token, refreshing if expired */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens()
  if (!tokens) return null

  const isExpired = Date.now() >= tokens.expiry_date - 60_000 // refresh 1 min early

  if (!isExpired) return tokens.access_token

  // Refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  const newTokens: Partial<GoogleTokens> = {
    access_token: data.access_token,
    expiry_date:  Date.now() + data.expires_in * 1000,
  }
  await saveTokens(newTokens)
  return data.access_token
}
