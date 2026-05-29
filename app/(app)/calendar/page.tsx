'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isToday, parseISO,
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2,
  Settings2, Trash2, Check, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Brand, ContentItem, ContentStatus, ContentPlatform } from '@/types'
import type { CalendarEvent } from '@/app/api/google/calendar/route'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS: { value: ContentPlatform; label: string; short: string }[] = [
  { value: 'youtube',          label: 'YouTube',          short: 'YT'    },
  { value: 'instagram_reels',  label: 'Instagram Reels',  short: 'Reels' },
  { value: 'tiktok',           label: 'TikTok',           short: 'TK'    },
  { value: 'instagram_post',   label: 'Instagram Post',   short: 'IG'    },
  { value: 'other',            label: 'Other',            short: '—'     },
]

const STATUSES: { value: ContentStatus; label: string }[] = [
  { value: 'idea',       label: 'Idea'       },
  { value: 'scripting',  label: 'Scripting'  },
  { value: 'filming',    label: 'Filming'    },
  { value: 'editing',    label: 'Editing'    },
  { value: 'scheduled',  label: 'Scheduled'  },
  { value: 'published',  label: 'Published'  },
  { value: 'cancelled',  label: 'Cancelled'  },
]

const STATUS_DOT: Record<ContentStatus, string> = {
  idea:       'bg-muted-foreground/40',
  scripting:  'bg-amber-400',
  filming:    'bg-blue-400',
  editing:    'bg-purple-400',
  scheduled:  'bg-accent',
  published:  'bg-emerald-400',
  cancelled:  'bg-red-400/40',
}

