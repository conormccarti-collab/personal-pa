import { NextRequest, NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron'

/**
 * GET /api/cron/weekly-plan
 * Runs Monday 08:00. Delegates to the on-demand generate-weekly-plan endpoint.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not set' }, { status: 500 })

  const res = await fetch(`${appUrl}/api/ai/generate-weekly-plan`, { method: 'POST' })
  const data = await res.json()

  return NextResponse.json({ ok: true, ...data })
}
