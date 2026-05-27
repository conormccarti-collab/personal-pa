import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface SearchResult {
  id: string
  type: 'task' | 'idea' | 'shoot' | 'content'
  title: string
  subtitle: string
  href: string
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const supabase = await createClient()
  const pattern = `%${q}%`

  const [tasksRes, ideasRes, shootsRes, contentRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, status, due_date')
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .not('status', 'eq', 'archived')
      .limit(5),
    supabase
      .from('ideas')
      .select('id, title, content, tags')
      .or(`title.ilike.${pattern},content.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('shoots')
      .select('id, title, client, status, start_date')
      .or(`title.ilike.${pattern},client.ilike.${pattern}`)
      .limit(4),
    supabase
      .from('content_items')
      .select('id, title, platform, status')
      .or(`title.ilike.${pattern},notes.ilike.${pattern}`)
      .limit(4),
  ])

  const results: SearchResult[] = []

  for (const t of tasksRes.data ?? []) {
    const parts = [t.priority, t.status.replace('_', ' ')]
    if (t.due_date) parts.push(`due ${t.due_date}`)
    results.push({ id: t.id, type: 'task', title: t.title, subtitle: parts.join(' · '), href: '/tasks' })
  }

  for (const i of ideasRes.data ?? []) {
    results.push({ id: i.id, type: 'idea', title: i.title, subtitle: i.content?.slice(0, 80) ?? '', href: '/ideas' })
  }

  for (const s of shootsRes.data ?? []) {
    const parts: string[] = []
    if (s.client) parts.push(s.client)
    if (s.start_date) parts.push(s.start_date)
    parts.push(s.status)
    results.push({ id: s.id, type: 'shoot', title: s.title, subtitle: parts.join(' · '), href: `/shoots/${s.id}` })
  }

  for (const c of contentRes.data ?? []) {
    results.push({
      id: c.id, type: 'content', title: c.title,
      subtitle: `${c.platform.replace('_', ' ')} · ${c.status}`,
      href: '/calendar',
    })
  }

  return NextResponse.json({ results })
}