const BRAND_PRESETS = [
  '#1a91ff', '#f43f5e', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#06b6d4', '#84cc16',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCalendarDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end   = endOfWeek(endOfMonth(month),     { weekStartsOn: 1 })
  const days: Date[] = []
  let cur = start
  while (cur <= end) { days.push(cur); cur = addDays(cur, 1) }
  return days
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function blankForm(publishDate = '') {
  return {
    title: '', platform: 'youtube' as ContentPlatform, brand_id: '',
    status: 'idea' as ContentStatus,
    shoot_date: '', edit_date: '', publish_date: publishDate, notes: '',
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [brands, setBrands] = useState<Brand[]>([])
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBrand, setFilterBrand] = useState<string | null>(null)

  // Create / edit modal
  const [modal, setModal] = useState<'closed' | 'create' | 'edit'>('closed')
  const [editItem, setEditItem] = useState<ContentItem | null>(null)
  const [form, setForm] = useState(blankForm())
  const [saving, setSaving] = useState(false)

  // Brands panel
  const [showBrands, setShowBrands] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandColor, setNewBrandColor] = useState('#1a91ff')
  const [savingBrand, setSavingBrand] = useState(false)

  // Google Calendar events overlay
  const [gcalEvents, setGcalEvents] = useState<CalendarEvent[]>([])
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalError, setGcalError] = useState(false)
  const [showGcal, setShowGcal] = useState(true)

  // Publish tasks from Asana
  const [publishTasks, setPublishTasks] = useState<{ id: string; title: string; parent_task_title: string | null; due_date: string }[]>([])

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async (month: Date) => {
    setLoading(true)
    const from = format(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const to   = format(endOfWeek(endOfMonth(month),     { weekStartsOn: 1 }), 'yyyy-MM-dd')

    // Work out how many days the visible grid spans so we fetch the right range
    const daysDiff = Math.ceil(
      (endOfWeek(endOfMonth(month), { weekStartsOn: 1 }).getTime() -
       startOfWeek(startOfMonth(month), { weekStartsOn: 1 }).getTime()) /
      (1000 * 60 * 60 * 24)
    ) + 1

    const [brandsRes, itemsRes] = await Promise.all([
      fetch('/api/brands').then((r) => r.json()),
      fetch(`/api/content?from=${from}&to=${to}`).then((r) => r.json()),
    ])
    setBrands(brandsRes ?? [])
    setItems(itemsRes ?? [])
    setLoading(false)

    // Fetch publish tasks (directly from Asana project) and Google Calendar events
    Promise.all([
      fetch(`/api/asana/publish-tasks?from=${from}&to=${to}`).then((r) => r.json()),
      fetch('/api/google/status').then((r) => r.json()),
    ]).then(async ([publishData, statusData]) => {
      setPublishTasks(Array.isArray(publishData) ? publishData : [])
      setGcalConnected(statusData.connected)
      setGcalError(false)
      if (!statusData.connected) return
      try {
        const r = await fetch(`/api/google/calendar?from=${from}&days=${daysDiff}`)
        const data = await r.json()
        if (data.error) { setGcalError(true); return }
        setGcalEvents(data.events ?? [])
      } catch {
        setGcalError(true)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { load(currentMonth) }, [currentMonth, load])

  const changeMonth = (dir: 1 | -1) => {
    setCurrentMonth((m) => dir === 1 ? addMonths(m, 1) : subMonths(m, 1))
  }

  // ── Modal helpers ───────────────────────────────────────────────────────────
  const openCreate = (date?: Date) => {
    setEditItem(null)
    setForm(blankForm(date ? format(date, 'yyyy-MM-dd') : ''))
    setModal('create')
  }

  const openEdit = (item: ContentItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditItem(item)
    setForm({
      title: item.title, platform: item.platform, brand_id: item.brand_id ?? '',
      status: item.status, shoot_date: item.shoot_date ?? '', edit_date: item.edit_date ?? '',
      publish_date: item.publish_date ?? '', notes: item.notes ?? '',
    })
    setModal('edit')
  }

  const closeModal = () => { setModal('closed'); setEditItem(null) }

  // ── Save content ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const body = {
      ...form,
      brand_id:     form.brand_id || null,
      shoot_date:   form.shoot_date || null,
      edit_date:    form.edit_date  || null,
      publish_date: form.publish_date || null,
      notes:        form.notes || null,
    }

    if (modal === 'create') {
      const res = await fetch('/api/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      setItems((prev) => [...prev, data].sort((a, b) => (a.publish_date ?? '').localeCompare(b.publish_date ?? '')))
    } else if (editItem) {
      const res = await fetch(`/api/content/${editItem.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      setItems((prev) => prev.map((i) => i.id === editItem.id ? data : i))
    }
    setSaving(false)
    closeModal()
  }

  const deleteItem = async () => {
    if (!editItem) return
    setItems((prev) => prev.filter((i) => i.id !== editItem.id))
    closeModal()
    await fetch(`/api/content/${editItem.id}`, { method: 'DELETE' })
  }

  // ── Brands ──────────────────────────────────────────────────────────────────
  const addBrand = async () => {
    if (!newBrandName.trim()) return
    setSavingBrand(true)
    const res = await fetch('/api/brands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBrandName.trim(), color: newBrandColor }),
    })
    const data = await res.json()
    setBrands((prev) => [...prev, data])
    setNewBrandName('')
    setNewBrandColor('#1a91ff')
    setSavingBrand(false)
  }

  const deleteBrand = async (id: string) => {
    setBrands((prev) => prev.filter((b) => b.id !== id))
    if (filterBrand === id) setFilterBrand(null)
    await fetch(`/api/brands/${id}`, { method: 'DELETE' })
  }

  // ── Calendar data ────────────────────────────────────────────────────────────
  const days = getCalendarDays(currentMonth)
  const visibleItems = filterBrand ? items.filter((i) => i.brand_id === filterBrand) : items
  const itemsByDate = visibleItems.reduce<Record<string, ContentItem[]>>((acc, item) => {
    if (item.publish_date) {
      acc[item.publish_date] = [...(acc[item.publish_date] ?? []), item]
    }
    return acc
  }, {})

  const gcalByDate = gcalEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const dateStr = event.start.slice(0, 10)
    acc[dateStr] = [...(acc[dateStr] ?? []), event]
    return acc
  }, {})

  const publishByDate = publishTasks.reduce<Record<string, typeof publishTasks>>((acc, task) => {
    if (task.due_date) acc[task.due_date] = [...(acc[task.due_date] ?? []), task]
    return acc
  }, {})

  const brandMap = Object.fromEntries(brands.map((b) => [b.id, b]))

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => changeMonth(-1)} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold tracking-tight w-40 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h1>
          <button onClick={() => changeMonth(1)} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-xs text-muted-foreground">
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {gcalConnected && gcalError && (
            <a
              href="/api/auth/google"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              title="Google Calendar failed to load — click to reconnect"
            >
              ⚠ Reconnect Google
            </a>
          )}
          {gcalConnected && !gcalError && (
            <button
              onClick={() => setShowGcal((v) => !v)}
              title={showGcal ? 'Hide Google Calendar' : 'Show Google Calendar'}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                showGcal
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              GCal
            </button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setShowBrands((v) => !v)} title="Manage brands">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            Add content
          </Button>
        </div>
      </div>

      {/* Brand filters */}
      {brands.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterBrand(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !filterBrand ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All brands
          </button>
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => setFilterBrand(filterBrand === brand.id ? null : brand.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80"
              style={{
                background: hexToRgba(brand.color, filterBrand === brand.id ? 0.2 : 0.1),
                color: brand.color,
                border: `1px solid ${hexToRgba(brand.color, 0.3)}`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: brand.color }} />
              {brand.name}
            </button>
          ))}
        </div>
      )}

      {/* Brands management panel */}
      {showBrands && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Manage Brands</p>
            <button onClick={() => setShowBrands(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {brands.map((brand) => (
            <div key={brand.id} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: brand.color }} />
              <span className="flex-1 text-sm">{brand.name}</span>
              <button onClick={() => deleteBrand(brand.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <div className="flex gap-2 pt-1 border-t border-border/50">
            <Input
              placeholder="Brand name"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addBrand() }}
              className="flex-1 h-8 text-sm"
            />
            <div className="flex items-center gap-1">
              {BRAND_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewBrandColor(c)}
                  className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                  style={{ background: c, outline: newBrandColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
            <Button size="sm" disabled={!newBrandName.trim() || savingBrand} onClick={addBrand} className="h-8">
              {savingBrand ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal !== 'closed' && (
        <ContentModal
          mode={modal}
          form={form}
          brands={brands}
          saving={saving}
          onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
          onSave={save}
          onDelete={modal === 'edit' ? deleteItem : undefined}
          onClose={closeModal}
        />
      )}

      {/* Calendar grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dateStr    = format(day, 'yyyy-MM-dd')
              const dayItems   = itemsByDate[dateStr]   ?? []
              const dayGcal    = showGcal ? (gcalByDate[dateStr] ?? []) : []
              const dayPublish = publishByDate[dateStr] ?? []
              const inMonth    = isSameMonth(day, currentMonth)
              const today      = isToday(day)
              const isLastRow  = idx >= days.length - 7
              const totalChips = dayGcal.length + dayItems.length + dayPublish.length

              return (
                <div
                  key={dateStr}
                  onClick={() => openCreate(day)}
                  className={`
                    min-h-[90px] p-1.5 cursor-pointer transition-colors
                    ${idx % 7 !== 6 ? 'border-r' : ''} border-border/50
                    ${!isLastRow ? 'border-b' : ''} border-border/50
                    ${inMonth ? 'hover:bg-muted/20' : 'opacity-40'}
                  `}
                >
                  {/* Day number */}
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`
                        inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                        ${today
                          ? 'bg-accent text-white'
                          : inMonth ? 'text-foreground' : 'text-muted-foreground'}
                      `}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Chips: Google Calendar → publish tasks → content items */}
                  <div className="space-y-0.5">
                    {/* Google Calendar events — indigo, read-only */}
                    {dayGcal.slice(0, 3).map((event) => {
                      const timeStr = event.isAllDay
                        ? null
                        : (() => { try { return format(parseISO(event.start), 'h:mma') } catch { return null } })()
                      return (
                        <a
                          key={event.id}
                          href={event.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
                        >
                          <CalendarDays className="h-2.5 w-2.5 shrink-0 text-indigo-400" />
                          <span className="truncate text-[10px] font-medium leading-tight text-indigo-400">
                            {timeStr ? `${timeStr} ` : ''}{event.title}
                          </span>
                        </a>
                      )
                    })}

                    {/* Publish tasks from Asana — amber, show parent task name */}
                    {dayPublish.slice(0, Math.max(0, 3 - dayGcal.length)).map((task) => {
                      const label = task.parent_task_title ?? task.title
                      return (
                        <div
                          key={task.id}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5"
                          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          <span className="truncate text-[10px] font-medium leading-tight text-amber-400">
                            {label}
                          </span>
                        </div>
                      )
                    })}

                    {/* Content items */}
                    {dayItems.slice(0, Math.max(0, 3 - dayGcal.length - dayPublish.length)).map((item) => {
                      const brand = item.brand_id ? brandMap[item.brand_id] : null
                      const color = brand?.color ?? '#838fa8'
                      return (
                        <button
                          key={item.id}
                          onClick={(e) => openEdit(item, e)}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-opacity hover:opacity-80"
                          style={{ background: hexToRgba(color, 0.12), border: `1px solid ${hexToRgba(color, 0.25)}` }}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
                          <span
                            className="truncate text-[10px] font-medium leading-tight"
                            style={{ color }}
                          >
                            {item.title}
                          </span>
                        </button>
                      )
                    })}

                    {totalChips > 3 && (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{totalChips - 3} more
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Create / Edit Modal ─────────────────────────────────────────────────────

function ContentModal({
  mode, form, brands, saving,
  onChange, onSave, onDelete, onClose,
}: {
  mode: 'create' | 'edit'
  form: ReturnType<typeof blankForm>
  brands: Brand[]
  saving: boolean
  onChange: (updates: Partial<ReturnType<typeof blankForm>>) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div
        ref={ref}
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-sm font-semibold">{mode === 'create' ? 'New content' : 'Edit content'}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3">
          <Input
            placeholder="Title *"
            value={form.title}
            onChange={(e) => onChange({ title: e.target.value })}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => onChange({ platform: e.target.value as ContentPlatform })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Brand</label>
              <select
                value={form.brand_id}
                onChange={(e) => onChange({ brand_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">No brand</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => onChange({ status: e.target.value as ContentStatus })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Publish date</label>
              <Input type="date" value={form.publish_date} onChange={(e) => onChange({ publish_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Shoot date</label>
              <Input type="date" value={form.shoot_date} onChange={(e) => onChange({ shoot_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Edit date</label>
              <Input type="date" value={form.edit_date} onChange={(e) => onChange({ edit_date: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              placeholder="Concept, references, links…"
              onChange={(e) => onChange({ notes: e.target.value })}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div>
            {mode === 'edit' && onDelete && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!form.title.trim() || saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3.5 w-3.5" /> Save</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

