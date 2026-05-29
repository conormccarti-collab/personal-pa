import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyCapture } from '@/lib/ai/claude'

const DESTINATION_LABELS: Record<string, string> = {
  task:     'Tasks',
  idea:     'Ideas vault',
  reminder: 'Reminders',
  note:     'Inbox',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { content, source = 'text', raw_image_url = null } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }

  // 1. Save capture immediately
  const { data: capture, error: captureErr } = await supabase
    .from('captures')
    .insert({ content: content.trim(), source, raw_image_url, status: 'inbox' })
    .select()
    .single()

  if (captureErr) return NextResponse.json({ error: captureErr.message }, { status: 500 })

  // 2. Classify with AI (Haiku — fast and cheap)
  let classification
  try {
    classification = await classifyCapture(content.trim())
  } catch {
    // If classification fails, just return the capture as-is
    return NextResponse.json({ ...capture, routing: { classified_as: 'note', destination: 'Inbox', routed_id: null } }, { status: 201 })
  }

  const { type, title, suggested_due_date, push_to_asana } = classification
  let routedId: string | null = null

  // 3. Route based on type
  if (type === 'task') {
    const { data: task } = await supabase
      .from('tasks')
      .insert({
        title,
        description: content.trim(),
        status: 'todo',
        priority: 'medium',
        due_date: suggested_due_date ?? null,
        source: 'capture',
      })
      .select('id')
      .single()
    routedId = task?.id ?? null

  } else if (type === 'idea') {
    const { data: idea } = await supabase
      .from('ideas')
      .insert({ title, content: content.trim(), tags: [] })
      .select('id')
      .single()
    routedId = idea?.id ?? null
    // Auto-tag in background
    import('@/lib/ai/claude').then(({ autoTagIdea }) => {
      autoTagIdea(content.trim()).then((tags) => {
        if (tags?.length && routedId) {
          supabase.from('ideas').update({ tags }).eq('id', routedId).then(() => {})
        }
      }).catch(() => {})
    }).catch(() => {})

  } else if (type === 'reminder') {
    const { data: task } = await supabase
      .from('tasks')
      .insert({
        title,
        description: content.trim(),
        status: 'todo',
        priority: 'medium',
        due_date: suggested_due_date ?? null,
        source: 'capture',
        category: 'Reminders',
      })
      .select('id')
      .single()
    routedId = task?.id ?? null
  }

  // 4. Update capture with routing metadata
  const status = type === 'note' ? 'inbox' : 'processed'
  await supabase
    .from('captures')
    .update({
      status,
      metadata: { classified_as: type, routed_id: routedId, push_to_asana, suggested_due_date },
    })
    .eq('id', capture.id)

  // 5. Optionally push task to Asana in background
  if (type === 'task' && push_to_asana && routedId) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/asana/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: routedId }),
    }).catch(() => {})
  }

  return NextResponse.json({
    ...capture,
    routing: {
      classified_as: type,
      destination: DESTINATION_LABELS[type] ?? 'Inbox',
      routed_id: routedId,
      push_to_asana: push_to_asana && type === 'task',
    },
  }, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('captures')
    .select('*')
    .eq('status', 'inbox')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
