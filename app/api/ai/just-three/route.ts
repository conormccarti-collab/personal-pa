import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { justThreeTasks } from '@/lib/ai/claude'
import { format } from 'date-fns'

export async function GET() {
  const supabase = await createClient()

  const [tasksRes, profileRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, due_date, status')
      .in('status', ['todo', 'in_progress'])
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(30),
    supabase.from('profiles').select('role, priorities, ai_context').single(),
  ])

  const tasks = tasksRes.data ?? []
  const profile = profileRes.data
  const profileText = profile
    ? [profile.role, profile.priorities, profile.ai_context].filter(Boolean).join(' · ')
    : ''

  if (tasks.length === 0) return NextResponse.json({ tasks: [] })

  const picks = await justThreeTasks({
    tasks,
    profile: profileText,
    date: format(new Date(), 'EEEE, MMMM d'),
  })

  return NextResponse.json({ tasks: picks })
}
