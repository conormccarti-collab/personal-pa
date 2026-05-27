'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  RefreshCw, Users, AlertCircle, Loader2, Unlink,
  ChevronRight, ChevronDown, UserPlus, Check,
} from 'lucide-react'
import { format, parseISO, startOfDay } from 'date-fns'
import type { AsanaProjectTask, AsanaMember } from '@/lib/asana'

interface Member {
  gid: string
  name: string
  tasks: AsanaProjectTask[]
  overdueCount: number
}

interface ProjectData {
  members: Member[]
  unassigned: AsanaProjectTask[]
  totalActive: number
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function dueLabel(due: string | null) {
  if (!due) return null
  const today = startOfDay(new Date()).toISOString().slice(0, 10)
  return { label: format(parseISO(due), 'd MMM'), overdue: due < today }
}

function workloadRing(count: number, overdue: number) {
  if (overdue > 0) return 'ring-red-500/50 bg-red-500/10 text-red-400'
  if (count === 0) return 'ring-border bg-muted/40 text-muted-foreground/40'
  if (count <= 3) return 'ring-green-500/40 bg-green-500/10 text-green-400'
  if (count <= 6) return 'ring-amber-500/40 bg-amber-500/10 text-amber-400'
  return 'ring-red-500/40 bg-red-500/10 text-red-400'
}

// ── Subtask row ─────────────────────────────────────────────────────────────
function SubtaskRow({
  task,
  members,
  onAssigned,
}: {
  task: AsanaProjectTask
  members: AsanaMember[]
  onAssigned?: (taskGid: string, member: AsanaMember) => void
}) {
  const due = dueLabel(task.due_on)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignedName, setAssignedName] = useState(task.assignee?.name ?? null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!assignOpen) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setAssignOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [assignOpen])

  const handleAssign = async (member: AsanaMember) => {
    setAssigning(true)
    setAssignOpen(false)
    const res = await fetch('/api/asana/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskGid: task.gid, assigneeGid: member.gid }),
    })
    if (res.ok) {
      setAssignedName(member.name)
      onAssigned?.(task.gid, member)
    }
    setAssigning(false)
  }

  return (
    <div className="flex items-center gap-2 pl-4 py-1 border-b border-border/30 last:border-0">
      <div className="h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
      <p className="flex-1 text-xs text-muted-foreground/70 truncate">{task.name}</p>
      {assignedName && (
        <span className="shrink-0 text-[10px] text-muted-foreground/50">{assignedName.split(' ')[0]}</span>
      )}
      {due && (
        <span className={`shrink-0 text-[10px] font-medium px-1 py-0.5 rounded ${
          due.overdue ? 'bg-red-500/15 text-red-400' : 'bg-muted text-muted-foreground/50'
        }`}>
          {due.label}
        </span>
      )}
      <div className="relative shrink-0" ref={dropRef}>
        <button
          onClick={() => setAssignOpen((v) => !v)}
          disabled={assigning}
          className="flex items-center text-[10px] text-muted-foreground/40 hover:text-accent transition-colors px-1 py-0.5 rounded hover:bg-accent/10"
          title="Assign"
        >
          {assigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
        </button>
        {assignOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-border bg-card shadow-lg overflow-hidden">
            {members.map((m) => (
              <button
                key={m.gid}
                onClick={() => handleAssign(m)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                  {initials(m.name)}
                </span>
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Task row with optional subtask expand + assign ──────────────────────────
function TaskRow({
  task,
  members,
  onAssigned,
  showAssign = false,
}: {
  task: AsanaProjectTask
  members: AsanaMember[]
  onAssigned?: (taskGid: string, member: AsanaMember) => void
  showAssign?: boolean
}) {
  const due = dueLabel(task.due_on)
  const section = task.memberships?.[0]?.section?.name

  const [expanded, setExpanded] = useState(false)
  const [subtasks, setSubtasks] = useState<AsanaProjectTask[] | null>(null)
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close assign dropdown on outside click
  useEffect(() => {
    if (!assignOpen) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setAssignOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [assignOpen])

  const toggleExpand = async () => {
    if (!expanded && subtasks === null) {
      setLoadingSubs(true)
      const res = await fetch(`/api/asana/subtasks/${task.gid}`)
      const data = await res.json()
      setSubtasks(Array.isArray(data) ? data : [])
      setLoadingSubs(false)
    }
    setExpanded((v) => !v)
  }

  const handleAssign = async (member: AsanaMember) => {
    setAssigning(true)
    setAssignError(null)
    setAssignOpen(false)
    const res = await fetch('/api/asana/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskGid: task.gid, assigneeGid: member.gid }),
    })
    if (res.ok) {
      onAssigned?.(task.gid, member)
    } else {
      const j = await res.json()
      setAssignError(j.error ?? 'Failed')
    }
    setAssigning(false)
  }

  return (
    <div>
      <div className="flex items-start gap-1.5 py-1.5 border-b border-border/40 last:border-0">
        {/* Expand toggle */}
        <button
          onClick={toggleExpand}
          className="mt-0.5 shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Show subtasks"
        >
          {loadingSubs ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/80 truncate">{task.name}</p>
          {section && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">{section}</p>
          )}
          {assignError && (
            <p className="text-[10px] text-red-400 mt-0.5">{assignError}</p>
          )}
        </div>

        {due && (
          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
            due.overdue ? 'bg-red-500/15 text-red-400' : 'bg-muted text-muted-foreground/60'
          }`}>
            {due.overdue ? '⚠ ' : ''}{due.label}
          </span>
        )}

        {/* Assign button */}
        {showAssign && (
          <div className="relative shrink-0" ref={dropRef}>
            <button
              onClick={() => setAssignOpen((v) => !v)}
              disabled={assigning}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-accent/10"
              title="Assign"
            >
              {assigning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <UserPlus className="h-3 w-3" />
              )}
              Assign
            </button>
            {assignOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-card shadow-lg overflow-hidden">
                {members.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No members found</p>
                ) : (
                  members.map((m) => (
                    <button
                      key={m.gid}
                      onClick={() => handleAssign(m)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                        {initials(m.name)}
                      </span>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subtasks */}
      {expanded && subtasks !== null && (
        <div className="ml-2 border-l border-border/40 mb-1">
          {subtasks.length === 0 ? (
            <p className="pl-4 py-1.5 text-[10px] text-muted-foreground/40">No subtasks</p>
          ) : (
            subtasks.map((s) => <SubtaskRow key={s.gid} task={s} members={members} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Member card ─────────────────────────────────────────────────────────────
function MemberCard({ member, members }: { member: Member; members: AsanaMember[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? member.tasks : member.tasks.slice(0, 5)
  const ringClass = workloadRing(member.tasks.length, member.overdueCount)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 text-sm font-semibold ${ringClass}`}>
            {initials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{member.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs font-semibold ${
                member.tasks.length === 0 ? 'text-muted-foreground/40'
                : member.tasks.length <= 3 ? 'text-green-400'
                : member.tasks.length <= 6 ? 'text-amber-400'
                : 'text-red-400'
              }`}>
                {member.tasks.length} task{member.tasks.length !== 1 ? 's' : ''}
              </span>
              {member.overdueCount > 0 && (
                <span className="text-[10px] text-red-400 font-medium">· {member.overdueCount} overdue</span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {member.tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 py-2">No active tasks</p>
        ) : (
          <>
            {shown.map((t) => (
              <TaskRow key={t.gid} task={t} members={members} />
            ))}
            {member.tasks.length > 5 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 text-xs text-accent/70 hover:text-accent transition-colors"
              >
                {expanded ? 'Show less' : `+${member.tasks.length - 5} more`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Section grouping helpers ─────────────────────────────────────────────────
const SECTION_DURATION_LABEL: Record<string, string> = {
  'planning & pre production': '2 days',
  'pre-edit review & brief':   '1 day',
  'edit':                      '2 weeks',
  'review':                    '2 days',
}

function groupBySection(tasks: AsanaProjectTask[]): { section: string; tasks: AsanaProjectTask[] }[] {
  const map = new Map<string, AsanaProjectTask[]>()
  for (const task of tasks) {
    const s = task.memberships?.[0]?.section?.name ?? 'Unsectioned'
    if (!map.has(s)) map.set(s, [])
    map.get(s)!.push(task)
  }
  // Sort: Idea Bank last, everything else in insertion order
  const entries = Array.from(map.entries()).map(([section, tasks]) => ({ section, tasks }))
  return entries.sort((a, b) => {
    const aIdea = a.section.toLowerCase().includes('idea')
    const bIdea = b.section.toLowerCase().includes('idea')
    if (aIdea && !bIdea) return 1
    if (!aIdea && bIdea) return -1
    return 0
  })
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const [data, setData] = useState<ProjectData | null>(null)
  const [projectMembers, setProjectMembers] = useState<AsanaMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const [tasksRes, membersRes] = await Promise.all([
        fetch('/api/asana/project-tasks'),
        fetch('/api/asana/project-members'),
      ])
      if (!tasksRes.ok) {
        const j = await tasksRes.json()
        throw new Error(j.error ?? 'Failed to load tasks')
      }
      const tasksJson = await tasksRes.json()
      setData(tasksJson)

      if (membersRes.ok) {
        const membersJson = await membersRes.json()
        setProjectMembers(Array.isArray(membersJson) ? membersJson : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAssigned = useCallback((taskGid: string, member: AsanaMember) => {
    setData((prev) => {
      if (!prev) return prev
      const task = prev.unassigned.find((t) => t.gid === taskGid)
      if (!task) return prev

      const updatedTask = { ...task, assignee: { gid: member.gid, name: member.name } }
      const newUnassigned = prev.unassigned.filter((t) => t.gid !== taskGid)

      const existingMember = prev.members.find((m) => m.gid === member.gid)
      let newMembers: Member[]
      if (existingMember) {
        newMembers = prev.members.map((m) =>
          m.gid === member.gid
            ? { ...m, tasks: [...m.tasks, updatedTask].sort((a, b) =>
                (a.due_on ?? 'z').localeCompare(b.due_on ?? 'z')
              )}
            : m
        )
      } else {
        newMembers = [
          ...prev.members,
          { gid: member.gid, name: member.name, tasks: [updatedTask], overdueCount: 0 },
        ].sort((a, b) => a.name.localeCompare(b.name))
      }

      return {
        ...prev,
        members: newMembers,
        unassigned: newUnassigned,
        totalActive: prev.totalActive,
      }
    })
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Workload</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live from Asana ·{' '}
            {data
              ? `${data.totalActive} active tasks across ${data.members.length} people`
              : 'Loading…'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="shrink-0"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
          Fetching from Asana…
        </div>
      )}

      {error && (
        <Card className="border-red-500/30">
          <CardContent className="py-10 text-center">
            <AlertCircle className="mx-auto mb-3 h-6 w-6 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {data.members.length === 0 && data.unassigned.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active tasks in this project.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.members.map((m) => (
                  <MemberCard key={m.gid} member={m} members={projectMembers} />
                ))}
              </div>

              {data.unassigned.length > 0 && (
                <div>
                  <h2 className="mb-3 text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Unlink className="h-3.5 w-3.5" />
                    Unassigned ({data.unassigned.length})
                  </h2>
                  <div className="space-y-4">
                    {groupBySection(data.unassigned).map(({ section, tasks: sectionTasks }) => {
                      const durationLabel = SECTION_DURATION_LABEL[section.toLowerCase().trim()]
                      return (
                        <div key={section}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{section}</span>
                            {durationLabel && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70 font-medium">
                                {durationLabel}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40">
                              {sectionTasks.length} task{sectionTasks.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <Card>
                            <CardContent className="pt-3 pb-1">
                              {sectionTasks.map((t) => (
                                <TaskRow
                                  key={t.gid}
                                  task={t}
                                  members={projectMembers}
                                  onAssigned={handleAssigned}
                                  showAssign
                                />
                              ))}
                            </CardContent>
                          </Card>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
