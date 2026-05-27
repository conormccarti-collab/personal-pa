import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shoots')
    .select('*')
    .order('start_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const {
    title,
    client = null,
    brief = null,
    deliverables = null,
    shoot_type = 'photo',
    status = 'planning',
    start_date,
    end_date = null,
    location = null,
    notes = null,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!start_date) return NextResponse.json({ error: 'Start date required' }, { status: 400 })

  const { data, error } = await supabase
    .from('shoots')
    .insert({ title: title.trim(), client, brief, deliverables, shoot_type, status, start_date, end_date, location, notes })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
