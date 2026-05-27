'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  Camera,
  Timer,
} from 'lucide-react'
import Link from 'next/link'
import type { Shoot, ShotListItem, EquipmentItem, ShotStatus, EquipmentCategory } from '@/types'
import { ShootDayTimer } from '@/components/shoots/ShootDayTimer'

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

export default function ShootModePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [shoot, setShoot] = useState<Shoot | null>(null)
  const [shots, setShots] = useState<ShotListItem[]>([])
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'shots' | 'equipment' | 'hours'>('shots')

  const supabase = createClient()

  const load = async () => {
    const [shootRes, shotsRes, equipRes] = await Promise.all([
      supabase.from('shoots').select('*').eq('id', id).single(),
      supabase.from('shot_list_items').select('*').eq('shoot_id', id).order('sort_order').order('created_at'),
      supabase.from('equipment_items').select('*').eq('shoot_id', id).order('category').order('sort_order').order('created_at'),
    ])
    if (shootRes.error || !shootRes.data) { router.push('/shoots'); return }
    setShoot(shootRes.data as Shoot)
    setShots((shotsRes.data as ShotListItem[]) ?? [])
    setEquipment((equipRes.data as EquipmentItem[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleShot = async (shot: ShotListItem) => {
    const next: ShotStatus = shot.status === 'done' ? 'pending' : 'done'
    setShots((prev) => prev.map((s) => s.id === shot.id ? { ...s, status: next } : s))
    await fetch(`/api/shoots/${id}/shots/${shot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
  }

  const togglePacked = async (item: EquipmentItem) => {
    setEquipment((prev) => prev.map((e) => e.id === item.id ? { ...e, packed: !e.packed } : e))
    await fetch(`/api/shoots/${id}/equipment/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packed: !item.packed }),
    })
  }

  const equipByCategory = EQUIP_CATEGORY_ORDER.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = equipment.filter((e) => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (!shoot) return null

  const shotsDone = shots.filter((s) => s.status === 'done').length
  const equipPacked = equipment.filter((e) => e.packed).length
  const shotsProgress = shots.length ? Math.round((shotsDone / shots.length) * 100) : 0
  const equipProgress = equipment.length ? Math.round((equipPacked / equipment.length) * 100) : 0

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={`/shoots/${id}`}>
              <button className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </Link>
            <div>
              <p className="text-base font-semibold leading-tight">{shoot.title}</p>
              {shoot.start_date && (
                <p className="text-xs text-muted-foreground">
                  {shoot.end_date && shoot.end_date !== shoot.start_date
                    ? `${format(parseISO(shoot.start_date), 'MMM d')}–${format(parseISO(shoot.end_date), 'MMM d')}`
                    : format(parseISO(shoot.start_date), 'EEE, MMM d')}
                  {shoot.location ? ` · ${shoot.location}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Progress bars */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={() => setSection('shots')} className="text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Camera className="h-3 w-3" /> Shots
              </span>
              <span className="text-xs font-medium">{shotsDone}/{shots.length}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${shotsProgress === 100 ? 'bg-emerald-500' : 'bg-accent'}`}
                style={{ width: `${shotsProgress}%` }}
              />
            </div>
          </button>
          <button onClick={() => setSection('equipment')} className="text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Package className="h-3 w-3" /> Equipment
              </span>
              <span className="text-xs font-medium">{equipPacked}/{equipment.length}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${equipProgress === 100 ? 'bg-emerald-500' : 'bg-accent'}`}
                style={{ width: `${equipProgress}%` }}
              />
            </div>
          </button>
        </div>

        {/* Section toggle */}
        <div className="mt-3 flex gap-1">
          {([
            { key: 'shots',     label: 'Shot list',  icon: Camera },
            { key: 'equipment', label: 'Equipment',  icon: Package },
            { key: 'hours',     label: 'Hours',      icon: Timer },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                section === key ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Shot list ─────────────────────────────────────────────────────── */}
      {section === 'shots' && (
        <div className="px-4 pt-4 space-y-2">
          {shots.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No shots on this shoot.</p>
          )}
          {shots.map((shot, i) => (
            <button
              key={shot.id}
              onClick={() => toggleShot(shot)}
              className={`w-full flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all active:scale-[0.98] ${
                shot.status === 'done'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-border bg-card hover:bg-muted/30'
              }`}
            >
              <div className="shrink-0">
                {shot.status === 'done'
                  ? <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  : shot.status === 'in_progress'
                  ? <Clock className="h-6 w-6 text-amber-400" />
                  : <Circle className="h-6 w-6 text-muted-foreground/30" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground/50 tabular-nums">{i + 1}.</span>
                  <span className={`text-base font-medium leading-snug ${shot.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {shot.title}
                  </span>
                </div>
                {(shot.lens || shot.lighting_notes) && (
                  <div className="mt-0.5 ml-5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {shot.lens && <span>{shot.lens}</span>}
                    {shot.lighting_notes && <span>{shot.lighting_notes}</span>}
                  </div>
                )}
              </div>
            </button>
          ))}

          {shotsDone === shots.length && shots.length > 0 && (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-400">All shots done!</p>
            </div>
          )}
        </div>
      )}

      {/* ── Equipment ────────────────────────────────────────────────────── */}
      {section === 'equipment' && (
        <div className="px-4 pt-4 space-y-4">
          {equipment.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No equipment on this shoot.</p>
          )}
          {Object.entries(equipByCategory).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                {EQUIP_CATEGORY_LABELS[cat as EquipmentCategory]}
              </p>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => togglePacked(item)}
                  className={`w-full flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
                    item.packed
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-border bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className="shrink-0">
                    {item.packed
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      : <Circle className="h-5 w-5 text-muted-foreground/30" />}
                  </div>
                  <span className={`text-base ${item.packed ? 'line-through text-muted-foreground' : ''}`}>
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {equipPacked === equipment.length && equipment.length > 0 && (
            <div className="py-6 text-center">
              <Package className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-400">All packed!</p>
            </div>
          )}
        </div>
      )}

      {/* ── Hours tracker ─────────────────────────────────────────────────── */}
      {section === 'hours' && <ShootDayTimer shootId={id} />}
    </div>
  )
}
