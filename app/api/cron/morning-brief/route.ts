import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron'
import { generateBriefing } from '@/lib/ai/claude'
import { getAccessToken } from '@/lib/google/tokens'
import { format, subDays, startOfDay, endOfDay, startOfWeek } from 'date-fns'

/**
 * GET /api/cron/morning-brief
 * Runs at 08:00 every day (Vercel cron).
 * Pre-generates today's morning briefing and stores it in notifications so the
 * dashboard can serve it instantly (no LLM wait on page load).
 */
export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const supabase = await createClient()
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const staleThreshold = subDays(today, 7).toISOString()
  const weekStart      = startOfWeek(today, { weekStartsOn: 1 }).toISOString()

  const [tasksRes, shootsRes, profileRes, overdueRes, staleRes, doneThisWeekRes] =
    await Promise.all([
      supabase
        .from('tasks')
        .select('title, priority, due_date, status')
        .in('status', ['todo', 'in_progress'])
        .order('priority', { ascending: false })
        .limit(8),
      supabase
        .from('shoots')
        .select('title, start_date, end_date, location, shoot_type')
        .eq('start_date', todayStr)
        .neq('status', 'cancelled'),
      supabase.from('profiles').select('*').maybeSingle(),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['todo', 'in_progress'])
        .not('due_date', 'is', null)
        .lt('due_date', todayStr),
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

  const tasks          = tasksRes.data ?? []
  const shoots         = shootsRes.data ?? []
  const profile        = profileRes.data
  const overdueCount   = overdueRes.count ?? 0
  const staleCount     = staleRes.count ?? 0
  const completedThisWeek = doneThisWeekRes.count ?? 0

  const profileText = profile
    ? [profile.role, profile.working_style, profile.priorities].filter(Boolean).join(' · ')
    : 'No profile set.'

  // Fetch today's Google Calendar events (if connected)
  let calendarLines: string[] = []
  try {
    const token = await getAccessToken()
    if (token) {
      const dayStart = startOfDay(today).toISOString()
      const dayEnd   = endOfDay(today).toISOString()
      const calUrl   = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      calUrl.searchParams.set('timeMin',      dayStart)
      calUrl.searchParams.set('timeMax',      dayEnd)
      calUrl.searchParams.set('singleEvents', 'true')
      calUrl.searchParams.set('orderBy',      'startTime')
      calUrl.searchParams.set('maxResults',   '10')
      const calRes  = await fetch(calUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
      if (calRes.ok) {
        const calData = await calRes.json()
        calendarLines = (calData.items ?? []).map((item: Record<string, unknown>) => {
          const start    = item.start as Record<string, string>
          const isAllDay = Boolean(start?.date && !start?.dateTime)
          const timeStr  = isAllDay ? 'All day' : format(new Date(start?.dateTime ?? ''), 'h:mm a')
          return `${timeStr} — ${item.summary ?? '(No title)'}`
        })
      }
    }
  } catch { /* calendar is optional — don't fail the brief */ }

  // Combine calendar events + shoots for the meetings context
  const shootLines = shoots.map((s) => `Shoot: ${s.title}${s.location ? ` at ${s.location}` : ''}`)
  const allMeetings = [...calendarLines, ...shootLines]
  const meetingsText = allMeetings.length ? allMeetings.join(', ') : 'Nothing scheduled.'

  const briefing = await generateBriefing({
    profile: profileText,
    aiContext: profile?.ai_context ?? '',
    tasks: tasks.length ? JSON.stringify(tasks) : 'No tasks.',
    meetings: meetingsText,
    followUps: 'None.',
    date: format(today, 'EEEE, MMMM d'),
    dayOfWeek: format(today, 'EEEE'),
    overdueCount,
    staleCount,
    completedThisWeek,
  })

  // Upsert — the unique index on (type, day) handles duplicates
  const { error } = await supabase
    .from('notifications')
    .upsert(
      {
        type:  'morning_brief',
        title: `Morning brief — ${format(today, 'EEEE, MMM d')}`,
        body:  briefing,
        data:  {
          shoots_today: shoots.length,
          overdue:      overdueCount,
          stale:        staleCount,
          completed_this_week: completedThisWeek,
        },
        read:  false,
      },
      { onConflict: 'type,day', ignoreDuplicates: false }
    )

  if (error) {
    console.error('[cron/morning-brief] upsert error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, shoots_today: shoots.length })
}
