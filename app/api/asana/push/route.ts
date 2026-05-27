import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createTask, getMe } from '@/lib/asana'

export async function POST(req: NextRequest) {
  const { taskId } = await req.json()
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  if (!workspaceGid) {
    return NextResponse.json({ error: 'ASANA_WORKSPACE_GID not set' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (error || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.asana_id) return NextResponse.json({ error: 'Already in Asana' }, { status: 409 })

  const me = await getMe()
  const asanaTask = await createTask({
    name: task.title,
    notes: task.description ?? '',
    due_on: task.due_date ?? null,
    workspace: workspaceGid,
    assignee: me.gid,
  })

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ asana_id: asanaTask.gid, updated_at: new Date().toISOString() })
    .eq('id', taskId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ asana_id: asanaTask.gid })
}
