import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron'
import { generateFridayReview } from '@/lib/ai/claude'
import { format, subDays, startOfWeek } from 'date-fns'

/**
 * GET /api/cron/weekly-review
 * Runs at 17:00 every Friday. Pre-generates the weekly review so it's
 * ready when the user opens the app. Surfaces as a notification badge.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const supabase   = await createClient()
  const today      = new Date()
  const todayDate  = today.toISOString().slice(0, 10)
  const weekStart  = startOfWeek(today, { weekStartsOn: 1 }).toISOString()
  const staleThreshold = subDays(today, 7).toISOString()

  const [completedRes, pendingRes, overdueRes, staleRes, profileRes, shootHoursRes] =
    await Promise.all([
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
        .limit(10),
      supabase
        .from('tasks')
        .select('title, due_date')
        .in('status', ['todo', 'in_progress'])
        .not('due_date', 'is', null)
        .lt('due_date', todayDate)
        .limit(8),
      supabase
        .from('tasks')
        .select('title')
        .in('status', ['todo', 'in_progress'])
        .lt('updated_at', staleThreshold)
        .limit(8),
      supabase.from('profiles').select('*').maybeSingle(),
      // Shoot hours logged this week
      supabase
        .from('shoot_day_logs')
        .select('date, start_time, end_time, breaks')
        .gte('date', weekStart.slice(0, 10)),
    ])

  const completed  = completedRes.data ?? []
  const pending    = pendingRes.data ?? []
  const overdue    = overdueRes.data ?? []
  const stale      = staleRes.data ?? []
  const profile    = profileRes.data
  const shootLogs  = shootHoursRes.data ?? []

  // Calculate total shoot hours for the week
  let totalShootMins = 0
  for (const log of shootLogs) {
    if (!log.start_time || !log.end_time) continue
    const [sh, sm] = log.start_time.split(':').map(Number)
    const [eh, em] = log.end_time.split(':').map(Number)
    const rawMins = (eh * 60 + em) - (sh * 60 + sm)
    const breaks: { minutes: number }[] = Array.isArray(log.breaks) ? log.breaks : []
    const breakMins = breaks.reduce((sum, b) => sum + (b.minutes ?? 0), 0)
    totalShootMins += Math.max(0, rawMins - breakMins)
  }
  const totalShootHours = (totalShootMins / 60).toFixed(1)

  const profileText = profile
    ? [profile.role, profile.working_style, profile.priorities].filter(Boolean).join(' · ')
    : 'No profile set.'

  const extraContext = shootLogs.length
    ? `\nShoot days this week: ${shootLogs.length} day${shootLogs.length !== 1 ? 's' : ''} (${totalShootHours}h on set)`
    : ''

  const review = await generateFridayReview({
    profile: profileText,
    aiContext: (profile?.ai_context ?? '') + extraContext,
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
    staleTasks: stale.map((t) => t.title).join(', '),
  })

  await supabase.from('notifications').upsert(
    {
      type:  'weekly_review',
      title: `Weekly review — ${format(today, 'MMM d')}`,
      body:  review,
      data:  {
        completed:   completed.length,
        overdue:     overdue.length,
        shoot_days:  shootLogs.length,
        shoot_hours: totalShootHours,
      },
      read: false,
    },
    { onConflict: 'type,day', ignoreDuplicates: false }
  )

  return NextResponse.json({ ok: true, completed: completed.length, shootDays: shootLogs.length })
}
