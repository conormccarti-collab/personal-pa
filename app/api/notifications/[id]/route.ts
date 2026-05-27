import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** PATCH /api/notifications/[id] — mark one notification as read */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  await supabase.from('notifications').update({ read: true }).eq('id', id)
  return NextResponse.json({ ok: true })
}

/** DELETE /api/notifications/[id] — delete one notification */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  await supabase.from('notifications').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
