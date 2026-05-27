'use client'

import { useEffect, useState } from 'react'
import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { Calendar, Mail, ExternalLink, Loader2, AlertCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CalendarEvent } from '@/app/api/google/calendar/route'
import type { GmailMessage } from '@/app/api/google/gmail/route'

function relativeDay(dateStr: string) {
  try {
    const d = parseISO(dateStr)
    if (isToday(d))    return 'Today'
    if (isTomorrow(d)) return 'Tomorrow'
    return format(d, 'EEE d MMM')
  } catch {
    return dateStr
  }
}

function formatTime(dateStr: string, isAllDay: boolean) {
  if (isAllDay) return 'All day'
  try { return format(parseISO(dateStr), 'HH:mm') } catch { return '' }
}

export function GoogleIntegration() {
  const [connected, setConnected]   = useState<boolean | null>(null)
  const [events, setEvents]         = useState<CalendarEvent[]>([])
  const [messages, setMessages]     = useState<GmailMessage[]>([])
  const [loadingCal, setLoadingCal] = useState(false)
  const [loadingMail, setLoadingMail] = useState(false)
  const [tab, setTab]               = useState<'calendar' | 'gmail'>('calendar')

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((d) => {
        setConnected(d.connected)
        if (d.connected) {
          loadCalendar()
          loadGmail()
        }
      })
      .catch(() => setConnected(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadCalendar = async () => {
    setLoadingCal(true)
    try {
      const res  = await fetch('/api/google/calendar?days=7')
      const data = await res.json()
      setEvents(data.events ?? [])
    } finally {
      setLoadingCal(false)
    }
  }

  const loadGmail = async () => {
    setLoadingMail(true)
    try {
      const res  = await fetch('/api/google/gmail?max=8')
      const data = await res.json()
      setMessages(data.messages ?? [])
    } finally {
      setLoadingMail(false)
    }
  }

  if (connected === null) return null // still checking

  if (!connected) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-5">
        <div className="flex items-start gap-4">
          <div className="flex gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground/60" />
            <Mail     className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Connect Google</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Connect your Google account to see Calendar events and Gmail in the dashboard.
            </p>
          </div>
          <a href="/api/auth/google">
            <Button size="sm" className="gap-1.5 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
              Connect
            </Button>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
            tab === 'calendar'
              ? 'border-accent text-accent font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          Calendar
          {events.length > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
              {events.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('gmail')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
            tab === 'gmail'
              ? 'border-accent text-accent font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          Gmail
          {messages.filter((m) => m.isUnread).length > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
              {messages.filter((m) => m.isUnread).length}
            </span>
          )}
        </button>
      </div>

      {/* Calendar events */}
      {tab === 'calendar' && (
        <div>
          {loadingCal ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No events in the next 7 days.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {events.map((event) => (
                <a
                  key={event.id}
                  href={event.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="mt-0.5 flex flex-col items-center shrink-0 w-10 text-center">
                    <span className="text-[10px] text-muted-foreground">{relativeDay(event.start)}</span>
                    <span className="text-xs font-medium text-accent">{formatTime(event.start, event.isAllDay)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    {event.location && (
                      <p className="truncate text-xs text-muted-foreground">{event.location}</p>
                    )}
                  </div>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/30 mt-1" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gmail messages */}
      {tab === 'gmail' && (
        <div>
          {loadingMail ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Inbox is empty.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {messages.map((msg) => (
                <a
                  key={msg.id}
                  href={`https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {msg.isUnread && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  )}
                  {!msg.isUnread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate text-sm ${msg.isUnread ? 'font-semibold' : 'font-medium'}`}>
                        {msg.subject}
                      </p>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{msg.from}</p>
                    {msg.snippet && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{msg.snippet}</p>
                    )}
                  </div>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/30 mt-1" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
