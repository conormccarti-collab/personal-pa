import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createTracked } from '@/lib/ai/claude'
import type { ShootType } from '@/types'

export interface ShootProposal {
  task_id:    string
  task_title: string
  title:      string
  client:     string | null
  shoot_type: ShootType
  start_date: string | null   // YYYY-MM-DD
  end_date:   string | null
  location:   string | null
  brief:      string | null
}

export async function POST() {
  const supabase = await createClient()

  // Fetch active tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description, due_date, project, category, tags')
    .not('status', 'in', '("done","archived")')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (!tasks?.length) return NextResponse.json({ proposals: [] })

  // Existing shoot titles — used to skip obvious duplicates
  const { data: existingShoots } = await supabase
    .from('shoots')
    .select('title')

  const existingTitles = (existingShoots ?? []).map((s: { title: string }) => s.title.toLowerCase())

  const taskList = tasks.map(t => ({
    id:          t.id,
    title:       t.title,
    description: t.description ?? null,
    due_date:    t.due_date ?? null,
    project:     t.project ?? null,
    category:    t.category ?? null,
    tags:        t.tags ?? [],
  }))

  const message = await createTracked('import_shoots', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `You identify tasks that represent physical shoots (photo, video, or mixed) and extract structured data from them. Return JSON only — no markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `From the task list below, identify any tasks that represent a real-world shoot or filming day.
A shoot task typically involves physically going somewhere to photograph or film — keywords include: shoot, film, record, filming day, location, on-set, BTS, photography, videography.
Exclude tasks about editing, planning, admin, emails, or post-production.
Also exclude tasks whose titles closely match any of these existing shoots (already created): ${existingTitles.length ? existingTitles.join(', ') : 'none'}.

For each shoot task, extract:
- title: a clean, human-readable shoot name (remove brand prefixes like "WS - " if needed, but keep the brand identifier)
- client: the brand or client name (from project field or task title), null if unclear
- shoot_type: "photo", "video", or "mixed" based on context
- start_date: from due_date (YYYY-MM-DD format), null if not available
- end_date: same as start_date unless the task explicitly spans multiple days
- location: if mentioned in title or description, else null
- brief: a 1-sentence summary from the description, else null

Tasks:
${JSON.stringify(taskList, null, 2)}

Return a JSON array (empty array if no shoots found):
[{
  "task_id": "...",
  "task_title": "original task title",
  "title": "clean shoot name",
  "client": "...",
  "shoot_type": "photo|video|mixed",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "location": "... or null",
  "brief": "... or null"
}]`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let proposals: ShootProposal[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    proposals = match ? JSON.parse(match[0]) : []
  } catch {
    proposals = []
  }

  return NextResponse.json({ proposals })
}
