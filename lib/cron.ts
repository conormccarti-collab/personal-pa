import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifies that a request comes from Vercel's cron scheduler.
 * Vercel passes `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 * Returns a 401 Response if the check fails, or null if it passes.
 */
export function verifyCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization')

  // In local dev (no secret set) we allow all requests so you can test manually
  if (!secret) return null

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
