import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gantt_projects')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { asana_project_gid, name, start_date, deadline, color } = body

  const { count } = await supabase
    .from('gantt_projects')
    .select('*', { count: 'exact', head: true })
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Maximum 10 projects allowed' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('gantt_projects')
    .insert({ asana_project_gid, name, start_date, deadline, color: color ?? '#7c6af7' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
