import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('title, category, asana_section')
    .not('status', 'in', '("done","archived")')
    .order('asana_section', { ascending: true, nullsFirst: false })
    .limit(40)
  return NextResponse.json(data ?? [])
}
