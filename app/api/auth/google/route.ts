import { NextResponse } from 'next/server'

/**
 * GET /api/auth/google
 * Redirects the browser to Google's OAuth consent page.
 * Visit this URL once to authorise the app.
 */
export async function GET() {
  const clientId    = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be set in .env.local' },
      { status: 500 }
    )
  }

  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ')

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id',     clientId)
  url.searchParams.set('redirect_uri',  redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope',         scopes)
  url.searchParams.set('access_type',   'offline')   // gets a refresh token
  url.searchParams.set('prompt',        'consent')   // forces refresh token every time

  return NextResponse.redirect(url.toString())
}
