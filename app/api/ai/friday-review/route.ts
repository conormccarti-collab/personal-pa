import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFridayReview } from '@/lib/ai/claude'
import { format, subDays, startOfWeek } from 'date-fns'

export async function GET() {
  const supabase = await createClient()
  const today = new Date()
  const todayDate = today.toISOString().slice(0, 10)
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }).toISOString()
  const staleThreshold = subDays(today, 7).toISOString()

  const [completedRes, pendingRes, overdueRes, staleRes, profileRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('title, priority')
      .eq('status', 'done')
      .gte('updated_at', weekStart)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('tasks')
      .select('title, priority, due_date')
      .in('status', ['todo', 'in_progress'])
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('tasks')
      .select('title, due_date')
      .in('status', ['todo', 'in_progress'])
      .not('due_date', 'is', null)
      .lt('due_date', todayDate)
      .order('due_date')
      .limit(8),
    supabase
      .from('tasks')
      .select('title, updated_at')
      .in('status', ['todo', 'in_progress'])
      .lt('updated_at', staleThreshold)
      .order('updated_at')
      .limit(8),
    supabase.from('profiles').select('*').single(),
  ])

  const completed = completedRes.data ?? []
  const pending = pendingRes.data ?? []
  const overdue = overdueRes.data ?? []
  const stale = staleRes.data ?? []
  const profile = profileRes.data

  const profileText = profile
    ? [profile.role, profile.working_style, profile.priorities].filter(Boolean).join(' · ')
    : 'No profile set.'

  const review = await generateFridayReview({
    profile: profileText,
    aiContext: profile?.ai_context ?? '',
    date: format(today, 'EEEE, MMMM d'),
    completedTasks: completed.length
      ? completed.map((t) => `${t.title} (${t.priority})`).join(', ')
      : '',
    pendingTasks: pending.length
      ? pending.map((t) => `${t.title} (${t.priority}${t.due_date ? `, due ${t.due_date}` : ''})`).join(', ')
      : '',
    overdueTasks: overdue.length
      ? overdue.map((t) => `${t.title} (due ${t.due_date})`).join(', ')
      : '',
    staleTasks: stale.length
      ? stale.map((t) => `${t.title}`).join(', ')
      : '',
  })

  return NextResponse.json({ review })
}
