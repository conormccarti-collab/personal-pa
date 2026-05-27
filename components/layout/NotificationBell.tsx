'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Bell, X, Camera, RotateCcw, Sparkles, CalendarCheck, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

interface Notification {
  id:         string
  type:       string
  title:      string
  body:       string | null
  data:       Record<string, unknown>
  read:       boolean
  created_at: string
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  morning_brief:   <CalendarCheck className="h-4 w-4 text-accent" />,
  shoot_prep:      <Camera className="h-4 w-4 text-blue-400" />,
  shoot_proposals: <Sparkles className="h-4 w-4 text-purple-400" />,
  rollover:        <RotateCcw className="h-4 w-4 text-amber-400" />,
  weekly_review:   <Sparkles className="h-4 w-4 text-emerald-400" />,
  asana_sync:      <CalendarCheck className="h-4 w-4 text-muted-foreground" />,
}

const TYPE_HREF: Record<string, string | null> = {
  morning_brief:   '/',
  shoot_prep:      '/shoots',
  shoot_proposals: '/shoots',
  rollover:        '/todo',
  weekly_review:   '/',
  asana_sync:      '/tasks',
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen]                   = useState(false)
  const panelRef                          = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read).length

  const load = useCallback(async () => {
    const res  = await fetch('/api/notifications')
    const data = await res.json()
    setNotifications(data.notifications ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // Poll every 2 minutes for new notifications
  useEffect(() => {
    const iv = setInterval(load, 2 * 60 * 1000)
    return () => clearInterval(iv)
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'POST' })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const dismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-10 z-[100] w-80 rounded-xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-accent hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : notifications.map((n) => {
              const href = TYPE_HREF[n.type] ?? null
              const Content = (
                <div
                  className={`relative flex gap-3 px-4 py-3 transition-colors ${
                    n.read ? 'bg-transparent' : 'bg-accent/5'
                  } hover:bg-muted/30 cursor-pointer`}
                  onClick={() => { markRead(n.id); setOpen(false) }}
                >
                  {/* Unread dot */}
                  {!n.read && (
                    <span className="absolute left-2 top-4 h-1.5 w-1.5 rounded-full bg-accent" />
                  )}

                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICON[n.type] ?? <Bell className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground leading-snug line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/50">
                      {format(parseISO(n.created_at), 'EEE, MMM d · h:mm a')}
                    </p>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={(e) => dismiss(n.id, e)}
                    className="shrink-0 self-start mt-0.5 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>

                  {/* Arrow for linked items */}
                  {href && <ChevronRight className="shrink-0 self-center h-3.5 w-3.5 text-muted-foreground/30" />}
                </div>
              )

              return href ? (
                <Link key={n.id} href={href}>{Content}</Link>
              ) : (
                <div key={n.id}>{Content}</div>
              )
            })}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2 flex justify-end">
              <button
                onClick={async () => {
                  await Promise.all(notifications.map((n) => fetch(`/api/notifications/${n.id}`, { method: 'DELETE' })))
                  setNotifications([])
                }}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
