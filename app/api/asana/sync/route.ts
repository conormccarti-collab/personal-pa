import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyTasks } from '@/lib/asana'

/** Map Asana section name → task category, bypassing AI guesswork */
function categoryFromText(text: string | null): string | null {
  if (!text) return null
  const s = text.toLowerCase()
  if (s.includes('shoot') || s.includes('filming') || s.includes('photography') || s.includes('recce')) return 'Shoot'
  if (s.includes('edit') && !s.includes('pre-edit') && !s.includes('pre edit') && !s.includes('review')) return 'Editing'
  if (s.includes('planning') || s.includes('pre-production') || s.includes('pre production')) return 'Planning & Pre-Production'
  if (s.includes('pre-edit') || s.includes('pre edit') || s.includes('brief')) return 'Pre-Edit Review'
  if (s.includes('review')) return 'Review'
  if (s.includes('idea') || s.includes('ideation')) return 'Ideas'
  return null
}

export async function POST() {
  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  if (!workspaceGid) {
    return NextResponse.json({ error: 'ASANA_WORKSPACE_GID not set' }, { status: 500 })
  }

  const supabase = await createClient()
  const asanaTasks = await getMyTasks(workspaceGid)

  // Fetch existing asana_ids so we can update vs insert
  const { data: existing } = await supabase
    .from('tasks')
    .select('id, asana_id')
    .not('asana_id', 'is', null)

  const existingMap = new Map((existing ?? []).map((t) => [t.asana_id, t.id]))

  let synced = 0
  for (const t of asanaTasks) {
    // memberships[0] may be "My Tasks" with no named section — find the first one that has a name
    const sectionName = t.memberships?.find((m) => m.section?.name)?.section?.name ?? null
    // Derive category from section name first, then fall back to task title keywords
    const category = categoryFromText(sectionName) ?? categoryFromText(t.name)
    const payload = {
      asana_id:          t.gid,
      title:             t.name,
      description:       t.notes || null,
      due_date:          t.due_on || null,
      status:            t.completed ? ('done' as const) : ('todo' as const),
      priority:          'medium' as const,
      parent_asana_id:   t.parent?.gid   ?? null,
      parent_task_title: t.parent?.name  ?? null,
      asana_section:     sectionName,
      // Only set category when we can derive it from the section — don't wipe manual categories
      ...(category ? { category } : {}),
      updated_at:        new Date().toISOString(),
    }

    if (existingMap.has(t.gid)) {
      await supabase.from('tasks').update(payload).eq('id', existingMap.get(t.gid))
    } else {
      await supabase.from('tasks').insert(payload)
    }
    synced++
  }

  return NextResponse.json({ synced })
}
