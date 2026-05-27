import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('*').single()
  if (error) return NextResponse.json(null)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  // Upsert: update if exists, insert if not
  const { data: existing } = await supabase.from('profiles').select('id').single()
  let result
  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()
    result = { data, error }
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .insert({ ...body })
      .select()
      .single()
    result = { data, error }
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json(result.data)
}
