import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { shotId } = await params
  const supabase = await createClient()
  const body = await req.json()

  const allowed = ['title', 'description', 'lens', 'lighting_notes', 'camera_notes', 'status', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('shot_list_items')
    .update(updates)
    .eq('id', shotId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { shotId } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('shot_list_items').delete().eq('id', shotId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
