'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format, isPast, parseISO } from 'date-fns'
import {
  Camera,
  Plus,
  ChevronDown,
  ChevronUp,
  MapPin,
  CalendarDays,
  Zap,
  Loader2,
  Trash2,
  Sparkles,
  X,
  Check,
  Video,
  ImageIcon,
} from 'lucide-react'
import Link from 'next/link'
import type { Shoot, ShootType, ShootStatus } from '@/types'
import type { ShootProposal } from '@/app/api/ai/import-shoots/route'

const TYPE_LABELS: Record<ShootType, string> = {
  photo: 'Photo',
  video: 'Video',
  mixed: 'Photo + Video',
}

const STATUS_COLORS: Record<ShootStatus, string> = {
  planning: 'bg-amber-500/15 text-amber-400',
  confirmed: 'bg-blue-500/15 text-blue-400',
  in_progress: 'bg-accent/15 text-accent',
  completed: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-destructive/15 text-destructive',
}

const STATUS_LABELS: Record<ShootStatus, string> = {
  planning: 'Planning',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function formatDateRange(start: string, end: string | null) {
  const s = parseISO(start)
  if (!end || end === start) return format(s, 'MMM d, yyyy')
  const e = parseISO(end)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${format(s, 'MMM d')}–${format(e, 'd, yyyy')}`
  }
  return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
}

export default function ShootsPage() {
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [proposals, setProposals] = useState<ShootProposal[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    client: '',
    shoot_type: 'photo' as ShootType,
    start_date: '',
    end_date: '',
    location: '',
  })

  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase.from('shoots').select('*').order('start_date')
    setShoots((data as Shoot[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createShoot = async () => {
    if (!form.title.trim() || !form.start_date) return
    setSaving(true)
    const res = await fetch('/api/shoots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        client: form.client.trim() || null,
        shoot_type: form.shoot_type,
        start_date: form.start_date,
        end_date: form.end_date || null,
        location: form.location.trim() || null,
      }),
    })
    const data = await res.json()
    setShoots((prev) => [...prev, data].sort((a, b) => a.start_date.localeCompare(b.start_date)))
    setForm({ title: '', client: '', shoot_type: 'photo', start_date: '', end_date: '', location: '' })
    setShowNew(false)
    setSaving(false)
  }

  const deleteShoot = async (id: string) => {
    if (!confirm('Delete this shoot and all its shots and equipment?')) return
    setShoots((prev) => prev.filter((s) => s.id !== id))
    await fetch(`/api/shoots/${id}`, { method: 'DELETE' })
  }

  const fetchProposals = async () => {
    setImportLoading(true)
    const res = await fetch('/api/ai/import-shoots', { method: 'POST' })
    const data = await res.json()
    const list: ShootProposal[] = data.proposals ?? []
    setProposals(list)
    setSelectedIds(new Set(list.map((p) => p.task_id)))
    setImportOpen(true)
    setImportLoading(false)
  }

  const confirmImport = async () => {
    setImporting(true)
    const toCreate = proposals.filter((p) => selectedIds.has(p.task_id))
    await Promise.all(
      toCreate.map((p) =>
        fetch('/api/shoots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: p.title,
            client: p.client,
            shoot_type: p.shoot_type,
            start_date: p.start_date,
            end_date: p.end_date,
            location: p.location,
            brief: p.brief,
          }),
        })
      )
    )
    setImportOpen(false)
    setProposals([])
    setSelectedIds(new Set())
    setImporting(false)
    await load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = shoots.filter((s) => s.start_date >= today || s.status === 'in_progress')
  const past = shoots.filter((s) => s.start_date < today && s.status !== 'in_progress')

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shoots</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan and manage your photo and video shoots.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={fetchProposals}
            disabled={importLoading}
          >
            {importLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />}
            Import from tasks
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowNew((v) => !v)}>
            <Plus className="h-4 w-4" />
            New shoot
          </Button>
        </div>
      </div>

      {/* New shoot form */}
      {showNew && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-medium">New Shoot</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Shoot title *"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="col-span-2"
              />
              <Input
                placeholder="Client"
                value={form.client}
                onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
              />
              <select
                value={form.shoot_type}
                onChange={(e) => setForm((f) => ({ ...f, shoot_type: e.target.value as ShootType }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="photo">Photo</option>
                <option value="video">Video</option>
                <option value="mixed">Photo + Video</option>
              </select>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start date *</label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End date</label>
                <Input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="col-span-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" disabled={!form.title.trim() || !form.start_date || saving} onClick={createShoot}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create shoot'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : shoots.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Camera className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No shoots yet. Create one above.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Upcoming</p>
              {upcoming.map((shoot) => (
                <ShootCard key={shoot.id} shoot={shoot} onDelete={deleteShoot} />
              ))}
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPast ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Past ({past.length})
              </button>
              {showPast && past.map((shoot) => (
                <ShootCard key={shoot.id} shoot={shoot} onDelete={deleteShoot} />
              ))}
            </div>
          )}
        </>
      )}
      {/* ── Import from Tasks modal ──────────────────────────────────────── */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <p className="font-semibold">Import shoots from tasks</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {proposals.length === 0
                    ? 'No shoot tasks found in your active task list.'
                    : `${proposals.length} shoot${proposals.length !== 1 ? 's' : ''} identified — select which to create`}
                </p>
              </div>
              <button
                onClick={() => setImportOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Select all / none */}
            {proposals.length > 0 && (
              <div className="flex items-center gap-3 px-5 py-2 border-b border-border shrink-0">
                <button
                  onClick={() => setSelectedIds(new Set(proposals.map((p) => p.task_id)))}
                  className="text-xs text-accent hover:underline"
                >
                  Select all
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  None
                </button>
                <span className="ml-auto text-xs text-muted-foreground">{selectedIds.size} selected</span>
              </div>
            )}

            {/* Proposal list */}
            <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2">
              {proposals.length === 0 ? (
                <div className="py-10 text-center">
                  <Camera className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No shoot tasks found.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Tasks with shoot/film/record keywords will appear here.</p>
                </div>
              ) : proposals.map((p) => {
                const selected = selectedIds.has(p.task_id)
                return (
                  <button
                    key={p.task_id}
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(p.task_id)) next.delete(p.task_id)
                      else next.add(p.task_id)
                      return next
                    })}
                    className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      selected
                        ? 'border-accent/40 bg-accent/5'
                        : 'border-border bg-card/50 hover:bg-muted/20'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                      selected ? 'bg-accent border-accent' : 'border-muted-foreground/30'
                    }`}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium leading-snug">{p.title}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p.shoot_type === 'photo'
                            ? 'bg-blue-500/10 text-blue-400'
                            : p.shoot_type === 'video'
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {p.shoot_type === 'photo'
                            ? <><ImageIcon className="h-2.5 w-2.5" /> Photo</>
                            : p.shoot_type === 'video'
                            ? <><Video className="h-2.5 w-2.5" /> Video</>
                            : <><Camera className="h-2.5 w-2.5" /> Mixed</>}
                        </span>
                      </div>
                      {p.client && (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.client}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {p.start_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {p.end_date && p.end_date !== p.start_date
                              ? `${format(parseISO(p.start_date), 'MMM d')}–${format(parseISO(p.end_date), 'MMM d')}`
                              : format(parseISO(p.start_date), 'MMM d, yyyy')}
                          </span>
                        )}
                        {p.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {p.location}
                          </span>
                        )}
                      </div>
                      {p.brief && (
                        <p className="mt-1 text-xs text-muted-foreground/70 leading-snug line-clamp-2">{p.brief}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/40 truncate">From: {p.task_title}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            {proposals.length > 0 && (
              <div className="px-5 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={selectedIds.size === 0 || importing}
                  onClick={confirmImport}
                >
                  {importing
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Plus className="h-3.5 w-3.5" />}
                  Create {selectedIds.size} shoot{selectedIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ShootCard({ shoot, onDelete }: { shoot: Shoot; onDelete: (id: string) => void }) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[shoot.status]}`}>
                {STATUS_LABELS[shoot.status]}
              </span>
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{TYPE_LABELS[shoot.shoot_type]}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium leading-snug">{shoot.title}</p>
            {shoot.client && (
              <p className="mt-0.5 text-xs text-muted-foreground">{shoot.client}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatDateRange(shoot.start_date, shoot.end_date)}
              </span>
              {shoot.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {shoot.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href={`/shoots/${shoot.id}/mode`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Zap className="h-3 w-3" />
                Shoot
              </Button>
            </Link>
            <Link href={`/shoots/${shoot.id}`}>
              <Button size="sm" className="text-xs">Plan</Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground/50 hover:text-destructive"
              onClick={() => onDelete(shoot.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
