import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabase.from('content_items').select('*').order('publish_date').order('created_at')
  if (from) query = query.gte('publish_date', from)
  if (to)   query = query.lte('publish_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const {
    title,
    platform = 'other',
    brand_id = null,
    status = 'idea',
    shoot_date = null,
    edit_date = null,
    publish_date = null,
    notes = null,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const { data, error } = await supabase
    .from('content_items')
    .insert({ title: title.trim(), platform, brand_id, status, shoot_date, edit_date, publish_date, notes })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
