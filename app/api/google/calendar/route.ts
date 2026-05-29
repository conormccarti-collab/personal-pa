import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/google/tokens'
import { startOfDay, endOfDay, addDays, format, parseISO } from 'date-fns'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location: string | null
  description: string | null
  htmlLink: string
  isAllDay: boolean
}

/**
 * GET /api/google/calendar?days=7
 * Returns upcoming calendar events (default: today + 7 days).
 */
export async function GET(req: NextRequest) {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: 'not_connected', events: [] }, { status: 401 })
  }

  const days    = parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10)
  const fromStr = req.nextUrl.searchParams.get('from') // optional YYYY-MM-DD start date
  const now     = fromStr ? parseISO(fromStr) : new Date()
  const timeMin = startOfDay(now).toISOString()
  const timeMax = endOfDay(addDays(now, days)).toISOString()

  // Fetch all calendars the account has access to (includes shared calendars)
  const calListRes = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const calListData = calListRes.ok ? await calListRes.json() : { items: [] }
  const calendarIds: string[] = (calListData.items ?? [])
    .filter((c: Record<string, unknown>) => c.selected !== false)
    .map((c: Record<string, unknown>) => c.id as string)

  // Fall back to primary if calendarList failed
  if (calendarIds.length === 0) calendarIds.push('primary')

  // Fetch events from all calendars in parallel
  const allEventArrays = await Promise.all(
    calendarIds.map(async (calId) => {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`)
      url.searchParams.set('timeMin',      timeMin)
      url.searchParams.set('timeMax',      timeMax)
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy',      'startTime')
      url.searchParams.set('maxResults',   '50')
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return []
      const data = await res.json()
      return data.items ?? []
    })
  )

  // Flatten, deduplicate by id, and sort by start time
  const seen = new Set<string>()
  const rawEvents = allEventArrays.flat().filter((item: Record<string, unknown>) => {
    if (seen.has(item.id as string)) return false
    seen.add(item.id as string)
    return true
  })

  rawEvents.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aStart = (a.start as Record<string, string>)?.dateTime ?? (a.start as Record<string, string>)?.date ?? ''
    const bStart = (b.start as Record<string, string>)?.dateTime ?? (b.start as Record<string, string>)?.date ?? ''
    return aStart < bStart ? -1 : 1
  })

  const events: CalendarEvent[] = rawEvents.map((item: Record<string, unknown>) => {
    const start = item.start as Record<string, string>
    const end   = item.end   as Record<string, string>
    const isAllDay = Boolean(start?.date && !start?.dateTime)
    return {
      id:          item.id as string,
      title:       (item.summary as string) ?? '(No title)',
      start:       start?.dateTime ?? start?.date ?? '',
      end:         end?.dateTime   ?? end?.date   ?? '',
      location:    (item.location    as string | null) ?? null,
      description: (item.description as string | null) ?? null,
      htmlLink:    (item.htmlLink    as string) ?? '',
      isAllDay,
    }
  })

  return NextResponse.json({ events })
}
