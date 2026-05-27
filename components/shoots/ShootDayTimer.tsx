'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import {
  Play, Square, Coffee, Pencil, Trash2, Check, X, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── overtime rules ───────────────────────────────────────────────────────────
const REGULAR_MINS    = 7 * 60         // 420 min
const SUPPLEMENT_MINS = 4.5 * 60      // 270 min
const PAID_OT_MINS    = REGULAR_MINS + SUPPLEMENT_MINS  // 690 min (11.5 h)

// ─── types ────────────────────────────────────────────────────────────────────
interface BreakEntry {
  id: string
  label: string
  minutes: number
}

interface DayLog {
  id: string
  shoot_id: string
  date: string        // "YYYY-MM-DD"
  start_time: string | null  // "HH:MM"
  end_time:   string | null  // "HH:MM"
  breaks: BreakEntry[]
  notes: string | null
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fmtMins(mins: number): string {
  if (mins <= 0) return '0h 0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function netMinsFor(log: DayLog, fallbackEnd: string): number {
  if (!log.start_time) return 0
  const end = log.end_time ?? fallbackEnd
  const gross = timeToMins(end) - timeToMins(log.start_time)
  const breaks = log.breaks.reduce((s, b) => s + b.minutes, 0)
  return Math.max(0, gross - breaks)
}

// ─── component ────────────────────────────────────────────────────────────────
export function ShootDayTimer({ shootId }: { shootId: string }) {
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [loading, setLoading] = useState(true)
  const [log, setLog]       = useState<DayLog | null>(null)
  const [history, setHistory] = useState<DayLog[]>([])
  const [liveNow, setLiveNow] = useState(nowHHMM())
  const [saving, setSaving] = useState(false)

  // inline edit state
  const [editStart, setEditStart] = useState<string | null>(null)
  const [editEnd,   setEditEnd]   = useState<string | null>(null)
  const [addingBreak, setAddingBreak] = useState(false)
  const [bkLabel, setBkLabel] = useState('Lunch')
  const [bkMins,  setBkMins]  = useState(60)
  const [customMins, setCustomMins] = useState('')

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('shoot_day_logs').select('*').eq('shoot_id', shootId).eq('date', today).maybeSingle(),
      supabase.from('shoot_day_logs').select('*').eq('shoot_id', shootId).order('date', { ascending: false }).limit(14),
    ]).then(([todayRes, histRes]) => {
      setLog(todayRes.data as DayLog | null)
      setHistory((histRes.data as DayLog[] ?? []).filter(d => d.date !== today))
      setLoading(false)
    })
  }, []) // eslint-disable-line

  // live clock while running
  useEffect(() => {
    if (!log?.start_time || log.end_time) return
    const id = setInterval(() => setLiveNow(nowHHMM()), 15_000)
    return () => clearInterval(id)
  }, [log?.start_time, log?.end_time])

  // ── persist ───────────────────────────────────────────────────────────────
  const persist = async (patch: Partial<DayLog>) => {
    setSaving(true)
    const updated_at = new Date().toISOString()
    if (!log) {
      const { data } = await supabase
        .from('shoot_day_logs')
        .insert({ shoot_id: shootId, date: today, breaks: [], ...patch, updated_at })
        .select().single()
      setLog(data as DayLog)
    } else {
      const next = { ...log, ...patch, updated_at }
      await supabase.from('shoot_day_logs').update(next).eq('id', log.id)
      setLog(next)
    }
    setSaving(false)
  }

  const startDay = () => persist({ start_time: nowHHMM(), end_time: null })
  const endDay   = () => persist({ end_time: nowHHMM() })

  const addBreak = () => {
    const mins = customMins ? parseInt(customMins) : bkMins
    if (!mins || mins <= 0) return
    const entry: BreakEntry = { id: crypto.randomUUID(), label: bkLabel || 'Break', minutes: mins }
    persist({ breaks: [...(log?.breaks ?? []), entry] })
    setAddingBreak(false)
    setBkLabel('Lunch')
    setBkMins(60)
    setCustomMins('')
  }

  const removeBreak = (id: string) => {
    if (!log) return
    persist({ breaks: log.breaks.filter(b => b.id !== id) })
  }

  const saveStart = () => {
    if (editStart) persist({ start_time: editStart })
    setEditStart(null)
  }
  const saveEnd = () => {
    persist({ end_time: editEnd || null })
    setEditEnd(null)
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const isRunning  = !!log?.start_time && !log.end_time
  const netMins    = log ? netMinsFor(log, liveNow) : 0
  const regMins    = Math.min(netMins, REGULAR_MINS)
  const suppMins   = Math.min(Math.max(netMins - REGULAR_MINS, 0), SUPPLEMENT_MINS)
  const paidOTMins = Math.max(netMins - PAID_OT_MINS, 0)
  const suppRemain = SUPPLEMENT_MINS - suppMins

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
  )

  return (
    <div className="px-4 pt-4 pb-28 space-y-4">

      {/* ── No session ── */}
      {!log?.start_time && (
        <div className="flex flex-col items-center py-12 gap-5">
          <Clock className="h-10 w-10 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">No hours logged today</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">{liveNow}</p>
          </div>
          <Button onClick={startDay} size="lg" className="gap-2 px-10" disabled={saving}>
            <Play className="h-5 w-5" />
            Start Day
          </Button>
        </div>
      )}

      {/* ── Active / completed session ── */}
      {log?.start_time && (
        <>
          {/* Time card */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">

              {/* Start */}
              <div className="text-center min-w-[80px]">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">Start</p>
                {editStart !== null ? (
                  <div className="flex flex-col items-center gap-1">
                    <input type="time" value={editStart}
                      onChange={e => setEditStart(e.target.value)}
                      className="w-24 rounded border border-border bg-muted px-2 py-1 text-sm text-center outline-none focus:border-accent/50"
                    />
                    <div className="flex gap-1">
                      <button onClick={saveStart} className="text-green-500"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditStart(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditStart(log.start_time!)}
                    className="text-2xl font-mono font-semibold hover:text-accent transition-colors"
                  >
                    {log.start_time}
                  </button>
                )}
              </div>

              {/* Net time */}
              <div className="text-center">
                <p className={`text-4xl font-mono font-bold tabular-nums ${isRunning ? 'text-accent' : ''}`}>
                  {fmtMins(netMins)}
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">net worked</p>
                {log.breaks.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/40">
                    −{fmtMins(log.breaks.reduce((s, b) => s + b.minutes, 0))} breaks
                  </p>
                )}
              </div>

              {/* End */}
              <div className="text-center min-w-[80px]">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">End</p>
                {editEnd !== null ? (
                  <div className="flex flex-col items-center gap-1">
                    <input type="time" value={editEnd}
                      onChange={e => setEditEnd(e.target.value)}
                      className="w-24 rounded border border-border bg-muted px-2 py-1 text-sm text-center outline-none focus:border-accent/50"
                    />
                    <div className="flex gap-1">
                      <button onClick={saveEnd} className="text-green-500"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditEnd(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : isRunning ? (
                  <p className="text-2xl font-mono font-semibold text-muted-foreground/40 tabular-nums">
                    {liveNow}
                  </p>
                ) : (
                  <button
                    onClick={() => setEditEnd(log.end_time!)}
                    className="text-2xl font-mono font-semibold hover:text-accent transition-colors"
                  >
                    {log.end_time}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isRunning ? (
              <Button
                onClick={endDay}
                className="flex-1 gap-2 bg-red-500/90 hover:bg-red-500 text-white"
                disabled={saving}
              >
                <Square className="h-4 w-4" /> Wrap
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setEditEnd(log.end_time ?? nowHHMM())}
                className="flex-1 gap-2"
              >
                <Pencil className="h-4 w-4" /> Edit end time
              </Button>
            )}
            <Button variant="outline" onClick={() => setAddingBreak(v => !v)} className="gap-2">
              <Coffee className="h-4 w-4" />
              {addingBreak ? 'Cancel' : 'Add break'}
            </Button>
          </div>

          {/* Add break form */}
          {addingBreak && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-medium">Add break</p>
              <div className="flex gap-2">
                <input
                  value={bkLabel}
                  onChange={e => setBkLabel(e.target.value)}
                  placeholder="Label"
                  className="flex-1 rounded border border-border bg-muted px-3 py-2 text-sm outline-none"
                />
                {customMins ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={customMins}
                      onChange={e => setCustomMins(e.target.value)}
                      min={1}
                      placeholder="min"
                      className="w-16 rounded border border-border bg-muted px-2 py-2 text-sm text-center outline-none"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                    <button onClick={() => setCustomMins('')} className="text-muted-foreground/50 hover:text-muted-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={bkMins}
                    onChange={e => {
                      if (e.target.value === 'custom') setCustomMins('30')
                      else setBkMins(Number(e.target.value))
                    }}
                    className="rounded border border-border bg-muted px-2 py-2 text-sm outline-none"
                  >
                    {[15, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m}m</option>)}
                    <option value="custom">Custom…</option>
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={addBreak} className="flex-1" disabled={saving}>Add</Button>
                <Button variant="ghost" onClick={() => { setAddingBreak(false); setCustomMins('') }}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Breaks list */}
          {log.breaks.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 px-1">Breaks removed</p>
              {log.breaks.map(b => (
                <div key={b.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card/50 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Coffee className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span className="text-sm">{b.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">−{b.minutes}m</span>
                    <button
                      onClick={() => removeBreak(b.id)}
                      className="text-muted-foreground/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Overtime summary */}
          {netMins > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-semibold">Hours summary</p>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex h-3 rounded-full overflow-hidden bg-muted gap-0.5">
                  {/* Regular */}
                  <div
                    className="bg-accent rounded-l-full transition-all"
                    style={{ width: `${Math.min((regMins / PAID_OT_MINS) * 100, 100)}%` }}
                  />
                  {/* Supplement */}
                  {suppMins > 0 && (
                    <div
                      className="bg-amber-400 transition-all"
                      style={{ width: `${(suppMins / PAID_OT_MINS) * 100}%` }}
                    />
                  )}
                  {/* Paid OT */}
                  {paidOTMins > 0 && (
                    <div className="bg-red-400 rounded-r-full transition-all flex-1" />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/35 px-0.5">
                  <span>0h</span>
                  <span>7h regular</span>
                  <span>11.5h</span>
                </div>
              </div>

              {/* Row breakdown */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-accent" />
                    <span className="text-sm text-muted-foreground">Regular</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{fmtMins(regMins)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <div>
                      <span className="text-sm text-muted-foreground">Supplement</span>
                      {suppRemain > 0 && suppMins < SUPPLEMENT_MINS && (
                        <span className="ml-2 text-xs text-muted-foreground/40">
                          {fmtMins(suppRemain)} left
                        </span>
                      )}
                      {suppMins >= SUPPLEMENT_MINS && (
                        <span className="ml-2 text-xs text-amber-400/70">maxed</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-amber-400">
                    {suppMins > 0 ? fmtMins(suppMins) : '—'}
                  </span>
                </div>

                <div className={`flex items-center justify-between ${paidOTMins === 0 ? 'opacity-30' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${paidOTMins > 0 ? 'bg-red-400' : 'bg-muted-foreground'}`} />
                    <span className={`text-sm ${paidOTMins > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                      Paid overtime
                    </span>
                  </div>
                  <span className={`text-sm font-medium tabular-nums ${paidOTMins > 0 ? 'text-red-400' : ''}`}>
                    {paidOTMins > 0 ? fmtMins(paidOTMins) : '—'}
                  </span>
                </div>
              </div>

              {paidOTMins > 0 && (
                <p className="text-xs text-red-400/80 bg-red-400/8 rounded-lg px-3 py-2">
                  ⚠️ {fmtMins(paidOTMins)} must be paid out
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── History (other days on this shoot) ── */}
      {history.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 px-1">Previous days</p>
          {history.map(d => {
            const net = netMinsFor(d, d.end_time ?? '')
            const otMins = Math.max(net - PAID_OT_MINS, 0)
            return (
              <div key={d.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-card/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISO(d.date), 'EEE d MMM')}
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">
                    {d.start_time} → {d.end_time ?? '—'}
                    {d.breaks.length > 0 && ` · −${d.breaks.reduce((s,b)=>s+b.minutes,0)}m breaks`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">{fmtMins(net)}</p>
                  {otMins > 0 && (
                    <p className="text-xs text-red-400 tabular-nums">{fmtMins(otMins)} paid OT</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
