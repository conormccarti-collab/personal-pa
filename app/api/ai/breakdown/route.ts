import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { breakdownTask } from '@/lib/ai/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { taskId } = await req.json()

  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, title, description')
    .eq('id', taskId)
    .single()

  if (error || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const profileRes = await supabase.from('profiles').select('role, priorities, ai_context').single()
  const profile = profileRes.data
  const profileText = profile
    ? [profile.role, profile.priorities, profile.ai_context].filter(Boolean).join(' · ')
    : ''

  const steps = await breakdownTask({
    title: task.title,
    description: task.description,
    profile: profileText,
  })

  // Persist on the task so we don't regenerate every time
  await supabase
    .from('tasks')
    .update({ breakdown_steps: steps, updated_at: new Date().toISOString() })
    .eq('id', taskId)

  return NextResponse.json({ steps })
}
