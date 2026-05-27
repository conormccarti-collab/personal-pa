'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, Plus, Search, Loader2, GripHorizontal, AlertTriangle } from 'lucide-react'
import { addDays, differenceInDays, format, parseISO, startOfDay } from 'date-fns'
import type { GanttProject } from '@/types'

interface AsanaProject {
  gid: string
  name: string
  due_on: string | null
  start_on: string | null
}

const COLORS = [
  '#7c6af7', '#f97316', '#22c55e', '#06b6d4',
  '#ec4899', '#eab308', '#8b5cf6', '#14b8a6',
]

const DAY_PX = 28
const ROW_H = 44
const LABEL_W = 160

function dateToStr(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function GanttChart() {
  const [projects, setProjects] = useState<GanttProject[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AsanaProject[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [addingGid, setAddingGid] = useState<string | null>(null)

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragOrigStart, setDragOrigStart] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    id: string
    days: number
    projectName: string
    newStart: string
    origStart: string
  } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/gantt')
    const data = await res.json()
    setProjects(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Scroll to today once data loads
  useEffect(() => {
    if (loading || !scrollRef.current || projects.length === 0) return
    const allD: Date[] = []
    projects.forEach((p) => {
      if (p.start_date) allD.push(parseISO(p.start_date))
      if (p.deadline) allD.push(parseISO(p.deadline))
    })
    allD.push(startOfDay(new Date()))
    const cStart = startOfDay(new Date(Math.min(...allD.map((d) => d.getTime())) - 7 * 86400000))
    const todayOffset = differenceInDays(startOfDay(new Date()), cStart) * DAY_PX
    scrollRef.current.scrollLeft = Math.max(0, todayOffset - 80)
  }, [loading, projects.length])

  // Search debounce
  useEffect(() => {
    if (!showSearch) return
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) { setSearchResults([]); return }
      setSearching(true)
      const res = await fetch(`/api/gantt/asana-projects?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, showSearch])

  const remove = async (id: string) => {
    setProjects((p) => p.filter((x) => x.id !== id))
    await fetch(`/api/gantt/${id}`, { method: 'DELETE' })
  }

  const addProject = async (ap: AsanaProject) => {
    setAddingGid(ap.gid)
    const colorIndex = projects.length % COLORS.length
    const payload = {
      asana_project_gid: ap.gid,
      name: ap.name,
      start_date: ap.start_on ?? dateToStr(addDays(new Date(), -7)),
      deadline: ap.due_on,
      color: COLORS[colorIndex],
    }
    const res = await fetch('/api/gantt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error)
    } else {
      setProjects((p) => [...p, data])
    }
    setAddingGid(null)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }

  // Calculate chart bounds
  const allDates: Date[] = []
  projects.forEach((p) => {
    if (p.start_date) allDates.push(parseISO(p.start_date))
    if (p.deadline) allDates.push(parseISO(p.deadline))
  })
  const today = startOfDay(new Date())
  allDates.push(today)

  const chartStart = startOfDay(
    new Date(Math.min(...allDates.map((d) => d.getTime())) - 7 * 86400000)
  )
  const chartEnd = startOfDay(
    new Date(Math.max(...allDates.map((d) => d.getTime())) + 14 * 86400000)
  )
  const totalDays = differenceInDays(chartEnd, chartStart)
  const chartWidth = totalDays * DAY_PX

  const dayX = (dateStr: string) =>
    differenceInDays(parseISO(dateStr), chartStart) * DAY_PX

  const todayX = differenceInDays(today, chartStart) * DAY_PX

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent, project: GanttProject) => {
    e.preventDefault()
    setDragId(project.id)
    setDragStartX(e.clientX)
    setDragOrigStart(project.start_date)
  }

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragId) return
      const dx = e.clientX - dragStartX
      const daysDelta = Math.round(dx / DAY_PX)
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== dragId || !dragOrigStart) return p
          const newStart = dateToStr(addDays(parseISO(dragOrigStart), daysDelta))
          return { ...p, start_date: newStart }
        })
      )
    },
    [dragId, dragStartX, dragOrigStart]
  )

  const onMouseUp = useCallback(
    async (e: MouseEvent) => {
      if (!dragId) return
      const dx = e.clientX - dragStartX
      const daysDelta = Math.round(dx / DAY_PX)
      const project = projects.find((p) => p.id === dragId)
      if (project && daysDelta !== 0 && dragOrigStart) {
        const newStart = dateToStr(addDays(parseISO(dragOrigStart), daysDelta))
        setPendingMove({
          id: dragId,
          days: daysDelta,
          projectName: project.name,
          newStart,
          origStart: dragOrigStart,
        })
      }
      setDragId(null)
    },
    [dragId, dragStartX, projects, dragOrigStart]
  )

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const confirmMove = async () => {
    if (!pendingMove) return
    const { id, newStart } = pendingMove
    await fetch(`/api/gantt/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: newStart }),
    })
    setPendingMove(null)
  }

  const cancelMove = () => {
    if (!pendingMove) return
    const { id, origStart } = pendingMove
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, start_date: origStart } : p
      )
    )
    setPendingMove(null)
  }

  // Month header labels
  const months: { label: string; x: number; width: number }[] = []
  let cursor = new Date(chartStart)
  while (cursor < chartEnd) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const x = Math.max(0, differenceInDays(cursor, chartStart) * DAY_PX)
    const end = Math.min(chartWidth, (differenceInDays(monthEnd, chartStart) + 1) * DAY_PX)
    months.push({ label: format(cursor, 'MMM yyyy'), x, width: end - x })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  // Day tick labels (every 7 days)
  const dayTicks: { label: string; x: number }[] = []
  for (let i = 0; i <= totalDays; i += 7) {
    const d = addDays(chartStart, i)
    dayTicks.push({ label: format(d, 'd'), x: i * DAY_PX })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>Project Timeline</CardTitle>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchRef.current?.focus(), 50) }}
            disabled={projects.length >= 10}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add project
          </Button>

          {showSearch && (
            <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-border bg-card shadow-xl">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Asana projects…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                />
                {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {searchResults.length === 0 && searchQuery && !searching && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No projects found</p>
                )}
                {searchResults.map((ap) => {
                  const already = projects.some((p) => p.asana_project_gid === ap.gid)
                  return (
                    <button
                      key={ap.gid}
                      disabled={already || addingGid === ap.gid}
                      onClick={() => addProject(ap)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-40"
                    >
                      <span className="truncate">{ap.name}</span>
                      {addingGid === ap.gid
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : already
                        ? <span className="text-xs text-muted-foreground">Added</span>
                        : <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </button>
                  )
                })}
                {!searchQuery && (
                  <p className="px-3 py-2 text-xs text-muted-foreground/50">Type to search projects</p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Safety confirmation */}
        {pendingMove && (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="flex-1 text-amber-200">
              Move <strong>{pendingMove.projectName}</strong> start by{' '}
              {pendingMove.days > 0 ? `+${pendingMove.days}` : pendingMove.days} days?
            </span>
            <Button size="sm" onClick={confirmMove} className="h-7 px-3 text-xs">Confirm</Button>
            <Button size="sm" variant="ghost" onClick={cancelMove} className="h-7 px-3 text-xs">Cancel</Button>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Add Asana projects to see your timeline.
          </div>
        ) : (
          <div className="flex">
            {/* Fixed project labels */}
            <div className="shrink-0" style={{ width: LABEL_W }}>
              {/* Header spacer */}
              <div style={{ height: 36 }} />
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-1.5 pr-2"
                  style={{ height: ROW_H }}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="flex-1 truncate text-xs font-medium leading-tight">{p.name}</span>
                  <button
                    onClick={() => remove(p.id)}
                    className="shrink-0 text-muted-foreground/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Scrollable chart area */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto" style={{ cursor: dragId ? 'grabbing' : 'default' }}>
              <div style={{ width: chartWidth, position: 'relative' }}>
                {/* Month headers */}
                <div className="relative" style={{ height: 20 }}>
                  {months.map((m) => (
                    <div
                      key={m.label}
                      className="absolute top-0 truncate px-1 text-[10px] font-medium text-muted-foreground/60"
                      style={{ left: m.x, width: m.width }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>

                {/* Day ticks */}
                <div className="relative" style={{ height: 16 }}>
                  {dayTicks.map((t) => (
                    <div
                      key={t.x}
                      className="absolute top-0 text-[10px] text-muted-foreground/40"
                      style={{ left: t.x + 2 }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>

                {/* Grid + bars */}
                <div className="relative" style={{ height: projects.length * ROW_H }}>
                  {/* Vertical grid lines every 7 days */}
                  {dayTicks.map((t) => (
                    <div
                      key={t.x}
                      className="absolute top-0 bottom-0 border-l border-border/30"
                      style={{ left: t.x }}
                    />
                  ))}

                  {/* Today line */}
                  <div
                    className="absolute top-0 bottom-0 z-10 border-l-2 border-red-500/70"
                    style={{ left: todayX }}
                  >
                    <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-red-500" />
                  </div>

                  {/* Project rows */}
                  {projects.map((p, i) => {
                    const hasStart = !!p.start_date
                    const hasDeadline = !!p.deadline

                    const barLeft = hasStart ? dayX(p.start_date!) : todayX
                    const barRight = hasDeadline
                      ? dayX(p.deadline!)
                      : barLeft + p.duration_days * DAY_PX
                    const barWidth = Math.max(DAY_PX, barRight - barLeft)

                    const deadlineX = hasDeadline ? dayX(p.deadline!) : null

                    return (
                      <div
                        key={p.id}
                        className="absolute left-0 right-0"
                        style={{ top: i * ROW_H, height: ROW_H }}
                      >
                        {/* Alternate row background */}
                        {i % 2 === 1 && (
                          <div className="absolute inset-0 bg-muted/20" />
                        )}

                        {/* Project bar */}
                        <div
                          className="absolute flex items-center gap-1 rounded select-none"
                          style={{
                            left: barLeft,
                            width: barWidth,
                            top: 8,
                            height: ROW_H - 16,
                            backgroundColor: p.color + '33',
                            border: `1px solid ${p.color}66`,
                            cursor: dragId === p.id ? 'grabbing' : 'grab',
                          }}
                          onMouseDown={(e) => onMouseDown(e, p)}
                        >
                          <GripHorizontal
                            className="ml-1.5 h-3 w-3 shrink-0"
                            style={{ color: p.color + 'aa' }}
                          />
                          <span
                            className="truncate text-[10px] font-medium"
                            style={{ color: p.color }}
                          >
                            {p.name}
                          </span>
                        </div>

                        {/* Deadline marker */}
                        {deadlineX !== null && (
                          <div
                            className="absolute top-1 bottom-1 z-20"
                            style={{ left: deadlineX }}
                            title={`Deadline: ${p.deadline}`}
                          >
                            <div
                              className="h-full w-0.5"
                              style={{ backgroundColor: '#ef4444cc' }}
                            />
                            <div
                              className="absolute -bottom-0.5 -left-1 h-2 w-2 rotate-45"
                              style={{ backgroundColor: '#ef4444' }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
