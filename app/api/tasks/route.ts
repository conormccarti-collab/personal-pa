import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = req.nextUrl

  // ?filter=publish&from=YYYY-MM-DD&to=YYYY-MM-DD — for the content calendar overlay
  if (searchParams.get('filter') === 'publish') {
    const from = searchParams.get('from')
    const to   = searchParams.get('to')
    let query = supabase
      .from('tasks')
      .select('id, title, parent_task_title, due_date')
      .ilike('title', '%publish%')
      .neq('status', 'done')
      .neq('status', 'archived')
      .not('due_date', 'is', null)
    if (from) query = query.gte('due_date', from)
    if (to)   query = query.lte('due_date', to)
    const { data, error } = await query.order('due_date')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .neq('status', 'archived')
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { title, description, priority = 'medium', due_date, project, tags } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  // Save to DB first
  const { data, error } = await supabase
    .from('tasks')
    .insert({ title: title.trim(), description, priority, due_date, project, tags: tags ?? [] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Push to Asana (best-effort — don't fail the request if Asana is down)
  const asanaToken = process.env.ASANA_PERSONAL_ACCESS_TOKEN
  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  if (asanaToken && workspaceGid) {
    try {
      const asanaPayload: Record<string, unknown> = {
        name: title.trim(),
        assignee: 'me',
        workspace: workspaceGid,
      }
      if (description) asanaPayload.notes = description
      if (due_date) asanaPayload.due_on = due_date.split('T')[0]

      const asanaRes = await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${asanaToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ data: asanaPayload }),
      })

      if (asanaRes.ok) {
        const { data: asanaTask } = await asanaRes.json()
        // Write asana_id back to the DB row
        await supabase
          .from('tasks')
          .update({ asana_id: asanaTask.gid })
          .eq('id', data.id)
        data.asana_id = asanaTask.gid
      }
    } catch {
      // Non-fatal — task already saved locally
    }
  }

  return NextResponse.json(data, { status: 201 })
}
