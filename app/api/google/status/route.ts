import { NextResponse } from 'next/server'
import { getStoredTokens } from '@/lib/google/tokens'

export async function GET() {
  const tokens = await getStoredTokens()
  return NextResponse.json({ connected: Boolean(tokens?.refresh_token) })
}
