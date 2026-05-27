import { NextRequest, NextResponse } from 'next/server'
import { saveTokens } from '@/lib/google/tokens'

/**
 * GET /api/auth/google/callback?code=...
 * Google redirects here after the user grants permission.
 * Exchanges the code for access + refresh tokens and stores them.
 */
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.json({ error: error ?? 'No code returned' }, { status: 400 })
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Token exchange failed: ${err}` }, { status: 500 })
  }

  const data = await res.json()

  console.log('[google/callback] token exchange response:', {
    has_access_token:  Boolean(data.access_token),
    has_refresh_token: Boolean(data.refresh_token),
    expires_in:        data.expires_in,
    error:             data.error,
  })

  if (!data.refresh_token) {
    console.error('[google/callback] No refresh_token returned — user may need to re-authorise with prompt=consent')
  }

  try {
    await saveTokens({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expiry_date:   Date.now() + data.expires_in * 1000,
    })
    console.log('[google/callback] tokens saved successfully')
  } catch (e) {
    console.error('[google/callback] saveTokens threw:', e)
    return NextResponse.json({ error: 'Failed to save tokens', detail: String(e) }, { status: 500 })
  }

  // Redirect back to dashboard with success flag
  return NextResponse.redirect(new URL('/?google=connected', req.nextUrl.origin))
}
