'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Calendar, AlertCircle, ExternalLink } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Meeting, FollowUp } from '@/types'
import type { CalendarEvent } from '@/app/api/google/calendar/route'

interface Props {
  meetings: Meeting[]
  followUps: FollowUp[]
}

interface MergedMeeting {
  id: string
  title: string
  time: string       // ISO string for sorting
  timeLabel: string  // formatted for display
  location?: string | null
  htmlLink?: string  // Google Calendar link if from Google
  source: 'google' | 'local'
}

function toMerged(m: Meeting): MergedMeeting {
  return {
    id:        `local-${m.id}`,
    title:     m.title,
    time:      m.start_time,
    timeLabel: formatDate(m.start_time),
    location:  m.location,
    source:    'local',
  }
}

function googleToMerged(e: CalendarEvent): MergedMeeting {
  const timeLabel = e.isAllDay
    ? 'All day'
    : (() => { try { return format(parseISO(e.start), 'HH:mm') } catch { return '' } })()
  return {
    id:        `google-${e.id}`,
    title:     e.title,
    time:      e.start,
    timeLabel,
    location:  e.location,
    htmlLink:  e.htmlLink,
    source:    'google',
  }
}

export function UpcomingItems({ meetings, followUps }: Props) {
  const pending = followUps.filter((f) => !f.completed)
  const [mergedMeetings, setMergedMeetings] = useState<MergedMeeting[]>(
    meetings.map(toMerged)
  )

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((d) => {
        if (!d.connected) return
        // Fetch today's events only (days=1)
        return fetch('/api/google/calendar?days=1')
          .then((r) => r.json())
          .then((data) => {
            const todayStr = format(new Date(), 'yyyy-MM-dd')
            const googleEvents: CalendarEvent[] = (data.events ?? []).filter(
              (e: CalendarEvent) => e.start.slice(0, 10) === todayStr
            )
            const localMeetings = meetings.map(toMerged)
            const googleMeetings = googleEvents.map(googleToMerged)

            // Merge: prefer Google as source of truth, dedupe by normalised title+time
            const seen = new Set<string>()
            const all = [...googleMeetings, ...localMeetings].filter((m) => {
              const key = `${m.title.toLowerCase().trim()}-${m.time.slice(0, 16)}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })

            all.sort((a, b) => (a.time < b.time ? -1 : 1))
            setMergedMeetings(all)
          })
      })
      .catch(() => {/* Google not connected — use local only */})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Meetings */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Meetings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {mergedMeetings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing in the calendar
            </p>
          ) : (
            mergedMeetings.map((m) => (
              <div key={m.id} className="flex gap-3">
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.timeLabel}</p>
                  {m.location && (
                    <p className="text-xs text-muted-foreground/70 truncate">{m.location}</p>
                  )}
                </div>
                {m.htmlLink && (
                  <a href={m.htmlLink} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5">
                    <ExternalLink className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground" />
                  </a>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Follow-ups */}
      <Card>
        <CardHeader>
          <CardTitle>Follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {pending.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              All clear
            </p>
          ) : (
            pending.slice(0, 5).map((f) => (
              <div key={f.id} className="flex gap-3">
                <div className="mt-0.5 shrink-0 text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm leading-snug">{f.description}</p>
                  {f.due_date && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(f.due_date)}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
