'use client'

import { useEffect, useState, useRef, useCallback, forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, X, GripVertical, Clock, CheckCircle2, Circle, Loader2, StickyNote, CalendarRange, Sparkles } from 'lucide-react'
import { format, parseISO, addDays } from 'date-fns'
import type { TodoItem, TodoSection } from '@/types'
import type { CalendarEvent } from '@/app/api/google/calendar/route'
import { TODO_CATEGORIES } from '@/lib/todo-categories'

// ─── constants ───────────────────────────────────────────────────────────────
const SLOT_H = 44          // px per slot unit (Today column)
const WEEK_ROW_H = 76     // px per day row in the Fortnight column
const TODAY_START = 7      // 7am
const TODAY_END = 22       // 10pm
const TOTAL_TIME_SLOTS = (TODAY_END - TODAY_START) * 2   // 30 slots
const RESIZE_HANDLE_H = 8  // px at bottom of block that triggers resize

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const SECTION_COLORS: Record<TodoSection, string> = {
  today: '#7c6af7',
  tomorrow: '#f59e0b',
  next_fortnight: '#22c55e',
}

// ─── time helpers ────────────────────────────────────────────────────────────
function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minsToTime(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
function timeToTop(time: string) {
  return ((timeToMins(time) - TODAY_START * 60) / 30) * SLOT_H
}
function topToTime(top: number) {
  const mins = TODAY_START * 60 + (top / SLOT_H) * 30
  return minsToTime(Math.round(mins / 30) * 30) // snap to 30-min
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'am' : 'pm'
  const hour = h % 12 || 12
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

// ─── overlap detection for Today ─────────────────────────────────────────────
function assignColumns(items: TodoItem[]): Map<string, number> {
  const sorted = [...items].sort((a, b) =>
    timeToMins(a.scheduled_time ?? '00:00') - timeToMins(b.scheduled_time ?? '00:00')
  )
  const colEnds: number[] = [] // end-minute of last item in each column
  const result = new Map<string, number>()
  for (const item of sorted) {
    const start = timeToMins(item.scheduled_time ?? '00:00')
    const end = start + (item.duration_minutes ?? 30)
    let col = colEnds.findIndex((e) => e <= start)
    if (col === -1) col = colEnds.length
    colEnds[col] = end
    result.set(item.id, col)
  }
  return result
}

// ─── overlap detection for Week ──────────────────────────────────────────────
function assignWeekColumns(items: TodoItem[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => (a.scheduled_day ?? 0) - (b.scheduled_day ?? 0))
  const colEnds: number[] = []
  const result = new Map<string, number>()
  for (const item of sorted) {
    const start = item.scheduled_day ?? 0
    const span = Math.max(1, Math.round((item.duration_minutes ?? 30) / 30))
    const end = start + span
    let col = colEnds.findIndex((e) => e <= start)
    if (col === -1) col = colEnds.length
    colEnds[col] = end
    result.set(item.id, col)
  }
  return result
}

// ─── drag state ──────────────────────────────────────────────────────────────
type DragState = {
  id: string
  mode: 'move' | 'resize'
  section: TodoSection
  startY: number
  origTime: string | null
  origDay: number | null
  origDuration: number
} | null

// ─── add form state ──────────────────────────────────────────────────────────
type AddForm = {
  section: TodoSection
  day?: number    // for week
  time?: string   // for today
} | null

// ─── main component ──────────────────────────────────────────────────────────
export function TodoBoard() {
  const [items, setItems] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drag, setDrag] = useState<DragState>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState<AddForm>(null)
  const [saving, setSaving] = useState(false)

  // plan-week modal
  const [planWeekOpen, setPlanWeekOpen] = useState(false)
  const [planWeekText, setPlanWeekText] = useState('')
  const [planWeekLoading, setPlanWeekLoading] = useState(false)

  // rollover modal — surfaces incomplete "today" items from yesterday's cron
  const [rolloverItems, setRolloverItems] = useState<{ id: string; text: string; color?: string | null }[]>([])
  const [rolloverNotifId, setRolloverNotifId] = useState<string | null>(null)

  // add form fields
  const [addTitle, setAddTitle] = useState('')
  const [addTime, setAddTime] = useState('09:00')
  const [addDay, setAddDay] = useState(0)
  const [addDuration, setAddDuration] = useState(30)
  const [addNotes, setAddNotes] = useState('')
  const [addColor, setAddColor] = useState('')

  const todayColRef = useRef<HTMLDivElement>(null)
  const tomorrowColRef = useRef<HTMLDivElement>(null)
  const weekColRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/todo')
    const data = await res.json()
    const normalise = (i: TodoItem) => ({ ...i, duration_minutes: i.duration_minutes ?? 30, origin: i.origin ?? 'manual' })
    setItems((data ?? []).map(normalise))
    setLoading(false)

    // Sync any tasks not yet on the board, then auto-colour new arrivals
    fetch('/api/todo/sync-tasks', { method: 'POST' })
      .then((r) => r.json())
      .then(({ created, updatedItems }) => {
        // Patch duration_minutes on existing items that now have section-based durations
        if (updatedItems?.length) {
          setItems((prev) =>
            prev.map((i) => {
              const u = (updatedItems as { id: string; duration_minutes: number }[]).find((x) => x.id === i.id)
              return u ? { ...i, duration_minutes: u.duration_minutes } : i
            })
          )
        }
        if (!created?.length) return
        const newItems = (created as TodoItem[]).map(normalise)
        setItems((prev) => [...prev, ...newItems])

        // Batch auto-colour only items that don't already have a section-based color
        const uncoloured = newItems.filter((i) => !i.color)
        if (!uncoloured.length) return
        fetch('/api/ai/categorise-todo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: uncoloured.map((i) => ({ id: i.id, title: i.title, notes: i.notes })),
          }),
        })
          .then((r) => r.json())
          .then(({ results }) => {
            if (!results?.length) return
            setItems((prev) =>
              prev.map((item) => {
                const hit = results.find((r: { id: string; color: string }) => r.id === item.id)
                return hit ? { ...item, color: hit.color } : item
              })
            )
            results.forEach((r: { id: string; color: string }) =>
              fetch(`/api/todo/${r.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color: r.color }),
              }).catch(() => {})
            )
          })
          .catch(() => {})
      })
      .catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  // Check for a pending rollover notification from last night's cron
  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then(({ notifications }) => {
        const rollover = (notifications ?? []).find(
          (n: { type: string; read: boolean; data: { items?: { id: string; text: string; color?: string | null }[] } }) =>
            n.type === 'rollover' && !n.read
        )
        if (rollover?.data?.items?.length) {
          setRolloverItems(rollover.data.items)
          setRolloverNotifId(rollover.id)
        }
      })
      .catch(() => {})
  }, [])

  // Google Calendar events
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([])
  useEffect(() => {
    fetch('/api/google/status')
      .then(r => r.json())
      .then(d => {
        if (!d.connected) return
        return fetch('/api/google/calendar?days=14')
          .then(r => r.json())
          .then(data => setGoogleEvents(data.events ?? []))
      })
      .catch(() => {})
  }, [])

  const todayStr    = format(new Date(), 'yyyy-MM-dd')
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const googleToday     = googleEvents.filter(e => e.start.slice(0, 10) === todayStr)
  const googleTomorrow  = googleEvents.filter(e => e.start.slice(0, 10) === tomorrowStr)
  const googleFortnight = googleEvents.filter(e => e.start.slice(0, 10) > tomorrowStr)

  // ── save helper ──────────────────────────────────────────────────────────
  const save = useCallback(async (id: string, patch: Partial<TodoItem>) => {
    await fetch(`/api/todo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }, [])

  // ── toggle complete ───────────────────────────────────────────────────────
  const toggle = useCallback(async (item: TodoItem) => {
    const completed = !item.completed
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completed } : i))
    await save(item.id, { completed })
  }, [save])

  // ── delete ────────────────────────────────────────────────────────────────
  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/todo/${id}`, { method: 'DELETE' })
  }, [])

  // ── add item ──────────────────────────────────────────────────────────────
  const addItem = async () => {
    if (!addTitle.trim() || !addForm) return
    setSaving(true)
    const manualColor = addColor   // snapshot before reset
    const payload: Record<string, unknown> = {
      title: addTitle.trim(),
      section: addForm.section,
      duration_minutes: addDuration,
      notes: addNotes || null,
      color: manualColor || null,
    }
    if (addForm.section === 'today' || addForm.section === 'tomorrow') payload.scheduled_time = addTime
    if (addForm.section === 'next_fortnight') payload.scheduled_day = addDay

    const res = await fetch('/api/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    const newItem: TodoItem = { ...data, duration_minutes: data.duration_minutes ?? 30 }
    setItems((prev) => [...prev, newItem])
    setAddTitle('')
    setAddNotes('')
    setAddColor('')
    setAddForm(null)
    setSaving(false)

    // If no colour was manually chosen, ask the AI to pick one in the background
    if (!manualColor && newItem.id) {
      fetch('/api/ai/categorise-todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: newItem.id, title: newItem.title, notes: newItem.notes }] }),
      })
        .then((r) => r.json())
        .then(({ results }) => {
          const result = results?.[0]
          if (!result?.color) return
          // Update local state immediately
          setItems((prev) =>
            prev.map((i) => i.id === newItem.id ? { ...i, color: result.color } : i)
          )
          // Persist to DB
          fetch(`/api/todo/${newItem.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: result.color }),
          }).catch(() => {})
        })
        .catch(() => {})
    }
  }

  // ── bulk AI categorise ────────────────────────────────────────────────────
  const [aiCategorising, setAiCategorising] = useState(false)
  const aiCategoriseAll = async () => {
    const uncategorised = items.filter((i) => !i.color)
    if (!uncategorised.length) return
    setAiCategorising(true)
    try {
      const res = await fetch('/api/ai/categorise-todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: uncategorised.map((i) => ({ id: i.id, title: i.title, notes: i.notes })),
        }),
      })
      const { results } = await res.json()
      if (!results?.length) return
      // Apply all updates optimistically then persist
      setItems((prev) =>
        prev.map((item) => {
          const hit = results.find((r: { id: string; color: string }) => r.id === item.id)
          return hit ? { ...item, color: hit.color } : item
        })
      )
      await Promise.all(
        results.map((r: { id: string; color: string }) =>
          fetch(`/api/todo/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: r.color }),
          })
        )
      )
    } finally {
      setAiCategorising(false)
    }
  }

  // ── plan week ─────────────────────────────────────────────────────────────
  const planWeek = async () => {
    if (!planWeekText.trim()) return
    setPlanWeekLoading(true)
    try {
      const res = await fetch('/api/ai/plan-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: planWeekText,
          googleEvents,
          existingItems: items.map((i) => ({
            title: i.title,
            section: i.section,
            scheduled_day: i.scheduled_day,
            scheduled_time: i.scheduled_time,
            duration_minutes: i.duration_minutes,
          })),
        }),
      })
      const { tasks: planned } = await res.json()
      if (!planned?.length) return

      const normalise = (i: TodoItem) => ({ ...i, duration_minutes: i.duration_minutes ?? 30, origin: i.origin ?? 'manual' })

      // Batch-create all planned items in parallel
      const created = await Promise.all(
        planned.map((task: Partial<TodoItem>) =>
          fetch('/api/todo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task),
          }).then((r) => r.json())
        )
      )
      const newItems = created.filter((d) => d?.id).map(normalise)
      setItems((prev) => [...prev, ...newItems])
      setPlanWeekText('')
      setPlanWeekOpen(false)

      // Auto-colour the new items in the background
      if (newItems.length) {
        fetch('/api/ai/categorise-todo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: newItems.map((i) => ({ id: i.id, title: i.title, notes: i.notes })),
          }),
        })
          .then((r) => r.json())
          .then(({ results }) => {
            if (!results?.length) return
            setItems((prev) =>
              prev.map((item) => {
                const hit = results.find((r: { id: string; color: string }) => r.id === item.id)
                return hit ? { ...item, color: hit.color } : item
              })
            )
            results.forEach((r: { id: string; color: string }) =>
              fetch(`/api/todo/${r.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color: r.color }),
              }).catch(() => {})
            )
          })
          .catch(() => {})
      }
    } finally {
      setPlanWeekLoading(false)
    }
  }

  // ── drag logic ────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, item: TodoItem, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      id: item.id,
      mode,
      section: item.section,
      startY: e.clientY,
      origTime: item.scheduled_time,
      origDay: item.scheduled_day,
      origDuration: item.duration_minutes ?? 30,
    })
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag) return
    const dy = e.clientY - drag.startY
    const slotDelta = Math.round(dy / SLOT_H)
    const dayDelta  = Math.round(dy / WEEK_ROW_H)

    setItems((prev) => prev.map((item) => {
      if (item.id !== drag.id) return item

      if (drag.mode === 'resize') {
        const newDur = Math.max(30, drag.origDuration + slotDelta * 30)
        return { ...item, duration_minutes: newDur }
      }

      // move
      if ((drag.section === 'today' || drag.section === 'tomorrow') && drag.origTime) {
        const origMins = timeToMins(drag.origTime)
        const newMins = Math.max(TODAY_START * 60, Math.min((TODAY_END - 1) * 60, origMins + slotDelta * 30))
        return { ...item, scheduled_time: minsToTime(newMins) }
      }
      if (drag.section === 'next_fortnight' && drag.origDay !== null) {
        const newDay = Math.max(0, Math.min(6, drag.origDay + dayDelta))
        return { ...item, scheduled_day: newDay }
      }
      return item
    }))
  }, [drag])

  const onMouseUp = useCallback(async () => {
    if (!drag) return
    const item = items.find((i) => i.id === drag.id)
    if (item) {
      const patch: Partial<TodoItem> = { duration_minutes: item.duration_minutes }
      if (drag.section === 'today' || drag.section === 'tomorrow') patch.scheduled_time = item.scheduled_time
      if (drag.section === 'next_fortnight') patch.scheduled_day = item.scheduled_day
      await save(item.id, patch)
    }
    setDrag(null)
  }, [drag, items, save])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── close expanded on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = () => setExpandedId(null)
    if (expandedId) window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [expandedId])

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>

  const bySection = (s: TodoSection) => items.filter((i) => i.section === s)
  const uncategorisedCount = items.filter((i) => !i.color).length

  // ── rollover: move items from today → tomorrow ──────────────────────────
  const confirmRollover = async () => {
    await Promise.all(
      rolloverItems.map((item) =>
        fetch(`/api/todo/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: 'tomorrow', scheduled_time: null }),
        })
      )
    )
    // Update local state
    setItems((prev) =>
      prev.map((i) =>
        rolloverItems.some((r) => r.id === i.id)
          ? { ...i, section: 'tomorrow' as TodoSection, scheduled_time: null }
          : i
      )
    )
    // Mark notification read and clear
    if (rolloverNotifId) {
      fetch(`/api/notifications/${rolloverNotifId}`, { method: 'PATCH' })
    }
    setRolloverItems([])
    setRolloverNotifId(null)
  }

  const dismissRollover = () => {
    if (rolloverNotifId) {
      fetch(`/api/notifications/${rolloverNotifId}`, { method: 'PATCH' })
    }
    setRolloverItems([])
    setRolloverNotifId(null)
  }

  return (
    <>
      {/* ── Rollover modal ────────────────────────────────────────────────── */}
      {rolloverItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl overflow-hidden mx-4">
            <div className="px-5 py-4 border-b border-border">
              <p className="font-semibold text-base">Roll over to tomorrow?</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {rolloverItems.length} item{rolloverItems.length !== 1 ? 's' : ''} from today weren't completed.
              </p>
            </div>
            <div className="max-h-48 overflow-y-auto px-5 py-3 space-y-1.5">
              {rolloverItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 text-sm">
                  {item.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                  )}
                  <span className="truncate text-foreground">{item.text}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3">
              <button
                onClick={dismissRollover}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Leave in Today
              </button>
              <button
                onClick={confirmRollover}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
              >
                Move to Tomorrow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan My Week modal ────────────────────────────────────────────── */}
      {planWeekOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!planWeekLoading) setPlanWeekOpen(false) }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Plan My Week
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Paste a task list or brain dump — Claude will schedule it across the week.
                </p>
              </div>
              <button
                onClick={() => setPlanWeekOpen(false)}
                disabled={planWeekLoading}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <textarea
                autoFocus
                value={planWeekText}
                onChange={(e) => setPlanWeekText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) planWeek() }}
                placeholder={
                  'Edit the WS brand video\nPrep for Tuesday shoot\nReply to client emails\nReview content calendar\nScript for next YouTube video'
                }
                rows={8}
                disabled={planWeekLoading}
                className="w-full resize-none rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/50 leading-relaxed disabled:opacity-50"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 pb-6">
              <p className="text-[11px] text-muted-foreground/50 leading-snug max-w-[200px]">
                Reads your working style, priorities &amp; calendar to schedule around your week.
                <br />⌘↵ to submit.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => setPlanWeekOpen(false)}
                  disabled={planWeekLoading}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={planWeek}
                  disabled={!planWeekText.trim() || planWeekLoading}
                  className="h-8 text-xs gap-1.5"
                >
                  {planWeekLoading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Planning…</>
                  ) : (
                    <><CalendarRange className="h-3.5 w-3.5" /> Plan it</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 mb-2">
        {uncategorisedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={aiCategoriseAll}
            disabled={aiCategorising}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            {aiCategorising
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <StickyNote className="h-3.5 w-3.5" />}
            Auto-colour {uncategorisedCount} block{uncategorisedCount !== 1 ? 's' : ''}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPlanWeekOpen(true)}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Plan My Week
        </Button>
      </div>

    <div
      className="flex gap-4 w-full overflow-x-auto pb-4"
      style={{ cursor: drag ? 'grabbing' : 'default' }}
    >
      <TodayColumn
        ref={todayColRef}
        items={bySection('today')}
        googleEvents={googleToday}
        drag={drag}
        expandedId={expandedId}
        addForm={addForm}
        addTitle={addTitle}
        addTime={addTime}
        addDuration={addDuration}
        addNotes={addNotes}
        addColor={addColor}
        saving={saving}
        onExpandToggle={(id) => setExpandedId((prev) => prev === id ? null : id)}
        onStartDrag={startDrag}
        onToggle={toggle}
        onDelete={remove}
        onSaveField={save}
        onOpenAdd={(time) => { setAddForm({ section: 'today', time }); setAddTime(time ?? '09:00'); setAddDuration(30) }}
        onAddTitle={setAddTitle}
        onAddTime={setAddTime}
        onAddDuration={setAddDuration}
        onAddNotes={setAddNotes}
        onAddColor={setAddColor}
        onAddItem={addItem}
        onCancelAdd={() => { setAddForm(null); setAddColor('') }}
      />

      <TodayColumn
        ref={tomorrowColRef}
        section="tomorrow"
        label="Tomorrow"
        items={bySection('tomorrow')}
        googleEvents={googleTomorrow}
        drag={drag}
        expandedId={expandedId}
        addForm={addForm}
        addTitle={addTitle}
        addTime={addTime}
        addDuration={addDuration}
        addNotes={addNotes}
        addColor={addColor}
        saving={saving}
        onExpandToggle={(id) => setExpandedId((prev) => prev === id ? null : id)}
        onStartDrag={startDrag}
        onToggle={toggle}
        onDelete={remove}
        onSaveField={save}
        onOpenAdd={(time) => { setAddForm({ section: 'tomorrow', time }); setAddTime(time ?? '09:00'); setAddDuration(30) }}
        onAddTitle={setAddTitle}
        onAddTime={setAddTime}
        onAddDuration={setAddDuration}
        onAddNotes={setAddNotes}
        onAddColor={setAddColor}
        onAddItem={addItem}
        onCancelAdd={() => { setAddForm(null); setAddColor('') }}
      />

      <WeekColumn
        ref={weekColRef}
        items={bySection('next_fortnight')}
        googleEvents={googleFortnight}
        drag={drag}
        expandedId={expandedId}
        addForm={addForm}
        addTitle={addTitle}
        addDay={addDay}
        addDuration={addDuration}
        addNotes={addNotes}
        addColor={addColor}
        saving={saving}
        onExpandToggle={(id) => setExpandedId((prev) => prev === id ? null : id)}
        onStartDrag={startDrag}
        onToggle={toggle}
        onDelete={remove}
        onSaveField={save}
        onOpenAdd={(day) => { setAddForm({ section: 'next_fortnight', day }); setAddDay(day ?? 0); setAddDuration(30) }}
        onAddTitle={setAddTitle}
        onAddDay={setAddDay}
        onAddDuration={setAddDuration}
        onAddNotes={setAddNotes}
        onAddColor={setAddColor}
        onAddItem={addItem}
        onCancelAdd={() => { setAddForm(null); setAddColor('') }}
      />
    </div>
    </>
  )
}

// ─── Block component ─────────────────────────────────────────────────────────
function Block({
  item,
  width = '100%',
  left = 0,
  style,
  expanded,
  dragging,
  onExpandToggle,
  onStartDrag,
  onToggle,
  onDelete,
  onSaveField,
}: {
  item: TodoItem
  width?: string | number
  left?: string | number
  style?: React.CSSProperties
  expanded: boolean
  dragging: boolean
  onExpandToggle: () => void
  onStartDrag: (e: React.MouseEvent, item: TodoItem, mode: 'move' | 'resize') => void
  onToggle: (item: TodoItem) => void
  onDelete: (id: string) => void
  onSaveField: (id: string, patch: Partial<TodoItem>) => Promise<void>
}) {
  const color = item.color ?? SECTION_COLORS[item.section]
  const [editNotes, setEditNotes] = useState(item.notes ?? '')

  const blockTop = style?.top
  const blockHeight = style?.height

  return (
    <div
      className="absolute select-none overflow-visible"
      style={{
        left,
        width,
        top: blockTop,
        height: blockHeight,
        zIndex: dragging ? 50 : expanded ? 40 : 1,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Main block */}
      <div
        className="absolute inset-0 rounded overflow-hidden flex flex-col"
        style={{
          backgroundColor: color + '22',
          border: `1px solid ${color}55`,
          borderLeft: item.origin === 'asana' ? '3px solid #f06a2a' : `1px solid ${color}55`,
          opacity: item.completed ? 0.45 : 1,
        }}
      >
        {/* Drag handle / header */}
        <div
          className="flex items-start gap-1 px-2 pt-1.5 pb-0.5 flex-1 min-h-0"
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={(e) => onStartDrag(e, item, 'move')}
          onClick={(e) => { e.stopPropagation(); onExpandToggle() }}
        >
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggle(item) }}
            className="mt-0.5 shrink-0"
          >
            {item.completed
              ? <CheckCircle2 className="h-3 w-3 text-green-500" />
              : <Circle className="h-3 w-3" style={{ color }} />
            }
          </button>
          <p
            className="flex-1 text-xs leading-tight font-medium truncate"
            style={{ color: item.completed ? '#888' : color }}
          >
            {item.title}
          </p>
          {item.origin === 'asana' && (
            <span className="shrink-0 text-[8px] font-bold leading-none px-0.5 py-0.5 rounded"
              style={{ color: '#f06a2a', background: '#f06a2a18' }}>A</span>
          )}
          {item.duration_minutes > 30 && (
            <span className="text-[10px] shrink-0" style={{ color: color + '88' }}>
              {item.duration_minutes >= 60
                ? `${item.duration_minutes / 60}h`
                : `${item.duration_minutes}m`}
            </span>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            height: RESIZE_HANDLE_H,
            cursor: 'ns-resize',
            opacity: 0.4,
          }}
          onMouseDown={(e) => { e.stopPropagation(); onStartDrag(e, item, 'resize') }}
        >
          <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: color }} />
        </div>
      </div>

      {/* Expanded panel — floats below the block */}
      {expanded && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-xl p-3 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium leading-snug" style={{ color }}>{item.title}</p>
          {item.scheduled_time && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatTime(item.scheduled_time)}
              {' · '}{item.duration_minutes}m
            </p>
          )}
          {item.scheduled_day !== null && (
            <p className="text-xs text-muted-foreground">
              {DAY_NAMES[item.scheduled_day ?? 0]}
              {item.duration_minutes > 30 ? ` — ${DAY_NAMES[Math.min(6, (item.scheduled_day ?? 0) + Math.round(item.duration_minutes / 30) - 1)]}` : ''}
            </p>
          )}
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onBlur={() => onSaveField(item.id, { notes: editNotes || null })}
            placeholder="Add notes…"
            rows={2}
            className="w-full resize-none rounded border border-border bg-muted px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/40"
          />
          {/* Category colour picker */}
          <div className="flex flex-wrap gap-1.5">
            {TODO_CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                title={cat.name}
                onClick={() => onSaveField(item.id, { color: item.color === cat.color ? null : cat.color })}
                className="h-4 w-4 rounded-full transition-transform hover:scale-125"
                style={{
                  backgroundColor: cat.color,
                  outline: item.color === cat.color ? `2px solid ${cat.color}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => onToggle(item)}
              className="text-xs text-muted-foreground hover:text-accent"
            >
              {item.completed ? 'Mark incomplete' : 'Mark done'}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Google Calendar read-only block ─────────────────────────────────────────
function GCalBlock({ event, style, left = 0, width = '100%' }: {
  event: CalendarEvent
  style: React.CSSProperties
  left?: number | string
  width?: number | string
}) {
  return (
    <a
      href={event.htmlLink}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute rounded overflow-hidden flex flex-col px-1.5 pt-0.5 hover:brightness-125 transition-all"
      style={{ left, width, ...style, backgroundColor: '#1a91ff18', border: '1px solid #1a91ff44', zIndex: 4 }}
      onClick={e => e.stopPropagation()}
      title={event.title}
    >
      <p className="text-[10px] font-medium truncate leading-tight" style={{ color: '#1a91ff' }}>
        {event.title}
      </p>
      {event.location && (style.height as number) >= SLOT_H * 2 && (
        <p className="text-[9px] truncate opacity-60" style={{ color: '#1a91ff' }}>{event.location}</p>
      )}
    </a>
  )
}

// ─── Today / Tomorrow Column ──────────────────────────────────────────────────
const TodayColumn = forwardRef<HTMLDivElement, {
  section?: 'today' | 'tomorrow'
  label?: string
  items: TodoItem[]
  googleEvents: CalendarEvent[]
  drag: DragState
  expandedId: string | null
  addForm: AddForm
  addTitle: string
  addTime: string
  addDuration: number
  addNotes: string
  addColor: string
  saving: boolean
  onExpandToggle: (id: string) => void
  onStartDrag: (e: React.MouseEvent, item: TodoItem, mode: 'move' | 'resize') => void
  onToggle: (item: TodoItem) => void
  onDelete: (id: string) => void
  onSaveField: (id: string, patch: Partial<TodoItem>) => Promise<void>
  onOpenAdd: (time?: string) => void
  onAddTitle: (v: string) => void
  onAddTime: (v: string) => void
  onAddDuration: (v: number) => void
  onAddNotes: (v: string) => void
  onAddColor: (v: string) => void
  onAddItem: () => void
  onCancelAdd: () => void
}>(function TodayColumn({
  section = 'today', label = 'Today',
  items, googleEvents, drag, expandedId, addForm, addTitle, addTime, addDuration, addNotes, addColor, saving,
  onExpandToggle, onStartDrag, onToggle, onDelete, onSaveField,
  onOpenAdd, onAddTitle, onAddTime, onAddDuration, onAddNotes, onAddColor, onAddItem, onCancelAdd,
}, ref) {
  const scheduled = items.filter((i) => i.scheduled_time)
  const unscheduled = items.filter((i) => !i.scheduled_time)
  const colMap = assignColumns(scheduled)
  const maxCols = Math.max(1, ...Array.from(colMap.values()).map((v) => v + 1))

  const TIME_LABEL_W = 44
  const GRID_W = 240

  return (
    <div className="flex-1 min-w-[280px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-[10px] text-muted-foreground">{scheduled.length} scheduled</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenAdd()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Unscheduled tray */}
      {unscheduled.length > 0 && (
        <div className="mb-3 space-y-1">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Unscheduled</p>
          {unscheduled.map((item) => (
            <div key={item.id} className="relative" style={{ height: SLOT_H }}>
              <Block
                item={item}
                style={{ top: 0, height: SLOT_H }}
                width="100%"
                expanded={expandedId === item.id}
                dragging={drag?.id === item.id}
                onExpandToggle={() => onExpandToggle(item.id)}
                onStartDrag={onStartDrag}
                onToggle={onToggle}
                onDelete={onDelete}
                onSaveField={onSaveField}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {addForm?.section === section && (
        <AddBlockForm
          title={addTitle}
          notes={addNotes}
          color={addColor}
          saving={saving}
          onTitle={onAddTitle}
          onNotes={onAddNotes}
          onColor={onAddColor}
          onSubmit={onAddItem}
          onCancel={onCancelAdd}
          extraFields={
            <div className="flex gap-2">
              <input
                type="time"
                value={addTime}
                onChange={(e) => onAddTime(e.target.value)}
                className="flex-1 rounded border border-border bg-muted px-2 py-1 text-xs outline-none"
              />
              <select
                value={addDuration}
                onChange={(e) => onAddDuration(Number(e.target.value))}
                className="rounded border border-border bg-muted px-2 py-1 text-xs outline-none"
              >
                {[30, 60, 90, 120, 180].map((d) => (
                  <option key={d} value={d}>{d < 60 ? `${d}m` : `${d / 60}h`}</option>
                ))}
              </select>
            </div>
          }
        />
      )}

      {/* Time grid */}
      <div ref={ref} className="relative flex overflow-y-auto" style={{ height: '70vh', maxHeight: 640 }}>
        {/* Time labels */}
        <div className="shrink-0 pr-2" style={{ width: TIME_LABEL_W }}>
          {Array.from({ length: TODAY_END - TODAY_START }).map((_, i) => {
            const h = TODAY_START + i
            const label = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
            return (
              <div
                key={h}
                className="text-[10px] text-muted-foreground/40 text-right"
                style={{ height: SLOT_H * 2, lineHeight: '1' }}
              >
                {label}
              </div>
            )
          })}
        </div>

        {/* Grid + blocks */}
        <div
          className="relative flex-1"
          style={{ height: TOTAL_TIME_SLOTS * SLOT_H }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            const relY = e.clientY - rect.top
            const time = topToTime(relY)
            onOpenAdd(time)
          }}
        >
          {/* Grid lines */}
          {Array.from({ length: TOTAL_TIME_SLOTS }).map((_, i) => (
            <div
              key={i}
              className={`absolute left-0 right-0 border-t ${i % 2 === 0 ? 'border-border/50' : 'border-border/20'}`}
              style={{ top: i * SLOT_H }}
            />
          ))}

          {/* Blocks */}
          {scheduled.map((item) => {
            const top = timeToTop(item.scheduled_time!)
            const height = Math.max(SLOT_H, (item.duration_minutes / 30) * SLOT_H)
            const col = colMap.get(item.id) ?? 0
            return (
              <Block
                key={item.id}
                item={item}
                style={{ top, height }}
                left={`${(col / maxCols) * 100}%`}
                width={`calc(${100 / maxCols}% - 2px)`}
                expanded={expandedId === item.id}
                dragging={drag?.id === item.id}
                onExpandToggle={() => onExpandToggle(item.id)}
                onStartDrag={onStartDrag}
                onToggle={onToggle}
                onDelete={onDelete}
                onSaveField={onSaveField}
              />
            )
          })}

          {/* Google Calendar events (read-only) */}
          {googleEvents.filter(e => !e.isAllDay).map((event) => {
            try {
              const startDate = parseISO(event.start)
              const endDate   = parseISO(event.end)
              const startMins = startDate.getHours() * 60 + startDate.getMinutes()
              const endMins   = endDate.getHours()   * 60 + endDate.getMinutes()
              const durMins   = Math.max(30, endMins - startMins)
              const top       = ((startMins - TODAY_START * 60) / 30) * SLOT_H
              const height    = Math.max(SLOT_H, (durMins / 30) * SLOT_H)
              if (top < 0 || top >= TOTAL_TIME_SLOTS * SLOT_H) return null
              return <GCalBlock key={event.id} event={event} style={{ top, height }} />
            } catch { return null }
          })}

          {/* Current time indicator — only relevant on Today */}
          {section === 'today' && <NowLine start={TODAY_START} />}
        </div>
      </div>

    </div>
  )
})

// ─── Week Column ──────────────────────────────────────────────────────────────
const WeekColumn = forwardRef<HTMLDivElement, {
  items: TodoItem[]
  googleEvents: CalendarEvent[]
  drag: DragState
  expandedId: string | null
  addForm: AddForm
  addTitle: string
  addDay: number
  addDuration: number
  addNotes: string
  addColor: string
  saving: boolean
  onExpandToggle: (id: string) => void
  onStartDrag: (e: React.MouseEvent, item: TodoItem, mode: 'move' | 'resize') => void
  onToggle: (item: TodoItem) => void
  onDelete: (id: string) => void
  onSaveField: (id: string, patch: Partial<TodoItem>) => Promise<void>
  onOpenAdd: (day?: number) => void
  onAddTitle: (v: string) => void
  onAddDay: (v: number) => void
  onAddDuration: (v: number) => void
  onAddNotes: (v: string) => void
  onAddColor: (v: string) => void
  onAddItem: () => void
  onCancelAdd: () => void
}>(function WeekColumn({
  items, googleEvents, drag, expandedId, addForm, addTitle, addDay, addDuration, addNotes, addColor, saving,
  onExpandToggle, onStartDrag, onToggle, onDelete, onSaveField,
  onOpenAdd, onAddTitle, onAddDay, onAddDuration, onAddNotes, onAddColor, onAddItem, onCancelAdd,
}, ref) {
  const DAY_LABEL_W = 280

  // Per-day column assignment — each row is independently laid out so a
  // crowded Monday doesn't make every other day row narrower too.
  const itemsByDay = new Map<number, TodoItem[]>()
  items.forEach(item => {
    const day = item.scheduled_day ?? 0
    if (!itemsByDay.has(day)) itemsByDay.set(day, [])
    itemsByDay.get(day)!.push(item)
  })
  const colMap = new Map<string, number>()
  const dayCountMap = new Map<string, number>()
  itemsByDay.forEach(dayItems => {
    dayItems.forEach((item, i) => {
      colMap.set(item.id, i)
      dayCountMap.set(item.id, dayItems.length)
    })
  })

  // Group Google events by day-of-week index (0=Mon … 6=Sun)
  const gcalByDay = new Map<number, CalendarEvent[]>()
  googleEvents.forEach(event => {
    try {
      const d = parseISO(event.start.slice(0, 10))
      const idx = (d.getDay() + 6) % 7
      if (!gcalByDay.has(idx)) gcalByDay.set(idx, [])
      gcalByDay.get(idx)!.push(event)
    } catch { /* skip unparseable */ }
  })

  // Expanded day popover
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  useEffect(() => {
    if (expandedDay === null) return
    const close = () => setExpandedDay(null)
    const timer = setTimeout(() => window.addEventListener('click', close), 0)
    return () => { clearTimeout(timer); window.removeEventListener('click', close) }
  }, [expandedDay])

  return (
    <div className="flex-[2] min-w-[480px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold">Next Fortnight</h2>
          <p className="text-[10px] text-muted-foreground">{items.length} items</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenAdd()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {addForm?.section === 'next_fortnight' && (
        <AddBlockForm
          title={addTitle}
          notes={addNotes}
          color={addColor}
          saving={saving}
          onTitle={onAddTitle}
          onNotes={onAddNotes}
          onColor={onAddColor}
          onSubmit={onAddItem}
          onCancel={onCancelAdd}
          extraFields={
            <div className="flex gap-2">
              <select
                value={addDay}
                onChange={(e) => onAddDay(Number(e.target.value))}
                className="flex-1 rounded border border-border bg-muted px-2 py-1 text-xs outline-none"
              >
                {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <select
                value={addDuration}
                onChange={(e) => onAddDuration(Number(e.target.value))}
                className="rounded border border-border bg-muted px-2 py-1 text-xs outline-none"
              >
                {[30, 60, 90].map((d) => (
                  <option key={d} value={d}>{d === 30 ? '1 day' : d === 60 ? '2 days' : '3 days'}</option>
                ))}
              </select>
            </div>
          }
        />
      )}

      <div ref={ref} className="relative flex">
        {/* Day labels + Google Calendar events */}
        <div className="shrink-0 pr-2 border-r border-border/20" style={{ width: DAY_LABEL_W }}>
          {DAY_NAMES.map((name, i) => {
            const dayEvents = gcalByDay.get(i) ?? []
            const hasMore   = dayEvents.length > 2
            const isOpen    = expandedDay === i
            return (
              <div
                key={name}
                className={`relative flex flex-col justify-center pl-1 pr-1 transition-colors ${dayEvents.length > 0 ? 'cursor-pointer hover:bg-muted/20' : ''}`}
                style={{ height: WEEK_ROW_H, borderBottom: '1px solid hsl(var(--border) / 0.2)' }}
                onClick={e => {
                  if (dayEvents.length === 0) return
                  e.stopPropagation()
                  setExpandedDay(isOpen ? null : i)
                }}
              >
                <span className="text-xs text-muted-foreground/50 font-semibold leading-none mb-1">{name}</span>
                {dayEvents.slice(0, 2).map(e => (
                  <a
                    key={e.id}
                    href={e.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs leading-tight truncate hover:underline"
                    style={{ color: '#1a91ffcc' }}
                    onClick={ev => ev.stopPropagation()}
                    title={e.title}
                  >
                    {e.title}
                  </a>
                ))}
                {hasMore && (
                  <span className="text-xs leading-none" style={{ color: '#1a91ff88' }}>
                    +{dayEvents.length - 2} more — click to expand
                  </span>
                )}

                {/* Floating popover with all events */}
                {isOpen && (
                  <div
                    className="absolute left-0 top-full z-50 w-64 rounded-lg border border-border bg-card shadow-xl py-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider border-b border-border/50">
                      {name} — {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                    </p>
                    {dayEvents.map(e => (
                      <a
                        key={e.id}
                        href={e.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col px-3 py-2 hover:bg-muted/40 transition-colors"
                      >
                        <span className="text-sm font-medium truncate" style={{ color: '#1a91ff' }}>
                          {e.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {e.isAllDay ? 'All day' : (() => {
                            try { return format(parseISO(e.start), 'HH:mm') + (e.end ? ' – ' + format(parseISO(e.end), 'HH:mm') : '') }
                            catch { return '' }
                          })()}
                        </span>
                        {e.location && (
                          <span className="text-xs text-muted-foreground/60 truncate">{e.location}</span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Grid + blocks */}
        <div
          className="relative flex-1"
          style={{ height: 7 * WEEK_ROW_H }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            const relY = e.clientY - rect.top
            const day = Math.floor(relY / WEEK_ROW_H)
            onOpenAdd(Math.min(6, Math.max(0, day)))
          }}
        >
          {/* Day grid lines */}
          {DAY_NAMES.map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-border/40"
              style={{ top: i * WEEK_ROW_H }}
            />
          ))}
          <div className="absolute left-0 right-0 border-t border-border/40" style={{ top: 7 * WEEK_ROW_H }} />

          {/* Blocks */}
          {items.map((item) => {
            const day = item.scheduled_day ?? 0
            const top = day * WEEK_ROW_H
            const span = Math.max(1, Math.round((item.duration_minutes ?? 30) / 30))
            const height = Math.max(WEEK_ROW_H, span * WEEK_ROW_H)
            const col = colMap.get(item.id) ?? 0
            const dayCount = dayCountMap.get(item.id) ?? 1
            return (
              <Block
                key={item.id}
                item={item}
                style={{ top, height }}
                left={`${(col / dayCount) * 100}%`}
                width={`calc(${100 / dayCount}% - 2px)`}
                expanded={expandedId === item.id}
                dragging={drag?.id === item.id}
                onExpandToggle={() => onExpandToggle(item.id)}
                onStartDrag={onStartDrag}
                onToggle={onToggle}
                onDelete={onDelete}
                onSaveField={onSaveField}
              />
            )
          })}
        </div>
      </div>

    </div>
  )
})

// ─── List Column (Next Two Months) ───────────────────────────────────────────
function ListColumn({
  label,
  section,
  items,
  expandedId,
  addForm,
  addTitle,
  addNotes,
  addColor,
  saving,
  onExpandToggle,
  onToggle,
  onDelete,
  onSaveField,
  onOpenAdd,
  onAddTitle,
  onAddNotes,
  onAddColor,
  onAddItem,
  onCancelAdd,
}: {
  label: string
  section: TodoSection
  items: TodoItem[]
  expandedId: string | null
  addForm: AddForm
  addTitle: string
  addNotes: string
  addColor: string
  saving: boolean
  onExpandToggle: (id: string) => void
  onToggle: (item: TodoItem) => void
  onDelete: (id: string) => void
  onSaveField: (id: string, patch: Partial<TodoItem>) => Promise<void>
  onOpenAdd: () => void
  onAddTitle: (v: string) => void
  onAddNotes: (v: string) => void
  onAddColor: (v: string) => void
  onAddItem: () => void
  onCancelAdd: () => void
}) {
  return (
    <div className="flex-1 min-w-[200px] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-[10px] text-muted-foreground">{items.filter((i) => !i.completed).length} active</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onOpenAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {addForm?.section === section && (
        <AddBlockForm
          title={addTitle}
          notes={addNotes}
          color={addColor}
          saving={saving}
          onTitle={onAddTitle}
          onNotes={onAddNotes}
          onColor={onAddColor}
          onSubmit={onAddItem}
          onCancel={onCancelAdd}
        />
      )}

      <div className="space-y-1">
        {items.map((item) => {
          const expanded = expandedId === item.id
          return (
            <div key={item.id} className="relative" style={{ height: SLOT_H }}>
              <Block
                item={item}
                style={{ top: 0, height: SLOT_H }}
                width="100%"
                expanded={expanded}
                dragging={false}
                onExpandToggle={() => onExpandToggle(item.id)}
                onStartDrag={() => {}}
                onToggle={onToggle}
                onDelete={onDelete}
                onSaveField={onSaveField}
              />
            </div>
          )
        })}

        {items.length === 0 && addForm?.section !== section && (
          <p className="text-xs text-muted-foreground/30 px-2 py-2">Nothing here yet.</p>
        )}
      </div>

    </div>
  )
}

// ─── Add Block Form ───────────────────────────────────────────────────────────
function AddBlockForm({
  title, notes, color, saving,
  onTitle, onNotes, onColor, onSubmit, onCancel,
  extraFields,
}: {
  title: string
  notes: string
  color: string
  saving: boolean
  onTitle: (v: string) => void
  onNotes: (v: string) => void
  onColor: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  extraFields?: React.ReactNode
}) {
  return (
    <div
      className="mt-2 rounded-lg border border-border bg-muted/20 p-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel() }}
        placeholder="Block title…"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
      />
      {extraFields}
      <input
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/30"
      />
      {/* Category colour picker */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {TODO_CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            title={cat.name}
            onClick={() => onColor(color === cat.color ? '' : cat.color)}
            className="h-4 w-4 rounded-full transition-transform hover:scale-125"
            style={{
              backgroundColor: cat.color,
              outline: color === cat.color ? `2px solid ${cat.color}` : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={!title.trim() || saving} className="flex-1 h-7 text-xs">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
      </div>
    </div>
  )
}

// ─── Now Line ─────────────────────────────────────────────────────────────────
function NowLine({ start }: { start: number }) {
  const [top, setTop] = useState<number | null>(null)
  useEffect(() => {
    const update = () => {
      const now = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      const t = ((mins - start * 60) / 30) * SLOT_H
      setTop(t)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [start])
  if (top === null || top < 0) return null
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="relative flex items-center">
        <div className="h-2 w-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 border-t-2 border-red-500/70" />
      </div>
    </div>
  )
}

