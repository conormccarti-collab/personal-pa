import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateBriefing } from '@/lib/ai/claude'
import { format, startOfDay, endOfDay, subDays, startOfWeek } from 'date-fns'

export async function GET() {
  const supabase = await createClient()
  const today = new Date()

  // Check for a pre-generated brief from the 8am cron — serve it instantly
  const todayStart = startOfDay(today).toISOString()
  const { data: cached } = await supabase
    .from('notifications')
    .select('body')
    .eq('type', 'morning_brief')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached?.body) {
    // Mark it read so the bell doesn't badge for something already seen on the dashboard
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('type', 'morning_brief')
      .gte('created_at', todayStart)
    return NextResponse.json({ briefing: cached.body })
  }

  const staleThreshold = subDays(today, 7).toISOString()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }).toISOString()
  const todayDate = today.toISOString().slice(0, 10)

  const [tasksRes, meetingsRes, followUpsRes, profileRes, overdueRes, staleRes, doneThisWeekRes] =
    await Promise.all([
      supabase
        .from('tasks')
        .select('title, priority, due_date, status')
        .in('status', ['todo', 'in_progress'])
        .order('priority', { ascending: false })
        .limit(8),
      supabase
        .from('meetings')
        .select('title, start_time, location')
        .gte('start_time', startOfDay(today).toISOString())
        .lte('start_time', endOfDay(today).toISOString())
        .order('start_time'),
      supabase
        .from('follow_ups')
        .select('description, due_date')
        .eq('completed', false)
        .limit(5),
      supabase.from('profiles').select('*').single(),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['todo', 'in_progress'])
        .not('due_date', 'is', null)
        .lt('due_date', todayDate),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['todo', 'in_progress'])
        .lt('updated_at', staleThreshold),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'done')
        .gte('updated_at', weekStart),
    ])

  const tasks = tasksRes.data ?? []
  const meetings = meetingsRes.data ?? []
  const followUps = followUpsRes.data ?? []
  const profile = profileRes.data
  const overdueCount = overdueRes.count ?? 0
  const staleCount = staleRes.count ?? 0
  const completedThisWeek = doneThisWeekRes.count ?? 0

  if (tasks.length === 0 && meetings.length === 0 && !profile) {
    return NextResponse.json({ briefing: '' })
  }

  const profileText = profile
    ? [profile.role, profile.working_style, profile.priorities].filter(Boolean).join(' · ')
    : 'No profile set.'

  const briefing = await generateBriefing({
    profile: profileText,
    aiContext: profile?.ai_context ?? '',
    tasks: tasks.length ? JSON.stringify(tasks) : 'No tasks.',
    meetings: meetings.length
      ? meetings
          .map((m) => `${m.title} at ${m.start_time}${m.location ? ` (${m.location})` : ''}`)
          .join(', ')
      : 'Nothing scheduled.',
    followUps: followUps.length ? followUps.map((f) => f.description).join(', ') : 'None.',
    date: format(today, 'EEEE, MMMM d'),
    dayOfWeek: format(today, 'EEEE'),
    overdueCount,
    staleCount,
    completedThisWeek,
  })

  return NextResponse.json({ briefing })
}
