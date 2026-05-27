import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('todo_items')
    .select('*')
    .order('sort_order')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const {
    title,
    section = 'today',
    task_id = null,
    idea_id = null,
    estimated_hours = null,
    scheduled_time = null,
    scheduled_day = null,
    duration_minutes = 30,
    notes = null,
    color = null,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const { data, error } = await supabase
    .from('todo_items')
    .insert({
      title: title.trim(),
      section,
      task_id,
      idea_id,
      estimated_hours,
      scheduled_time,
      scheduled_day,
      duration_minutes,
      notes,
      color,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
