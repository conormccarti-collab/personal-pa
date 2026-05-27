import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { autoTagIdea } from '@/lib/ai/claude'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { title, content } = body

  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  // Insert immediately — don't wait for AI tagging
  const { data, error } = await supabase
    .from('ideas')
    .insert({ title: title || content.slice(0, 80), content, tags: [] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-tag in background after we've already responded
  autoTagIdea(content)
    .then((tags) => {
      if (tags?.length) {
        supabase.from('ideas').update({ tags }).eq('id', data.id).then(() => {})
      }
    })
    .catch(() => {})

  return NextResponse.json(data, { status: 201 })
}
