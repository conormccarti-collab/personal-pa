import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateTask } from '@/lib/asana'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('tasks')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Push changes back to Asana if this task is linked
  if (data.asana_id && process.env.ASANA_PERSONAL_ACCESS_TOKEN) {
    const asanaUpdate: Record<string, unknown> = {}
    if ('status' in body) asanaUpdate.completed = body.status === 'done'
    if ('title' in body) asanaUpdate.name = body.title
    if ('description' in body) asanaUpdate.notes = body.description ?? ''
    if ('due_date' in body) asanaUpdate.due_on = body.due_date ?? null

    if (Object.keys(asanaUpdate).length > 0) {
      updateTask(data.asana_id, asanaUpdate).catch(() => {
        // Non-fatal — PA is source of truth, Asana sync is best-effort
      })
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update({ status: 'archived' }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
