import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWeeklyPlan } from '@/lib/ai/claude'
import { getAccessToken } from '@/lib/google/tokens'
import { format, startOfWeek, addDays, endOfDay, startOfDay } from 'date-fns'

export async function POST() {
  const supabase = await createClient()
  const today  = new Date()
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  const friday = addDays(monday, 4)
  const weekStartStr = monday.toISOString().slice(0, 10)

  const weekDays = Array.from({ length: 5 }, (_, i) =>
    format(addDays(monday, i), 'EEEE MMM d')
  )

  const [tasksRes, shootsRes, profileRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, due_date, estimated_hours, status, category')
      .in('status', ['todo', 'in_progress'])
      .not('due_date', 'is', null)
      .lte('due_date', addDays(friday, 7).toISOString().slice(0, 10))
      .order('due_date', { ascending: true })
      .limit(20),
    supabase
      .from('shoots')
      .select('title, start_date, end_date, shoot_type, location')
      .gte('start_date', weekStartStr)
      .lte('start_date', friday.toISOString().slice(0, 10))
      .neq('status', 'cancelled'),
    supabase.from('profiles').select('*').maybeSingle(),
  ])

  const tasks   = tasksRes.data ?? []
  const shoots  = shootsRes.data ?? []
  const profile = profileRes.data

  const profileText = profile
    ? [profile.role, profile.priorities, profile.working_style].filter(Boolean).join(' — ')
    : ''

  // Fetch Google Calendar events for the week
  let calendarEvents = 'None'
  try {
    const token = await getAccessToken()
    if (token) {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('timeMin',      startOfDay(monday).toISOString())
      url.searchParams.set('timeMax',      endOfDay(friday).toISOString())
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy',      'startTime')
      url.searchParams.set('maxResults',   '20')
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const lines = (data.items ?? []).map((item: Record<string, unknown>) => {
          const start = item.start as Record<string, string>
          const isAllDay = Boolean(start?.date && !start?.dateTime)
          const day = format(new Date(start?.dateTime ?? start?.date ?? today), 'EEE')
          const time = isAllDay ? 'all-day' : format(new Date(start.dateTime), 'h:mma')
          return `${day} ${time}: ${item.summary ?? '(No title)'}`
        })
        if (lines.length) calendarEvents = lines.join(', ')
      }
    }
  } catch { /* optional */ }

  const shootLines = shoots.map(s =>
    `${format(new Date(s.start_date), 'EEE')}: ${s.title}${s.location ? ` at ${s.location}` : ''} (${s.shoot_type})`
  ).join(', ')

  const taskLines = tasks.map(t =>
    `[${t.priority}] ${t.title} — due ${t.due_date}${t.estimated_hours ? ` (~${t.estimated_hours}h)` : ''}`
  ).join('\n')

  const plan = await generateWeeklyPlan({
    weekStart:      format(monday, 'MMMM d, yyyy'),
    weekDays,
    tasks:          taskLines || 'No upcoming deadlines',
    shoots:         shootLines || 'None',
    calendarEvents,
    profile:        profileText,
    aiContext:      profile?.ai_context ?? '',
  })

  if (!plan) {
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 })
  }

  await supabase.from('weekly_plans').upsert(
    { week_start: weekStartStr, plan, generated_at: new Date().toISOString() },
    { onConflict: 'week_start' }
  )

  return NextResponse.json({ ok: true, plan, week_start: weekStartStr })
}
