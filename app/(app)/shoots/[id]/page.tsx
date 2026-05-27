'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Loader2,
  Zap,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
} from 'lucide-react'
import Link from 'next/link'
import type { Shoot, ShotListItem, EquipmentItem, ShootType, ShootStatus, ShotStatus, EquipmentCategory } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = 'brief' | 'shots' | 'equipment'

const SHOT_STATUS_CYCLE: Record<ShotStatus, ShotStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

const SHOT_STATUS_ICON: Record<ShotStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground/40" />,
  in_progress: <Clock className="h-4 w-4 text-amber-400" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
}

const EQUIP_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  camera_body: 'Camera Bodies',
  lens: 'Lenses',
  lighting: 'Lighting',
  audio: 'Audio',
  tripod: 'Tripods & Support',
  accessory: 'Accessories',
  other: 'Other',
}

const EQUIP_CATEGORY_ORDER: EquipmentCategory[] = [
  'camera_body', 'lens', 'lighting', 'audio', 'tripod', 'accessory', 'other',
]

const STATUS_OPTIONS: ShootStatus[] = ['planning', 'confirmed', 'in_progress', 'completed', 'cancelled']
const STATUS_LABELS: Record<ShootStatus, string> = {
  planning: 'Planning',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShootDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [shoot, setShoot] = useState<Shoot | null>(null)
  const [shots, setShots] = useState<ShotListItem[]>([])
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [tab, setTab] = useState<Tab>('brief')
  const [loading, setLoading] = useState(true)
  const [savingBrief, setSavingBrief] = useState(false)

  // Brief form
  const [brief, setBrief] = useState({
    title: '', client: '', shoot_type: 'photo' as ShootType,
    status: 'planning' as ShootStatus, start_date: '', end_date: '',
    location: '', brief: '', deliverables: '', notes: '',
  })

  // Add shot form
  const [showAddShot, setShowAddShot] = useState(false)
  const [shotForm, setShotForm] = useState({ title: '', description: '', lens: '', lighting_notes: '', camera_notes: '' })
  const [addingShot, setAddingShot] = useState(false)
  const [expandedShot, setExpandedShot] = useState<string | null>(null)

  // Add equipment form
  const [showAddEquip, setShowAddEquip] = useState(false)
  const [equipForm, setEquipForm] = useState({ name: '', category: 'other' as EquipmentCategory })
  const [addingEquip, setAddingEquip] = useState(false)

  const supabase = createClient()

  const load = async () => {
    const [shootRes, shotsRes, equipRes] = await Promise.all([
      supabase.from('shoots').select('*').eq('id', id).single(),
      supabase.from('shot_list_items').select('*').eq('shoot_id', id).order('sort_order').order('created_at'),
      supabase.from('equipment_items').select('*').eq('shoot_id', id).order('category').order('sort_order').order('created_at'),
    ])

    if (shootRes.error || !shootRes.data) { router.push('/shoots'); return }

    const s = shootRes.data as Shoot
    setShoot(s)
    setBrief({
      title: s.title, client: s.client ?? '', shoot_type: s.shoot_type,
      status: s.status, start_date: s.start_date, end_date: s.end_date ?? '',
      location: s.location ?? '', brief: s.brief ?? '', deliverables: s.deliverables ?? '', notes: s.notes ?? '',
    })
    setShots((shotsRes.data as ShotListItem[]) ?? [])
    setEquipment((equipRes.data as EquipmentItem[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Brief save ──────────────────────────────────────────────────────────────

  const saveBrief = async () => {
    setSavingBrief(true)
    const res = await fetch(`/api/shoots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: brief.title.trim(),
        client: brief.client.trim() || null,
        shoot_type: brief.shoot_type,
        status: brief.status,
        start_date: brief.start_date,
        end_date: brief.end_date || null,
        location: brief.location.trim() || null,
        brief: brief.brief.trim() || null,
        deliverables: brief.deliverables.trim() || null,
        notes: brief.notes.trim() || null,
      }),
    })
    const data = await res.json()
    setShoot(data)
    setSavingBrief(false)
  }

  // ── Shots ───────────────────────────────────────────────────────────────────

  const addShot = async () => {
    if (!shotForm.title.trim()) return
    setAddingShot(true)
    const res = await fetch(`/api/shoots/${id}/shots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...shotForm, sort_order: shots.length }),
    })
    const data = await res.json()
    setShots((prev) => [...prev, data])
    setShotForm({ title: '', description: '', lens: '', lighting_notes: '', camera_notes: '' })
    setShowAddShot(false)
    setAddingShot(false)
  }

  const cycleShot = async (shot: ShotListItem) => {
    const next = SHOT_STATUS_CYCLE[shot.status]
    setShots((prev) => prev.map((s) => s.id === shot.id ? { ...s, status: next } : s))
    await fetch(`/api/shoots/${id}/shots/${shot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
  }

  const deleteShot = async (shotId: string) => {
    setShots((prev) => prev.filter((s) => s.id !== shotId))
    await fetch(`/api/shoots/${id}/shots/${shotId}`, { method: 'DELETE' })
  }

  // ── Equipment ───────────────────────────────────────────────────────────────

  const addEquipment = async () => {
    if (!equipForm.name.trim()) return
    setAddingEquip(true)
    const res = await fetch(`/api/shoots/${id}/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...equipForm, sort_order: equipment.length }),
    })
    const data = await res.json()
    setEquipment((prev) => [...prev, data])
    setEquipForm({ name: '', category: 'other' })
    setShowAddEquip(false)
    setAddingEquip(false)
  }

  const togglePacked = async (item: EquipmentItem) => {
    setEquipment((prev) => prev.map((e) => e.id === item.id ? { ...e, packed: !e.packed } : e))
    await fetch(`/api/shoots/${id}/equipment/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packed: !item.packed }),
    })
  }

  const deleteEquip = async (itemId: string) => {
    setEquipment((prev) => prev.filter((e) => e.id !== itemId))
    await fetch(`/api/shoots/${id}/equipment/${itemId}`, { method: 'DELETE' })
  }

  // ── Group equipment by category ─────────────────────────────────────────────
  const equipByCategory = EQUIP_CATEGORY_ORDER.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = equipment.filter((e) => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
  }
  if (!shoot) return null

  const shotsDone = shots.filter((s) => s.status === 'done').length
  const equipPacked = equipment.filter((e) => e.packed).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/shoots">
            <Button variant="ghost" size="icon-sm" className="mt-0.5">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{shoot.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {shoot.client && <span>{shoot.client}</span>}
              {shoot.start_date && (
                <span>
                  {shoot.end_date && shoot.end_date !== shoot.start_date
                    ? `${format(parseISO(shoot.start_date), 'MMM d')}–${format(parseISO(shoot.end_date), 'MMM d, yyyy')}`
                    : format(parseISO(shoot.start_date), 'MMM d, yyyy')}
                </span>
              )}
              {shoot.location && <span>· {shoot.location}</span>}
            </div>
          </div>
        </div>
        <Link href={`/shoots/${id}/mode`}>
          <Button size="sm" className="gap-1.5 shrink-0">
            <Zap className="h-3.5 w-3.5" />
            Shoot mode
          </Button>
        </Link>
      </div>

      {/* Progress pills */}
      {(shots.length > 0 || equipment.length > 0) && (
        <div className="flex gap-3 text-xs">
          {shots.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
              <Camera className="h-3 w-3 text-muted-foreground" />
              {shotsDone}/{shots.length} shots done
            </span>
          )}
          {equipment.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
              {equipPacked}/{equipment.length} packed
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['brief', 'shots', 'equipment'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors capitalize border-b-2 -mb-px ${
              tab === t
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'shots' ? `Shot list${shots.length ? ` (${shots.length})` : ''}` : t === 'equipment' ? `Equipment${equipment.length ? ` (${equipment.length})` : ''}` : 'Brief'}
          </button>
        ))}
      </div>

      {/* ── Brief tab ─────────────────────────────────────────────────────── */}
      {tab === 'brief' && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground">Title</label>
                <Input value={brief.title} onChange={(e) => setBrief((b) => ({ ...b, title: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Client</label>
                <Input value={brief.client} placeholder="Client name" onChange={(e) => setBrief((b) => ({ ...b, client: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Location</label>
                <Input value={brief.location} placeholder="Location" onChange={(e) => setBrief((b) => ({ ...b, location: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <select
                  value={brief.shoot_type}
                  onChange={(e) => setBrief((b) => ({ ...b, shoot_type: e.target.value as ShootType }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="photo">Photo</option>
                  <option value="video">Video</option>
                  <option value="mixed">Photo + Video</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Status</label>
                <select
                  value={brief.status}
                  onChange={(e) => setBrief((b) => ({ ...b, status: e.target.value as ShootStatus }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start date</label>
                <Input type="date" value={brief.start_date} onChange={(e) => setBrief((b) => ({ ...b, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End date</label>
                <Input type="date" value={brief.end_date} min={brief.start_date} onChange={(e) => setBrief((b) => ({ ...b, end_date: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground">Brief</label>
                <textarea
                  rows={4}
                  value={brief.brief}
                  placeholder="Describe the shoot, mood, references, style direction…"
                  onChange={(e) => setBrief((b) => ({ ...b, brief: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground">Deliverables</label>
                <textarea
                  rows={3}
                  value={brief.deliverables}
                  placeholder="What needs to be delivered, and by when…"
                  onChange={(e) => setBrief((b) => ({ ...b, deliverables: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground">Notes</label>
                <textarea
                  rows={2}
                  value={brief.notes}
                  placeholder="Anything else…"
                  onChange={(e) => setBrief((b) => ({ ...b, notes: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={savingBrief} onClick={saveBrief}>
                {savingBrief ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Shot list tab ─────────────────────────────────────────────────── */}
      {tab === 'shots' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddShot((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              Add shot
            </Button>
          </div>

          {/* Add shot form */}
          {showAddShot && (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New shot</p>
                <Input
                  placeholder="Shot title *"
                  value={shotForm.title}
                  onChange={(e) => setShotForm((f) => ({ ...f, title: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addShot() }}
                />
                <textarea
                  rows={2}
                  placeholder="Description"
                  value={shotForm.description}
                  onChange={(e) => setShotForm((f) => ({ ...f, description: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Lens (e.g. 85mm f/1.4)" value={shotForm.lens} onChange={(e) => setShotForm((f) => ({ ...f, lens: e.target.value }))} />
                  <Input placeholder="Lighting notes" value={shotForm.lighting_notes} onChange={(e) => setShotForm((f) => ({ ...f, lighting_notes: e.target.value }))} />
                  <Input placeholder="Camera notes" value={shotForm.camera_notes} onChange={(e) => setShotForm((f) => ({ ...f, camera_notes: e.target.value }))} className="col-span-2" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddShot(false)}>Cancel</Button>
                  <Button size="sm" disabled={!shotForm.title.trim() || addingShot} onClick={addShot}>
                    {addingShot ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {shots.length === 0 && !showAddShot && (
            <div className="py-10 text-center text-sm text-muted-foreground">No shots yet — add your first one above.</div>
          )}

          {shots.map((shot, i) => (
            <Card key={shot.id} className="overflow-hidden">
              <CardContent className="py-3">
                <div className="flex items-start gap-2">
                  <button onClick={() => cycleShot(shot)} className="mt-0.5 shrink-0 transition-transform hover:scale-110" title="Cycle status">
                    {SHOT_STATUS_ICON[shot.status]}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground/60 tabular-nums w-5 shrink-0">{i + 1}.</span>
                      <p className={`text-sm font-medium leading-snug ${shot.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                        {shot.title}
                      </p>
                    </div>

                    {expandedShot === shot.id && (
                      <div className="mt-2 ml-7 space-y-1.5 text-xs text-muted-foreground">
                        {shot.description && <p>{shot.description}</p>}
                        {shot.lens && <p><span className="text-foreground/60">Lens:</span> {shot.lens}</p>}
                        {shot.lighting_notes && <p><span className="text-foreground/60">Lighting:</span> {shot.lighting_notes}</p>}
                        {shot.camera_notes && <p><span className="text-foreground/60">Camera:</span> {shot.camera_notes}</p>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(shot.description || shot.lens || shot.lighting_notes || shot.camera_notes) && (
                      <button
                        onClick={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                        className="text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        {expandedShot === shot.id
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button onClick={() => deleteShot(shot.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Equipment tab ────────────────────────────────────────────────── */}
      {tab === 'equipment' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddEquip((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              Add item
            </Button>
          </div>

          {/* Add equipment form */}
          {showAddEquip && (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New item</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Item name *"
                    value={equipForm.name}
                    onChange={(e) => setEquipForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addEquipment() }}
                    className="flex-1"
                  />
                  <select
                    value={equipForm.category}
                    onChange={(e) => setEquipForm((f) => ({ ...f, category: e.target.value as EquipmentCategory }))}
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {EQUIP_CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>{EQUIP_CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddEquip(false)}>Cancel</Button>
                  <Button size="sm" disabled={!equipForm.name.trim() || addingEquip} onClick={addEquipment}>
                    {addingEquip ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {equipment.length === 0 && !showAddEquip && (
            <div className="py-10 text-center text-sm text-muted-foreground">No equipment added yet.</div>
          )}

          {Object.entries(equipByCategory).map(([cat, items]) => {
            const packedCount = items.filter((i) => i.packed).length
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {EQUIP_CATEGORY_LABELS[cat as EquipmentCategory]}
                  </p>
                  <span className="text-xs text-muted-foreground/60">{packedCount}/{items.length} packed</span>
                </div>
                {items.map((item) => (
                  <Card key={item.id} className={item.packed ? 'opacity-60' : ''}>
                    <CardContent className="py-2.5">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.packed}
                          onChange={() => togglePacked(item)}
                          className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                        />
                        <span className={`flex-1 text-sm ${item.packed ? 'line-through text-muted-foreground' : ''}`}>
                          {item.name}
                        </span>
                        <button onClick={() => deleteEquip(item.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
