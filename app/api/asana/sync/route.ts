import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyTasks } from '@/lib/asana'

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
    const payload = {
      asana_id:          t.gid,
      title:             t.name,
      description:       t.notes || null,
      due_date:          t.due_on || null,
      status:            t.completed ? ('done' as const) : ('todo' as const),
      priority:          'medium' as const,
      parent_asana_id:   t.parent?.gid   ?? null,
      parent_task_title: t.parent?.name  ?? null,
      asana_section:     t.memberships?.[0]?.section?.name ?? null,
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
