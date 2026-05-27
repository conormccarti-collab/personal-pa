import { NextRequest, NextResponse } from 'next/server'
import { createTracked, MODEL } from '@/lib/ai/claude'
import { createClient } from '@/lib/supabase/server'
import { format, addDays } from 'date-fns'
import type { TodoSection } from '@/types'

type IncomingEvent = {
  id: string
  title: string
  start: string
  end: string
  isAllDay: boolean
  location?: string
}

type ExistingItem = {
  title: string
  section: string
  scheduled_day?: number | null
  scheduled_time?: string | null
  duration_minutes: number
}

export type PlannedTask = {
  title: string
  section: TodoSection
  scheduled_day?: number      // 0–6 for next_fortnight (Mon–Sun)
  scheduled_time?: string     // "HH:MM" for today / tomorrow
  duration_minutes: number
  notes?: string
}

export async function POST(req: NextRequest) {
  const { rawText, googleEvents = [], existingItems = [] } = await req.json() as {
    rawText: string
    googleEvents: IncomingEvent[]
    existingItems: ExistingItem[]
  }

  if (!rawText?.trim()) return NextResponse.json({ tasks: [] })

  // ── fetch user profile for working-style context ───────────────────────
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('*').maybeSingle()

  // ── compute date labels ────────────────────────────────────────────────
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun … 6=Sat

  // Upcoming Monday: if today IS Monday (1) start from today; Sun → +1; else → next Mon
  const daysToMonday = dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const monday = addDays(today, daysToMonday)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return {
      index: i,
      name:    format(date, 'EEEE'),
      display: format(date, 'EEEE, MMM d'),
      dateStr: format(date, 'yyyy-MM-dd'),
    }
  })

  // ── format calendar events ─────────────────────────────────────────────
  const fmtEvent = (e: IncomingEvent) => {
    const dateStr = e.start.slice(0, 10)
    const dayLabel =
      dateStr === format(today, 'yyyy-MM-dd')
        ? 'Today'
        : dateStr === format(addDays(today, 1), 'yyyy-MM-dd')
        ? 'Tomorrow'
        : weekDays.find(d => d.dateStr === dateStr)?.display
        ?? format(new Date(dateStr + 'T12:00:00'), 'EEEE, MMM d')
    const timeStr = e.isAllDay
      ? 'all day'
      : `${e.start.slice(11, 16)}–${e.end.slice(11, 16)}`
    return `  ${dayLabel}: ${e.title} (${timeStr})`
  }
  const calCtx = googleEvents.length
    ? googleEvents.map(fmtEvent).join('\n')
    : '  No events booked.'

  // ── format existing board items ────────────────────────────────────────
  const fmtItem = (item: ExistingItem): string | null => {
    if (item.section === 'today')
      return `  Today ${item.scheduled_time ?? ''}: ${item.title} (${item.duration_minutes}m)`
    if (item.section === 'tomorrow')
      return `  Tomorrow ${item.scheduled_time ?? ''}: ${item.title} (${item.duration_minutes}m)`
    if (item.section === 'next_fortnight' && item.scheduled_day != null)
      return `  ${weekDays[item.scheduled_day]?.display ?? `Day ${item.scheduled_day}`}: ${item.title} (${item.duration_minutes}m)`
    return null
  }
  const boardCtx = existingItems.length
    ? existingItems.map(fmtItem).filter(Boolean).join('\n')
    : '  Board is empty.'

  // ── profile context ────────────────────────────────────────────────────
  const profileCtx = [
    profile?.role            && `Role: ${profile.role}`,
    profile?.working_style   && `Working style: ${profile.working_style}`,
    profile?.priorities      && `Current priorities: ${profile.priorities}`,
    profile?.job_spec        && `Job spec: ${profile.job_spec}`,
    profile?.ai_context      && `Additional context: ${profile.ai_context}`,
  ].filter(Boolean).join('\n') || 'No profile set.'

  // ── call Claude ────────────────────────────────────────────────────────
  const message = await createTracked('plan_week', {
    model: MODEL,
    max_tokens: 2048,
    system: `You are a personal week planner for a video production professional. You create realistic, focused schedules that respect working patterns and existing commitments. Return JSON only — no markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Plan these tasks across the week.

PROFILE:
${profileCtx}

DATES:
Today:    ${format(today, 'EEEE, MMMM d')}
Tomorrow: ${format(addDays(today, 1), 'EEEE, MMMM d')}
This week (scheduled_day index → date):
${weekDays.map(d => `  ${d.index} = ${d.display}`).join('\n')}

CALENDAR — do not schedule over these:
${calCtx}

ALREADY ON THE BOARD — do not duplicate these:
${boardCtx}

TASKS TO SCHEDULE:
${rawText}

SCHEDULING RULES:
- Working hours: 8am–7pm
- Creative / complex work (video editing, shooting, scripting, pre-production) → mornings 9am–1pm
- Admin, emails, reviews, planning → afternoons 2pm–6pm
- Use the profile's working style to decide focus hours
- Spread tasks across the week — don't pile everything onto one day
- Check calendar blocks and leave them free
- If a task is essentially the same as something already on the board, skip it
- Estimate durations honestly:
    quick/admin = 30m, medium = 60m, long/complex = 90m, major production = 120m
- For today or tomorrow: use section "today" or "tomorrow" with scheduled_time "HH:MM" (no scheduled_day)
- For the coming week: use section "next_fortnight" with scheduled_day 0–6 (no scheduled_time)

Return ONLY a valid JSON array — no other text:
[
  {"title":"...","section":"today","scheduled_time":"09:00","duration_minutes":60},
  {"title":"...","section":"next_fortnight","scheduled_day":0,"duration_minutes":90}
]`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let tasks: PlannedTask[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    tasks = match ? JSON.parse(match[0]) : []
  } catch {
    tasks = []
  }

  return NextResponse.json({ tasks })
}
