import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('category_rules')
    .select('*')
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { keyword, category, sort_order } = await req.json()
  if (!keyword?.trim() || !category?.trim()) {
    return NextResponse.json({ error: 'keyword and category required' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('category_rules')
    .insert({ keyword: keyword.trim().toLowerCase(), category: category.trim(), sort_order: sort_order ?? 0 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
