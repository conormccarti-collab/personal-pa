import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/notifications — returns unread notifications, newest first */
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notifications: data ?? [] })
}

/** POST /api/notifications — mark all as read */
export async function POST() {
  const supabase = await createClient()
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false)

  return NextResponse.json({ ok: true })
}
