'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDueDate } from '@/lib/utils'
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import {
  CheckCircle2, Circle, Plus, Loader2, Trash2, X,
  RefreshCw, ExternalLink, Sparkles, ChevronDown, ChevronRight,
  ListTodo, Clock, UserPlus, Pencil, Check,
} from 'lucide-react'
import { BrainDump } from '@/components/tasks/BrainDump'
import { getBrandColor } from '@/lib/brand-colors'
import type { Task, Priority, TeamMember, TodoSection } from '@/types'

/** Route a task into the right todo bucket based on its due date */
function sectionFromDueDate(dueDate: string | null): TodoSection {
  if (!dueDate) return 'next_fortnight'
  const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()))
  if (days <= 0)  return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 14) return 'next_fortnight'
  return 'next_fortnight'
}

const priorities: Priority[] = ['high', 'medium', 'low']
const UNSORTED = '__unsorted__'
const DONE = '__done__'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [sorting, setSorting] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set([DONE]))
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)

  // todo toggle state: task_id → todo_item_id
  const [todoMap, setTodoMap] = useState<Map<string, string>>(new Map())
  // team state: members list + assignment map (task_id → member_id)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [assignmentMap, setAssignmentMap] = useState<Map<string, string>>(new Map())

  const supabase = createClient()

  const load = async () => {
    const [tasksResult, todoResult, membersResult, assignmentsResult] = await Promise.all([
      supabase.from('tasks').select('*').neq('status', 'archived')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('todo_items').select('id, task_id'),
      supabase.from('team_members').select('*').order('name'),
      supabase.from('team_task_assignments').select('task_id, team_member_id'),
    ])

    setTasks((tasksResult.data as Task[]) ?? [])

    const newTodoMap = new Map<string, string>()
    for (const item of (todoResult.data ?? [])) {
      if (item.task_id) newTodoMap.set(item.task_id, item.id)
    }
    setTodoMap(newTodoMap)

    setTeamMembers((membersResult.data as TeamMember[]) ?? [])

    const newAssignMap = new Map<string, string>()
    for (const a of (assignmentsResult.data ?? [])) {
      newAssignMap.set(a.task_id, a.team_member_id)
    }
    setAssignmentMap(newAssignMap)

    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const grouped = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'done')
    const done = tasks.filter((t) => t.status === 'done')
    const map: Record<string, Task[]> = {}
    for (const t of active) {
      const key = t.category ?? UNSORTED
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    const sections = Object.entries(map).sort(([a], [b]) => {
      if (a === UNSORTED) return 1
      if (b === UNSORTED) return -1
      return a.localeCompare(b)
    })
    return { sections, done }
  }, [tasks])

  const allCategories = useMemo(
    () => [...new Set(tasks.map((t) => t.category).filter(Boolean))] as string[],
    [tasks]
  )

  const unsortedCount = tasks.filter((t) => !t.category && t.status !== 'done').length

  const toggle = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  const remove = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
  }

  const addTask = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, priority: newPriority }),
    })
    const task = await res.json()
    setTasks((prev) => [task, ...prev])
    setNewTitle('')
    setAdding(false)
  }

  const syncFromAsana = async () => {
    setSyncing(true)
    await fetch('/api/asana/sync', { method: 'POST' })
    await load()
    setSyncing(false)
  }

  const pushToAsana = async (taskId: string) => {
    const res = await fetch('/api/asana/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    })
    const data = await res.json()
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, asana_id: data.asana_id ?? t.asana_id } : t))
    )
  }

  const aiSort = async () => {
    const uncategorised = tasks.filter((t) => !t.category && t.status !== 'done')
    if (!uncategorised.length) return
    setSorting(true)
    const res = await fetch('/api/ai/categorise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: uncategorised }),
    })
    const { assignments } = await res.json()
    setTasks((prev) =>
      prev.map((t) => {
        const match = assignments?.find((a: { id: string; category: string | null }) => a.id === t.id)
        return match?.category ? { ...t, category: match.category } : t
      })
    )
    setSorting(false)
  }

  const updateDueDate = async (taskId: string, due_date: string | null) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, due_date } : t)))
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date }),
    })
  }

  const updateEstimate = async (taskId: string, estimated_hours: number | null) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, estimated_hours } : t)))
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimated_hours }),
    })
  }

  const toggleTodo = async (task: Task) => {
    const existingId = todoMap.get(task.id)
    if (existingId) {
      // Remove from todo
      setTodoMap((prev) => { const m = new Map(prev); m.delete(task.id); return m })
      await fetch(`/api/todo/${existingId}`, { method: 'DELETE' })
    } else {
      // Add to correct bucket based on due date
      const section = sectionFromDueDate(task.due_date)
      const res = await fetch('/api/todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          task_id: task.id,
          section,
          estimated_hours: task.estimated_hours,
          duration_minutes: task.estimated_hours ? Math.min(480, Math.round(task.estimated_hours * 60)) : 30,
        }),
      })
      const data = await res.json()
      if (data.id) setTodoMap((prev) => new Map([...prev, [task.id, data.id]]))
    }
  }

  const assignTask = async (taskId: string, memberId: string) => {
    const currentMemberId = assignmentMap.get(taskId)
    if (currentMemberId === memberId) {
      // Unassign
      setAssignmentMap((prev) => { const m = new Map(prev); m.delete(taskId); return m })
      await supabase.from('team_task_assignments')
        .delete().eq('task_id', taskId).eq('team_member_id', memberId)
    } else {
      // Assign (replace any existing)
      setAssignmentMap((prev) => new Map([...prev, [taskId, memberId]]))
      await supabase.from('team_task_assignments').delete().eq('task_id', taskId)
      await supabase.from('team_task_assignments').insert({ task_id: taskId, team_member_id: memberId })
    }
  }

  const updateCategory = async (taskId: string, category: string | null, context: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, category, ...(context ? { category_context: context } : {}) }
          : t
      )
    )
    setEditingTaskId(null)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, ...(context ? { category_context: context } : {}) }),
    })
  }

  const renameCategory = async (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    setTasks((prev) => prev.map((t) => t.category === oldName ? { ...t, category: trimmed } : t))
    await supabase
      .from('tasks')
      .update({ category: trimmed, updated_at: new Date().toISOString() })
      .eq('category', oldName)
  }

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return (
    <>
    <BrainDump />
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.filter((t) => t.status !== 'done').length} active
            {unsortedCount > 0 && (
              <span className="ml-1 text-amber-400">· {unsortedCount} unsorted</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={aiSort}
            disabled={sorting || unsortedCount === 0}
            className="gap-1.5 text-xs"
            title={unsortedCount === 0 ? 'No unsorted tasks' : `Sort ${unsortedCount} unsorted tasks`}
          >
            {sorting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI Sort
          </Button>
          <Button variant="ghost" size="sm" onClick={syncFromAsana} disabled={syncing} className="gap-1.5 text-xs">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync Asana
          </Button>
        </div>
      </div>

      {/* Add task */}
      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder="Add a task…"
          className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent/50"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as Priority)}
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none"
        >
          {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <Button onClick={addTask} disabled={!newTitle.trim() || adding}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          {grouped.sections.map(([key, sectionTasks]) => (
            <Section
              key={key}
              sectionKey={key}
              tasks={sectionTasks}
              allCategories={allCategories}
              collapsed={collapsed.has(key)}
              onToggleCollapse={() => toggleCollapse(key)}
              onToggle={toggle}
              onDelete={remove}
              onPushToAsana={pushToAsana}
              onUpdateCategory={updateCategory}
              onUpdateDueDate={updateDueDate}
              onUpdateEstimate={updateEstimate}
              onToggleTodo={toggleTodo}
              todoMap={todoMap}
              teamMembers={teamMembers}
              assignmentMap={assignmentMap}
              onAssign={assignTask}
              editingTaskId={editingTaskId}
              onSetEditing={setEditingTaskId}
              onRenameCategory={renameCategory}
            />
          ))}

          {grouped.done.length > 0 && (
            <Section
              sectionKey={DONE}
              tasks={grouped.done}
              allCategories={allCategories}
              collapsed={collapsed.has(DONE)}
              onToggleCollapse={() => toggleCollapse(DONE)}
              onToggle={toggle}
              onDelete={remove}
              onPushToAsana={pushToAsana}
              onUpdateCategory={updateCategory}
              onUpdateDueDate={updateDueDate}
              onUpdateEstimate={updateEstimate}
              onToggleTodo={toggleTodo}
              todoMap={todoMap}
              teamMembers={teamMembers}
              assignmentMap={assignmentMap}
              onAssign={assignTask}
              editingTaskId={editingTaskId}
              onSetEditing={setEditingTaskId}
              onRenameCategory={renameCategory}
            />
          )}

          {grouped.sections.length === 0 && grouped.done.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No tasks yet. Sync from Asana or add one above.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
    </>
  )
}

function Section({
  sectionKey,
  tasks,
  allCategories,
  collapsed,
  onToggleCollapse,
  onToggle,
  onDelete,
  onPushToAsana,
  onUpdateCategory,
  onUpdateDueDate,
  onUpdateEstimate,
  onToggleTodo,
  todoMap,
  teamMembers,
  assignmentMap,
  onAssign,
  editingTaskId,
  onSetEditing,
  onRenameCategory,
}: {
  sectionKey: string
  tasks: Task[]
  allCategories: string[]
  collapsed: boolean
  onToggleCollapse: () => void
  onToggle: (t: Task) => void
  onDelete: (id: string) => void
  onPushToAsana: (id: string) => void
  onUpdateCategory: (id: string, category: string | null, context: string) => void
  onUpdateDueDate: (id: string, date: string | null) => void
  onUpdateEstimate: (id: string, hours: number | null) => void
  onToggleTodo: (task: Task) => void
  todoMap: Map<string, string>
  teamMembers: TeamMember[]
  assignmentMap: Map<string, string>
  onAssign: (taskId: string, memberId: string) => void
  editingTaskId: string | null
  onSetEditing: (id: string | null) => void
  onRenameCategory: (oldName: string, newName: string) => void
}) {
  const isDone = sectionKey === DONE
  const isUnsorted = sectionKey === UNSORTED
  const label = isDone ? 'Completed' : isUnsorted ? 'Unsorted' : sectionKey

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(sectionKey)

  const commitRename = () => {
    onRenameCategory(sectionKey, renameValue)
    setRenaming(false)
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Section header */}
      <div className="group/header flex items-center px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors">

        {renaming ? (
          /* ── Rename / merge inline form ── */
          <div className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <select
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
              className="flex-1 rounded border border-border bg-muted px-2 py-1 text-sm text-foreground outline-none focus:border-accent/50"
            >
              <option value={sectionKey}>{sectionKey} (keep name)</option>
              {allCategories.filter((c) => c !== sectionKey).map((c) => (
                <option key={c} value={c}>↳ Merge into "{c}"</option>
              ))}
            </select>
            <button onClick={commitRename} className="text-green-500 hover:text-green-400">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setRenaming(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* ── Normal header ── */
          <>
            <button
              onClick={onToggleCollapse}
              className="flex flex-1 items-center gap-2 text-left"
            >
              {collapsed
                ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={`text-sm font-medium ${isUnsorted ? 'text-amber-400' : ''}`}>{label}</span>
              <span className="text-xs text-muted-foreground">{tasks.length}</span>
            </button>
            {!isDone && !isUnsorted && (
              <button
                onClick={(e) => { e.stopPropagation(); setRenameValue(sectionKey); setRenaming(true) }}
                title="Rename or merge category"
                className="ml-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <div className="divide-y divide-border/50">
          {tasks.map((task) =>
            editingTaskId === task.id ? (
              <CategoryEditor
                key={task.id}
                task={task}
                allCategories={allCategories}
                onSave={(cat, ctx) => onUpdateCategory(task.id, cat, ctx)}
                onCancel={() => onSetEditing(null)}
              />
            ) : (
              <TaskRow
                key={task.id}
                task={task}
                done={isDone}
                inTodo={todoMap.has(task.id)}
                assignedMemberId={assignmentMap.get(task.id) ?? null}
                teamMembers={teamMembers}
                onToggle={() => onToggle(task)}
                onDelete={() => onDelete(task.id)}
                onPushToAsana={() => onPushToAsana(task.id)}
                onEditCategory={() => onSetEditing(task.id)}
                onUpdateDueDate={(date) => onUpdateDueDate(task.id, date)}
                onUpdateEstimate={(hrs) => onUpdateEstimate(task.id, hrs)}
                onToggleTodo={() => onToggleTodo(task)}
                onAssign={(mid) => onAssign(task.id, mid)}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  done,
  inTodo,
  assignedMemberId,
  teamMembers,
  onToggle,
  onDelete,
  onPushToAsana,
  onEditCategory,
  onUpdateDueDate,
  onUpdateEstimate,
  onToggleTodo,
  onAssign,
}: {
  task: Task
  done: boolean
  inTodo: boolean
  assignedMemberId: string | null
  teamMembers: TeamMember[]
  onToggle: () => void
  onDelete: () => void
  onPushToAsana: () => void
  onEditCategory: () => void
  onUpdateDueDate: (date: string | null) => void
  onUpdateEstimate: (hours: number | null) => void
  onToggleTodo: () => void
  onAssign: (memberId: string) => void
}) {
  const [editingDate, setEditingDate] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estValue, setEstValue] = useState(task.estimated_hours?.toString() ?? '')
  const [showAssign, setShowAssign] = useState(false)

  const assignedMember = teamMembers.find((m) => m.id === assignedMemberId)

  const brandColor = getBrandColor(task.project)

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 ${done ? 'opacity-40' : ''}`}
      style={brandColor ? { borderLeft: `3px solid ${brandColor}` } : {}}
    >
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-muted-foreground hover:text-accent">
        {done ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Circle className="h-4 w-4" />}
      </button>
      <div className="flex-1 min-w-0">
        {task.parent_task_title && (
          <p className="text-[10px] text-muted-foreground/50 leading-none mb-0.5 truncate">
            ↳ {task.parent_task_title}
          </p>
        )}
        <div className="flex items-center gap-2">
          <p className={`text-sm leading-snug ${done ? 'line-through' : ''}`}>{task.title}</p>
          {assignedMember && (
            <button
              onClick={() => onAssign(assignedMember.id)}
              title={`Assigned to ${assignedMember.name} — click to unassign`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent hover:bg-red-400/20 hover:text-red-400 transition-colors"
            >
              {assignedMember.name.slice(0, 2).toUpperCase()}
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">

          {/* Due date — click to edit */}
          {!done && (
            editingDate ? (
              <input
                type="date"
                autoFocus
                defaultValue={task.due_date ?? ''}
                onBlur={(e) => { onUpdateDueDate(e.target.value || null); setEditingDate(false) }}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingDate(false) }}
                className="rounded border border-accent/50 bg-muted px-1.5 py-0.5 text-xs text-foreground outline-none"
              />
            ) : (
              <button
                onClick={() => setEditingDate(true)}
                className="text-xs text-muted-foreground hover:text-accent transition-colors"
              >
                {task.due_date ? formatDueDate(task.due_date) : '+ due date'}
              </button>
            )
          )}

          {/* Time estimate — click to edit */}
          {!done && (
            editingEstimate ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  autoFocus
                  min="0.5"
                  step="0.5"
                  value={estValue}
                  onChange={(e) => setEstValue(e.target.value)}
                  onBlur={() => { onUpdateEstimate(estValue ? parseFloat(estValue) : null); setEditingEstimate(false) }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingEstimate(false) }}
                  className="w-16 rounded border border-accent/50 bg-muted px-1.5 py-0.5 text-xs text-foreground outline-none"
                />
                <span className="text-xs text-muted-foreground">hrs</span>
              </div>
            ) : (
              <button
                onClick={() => setEditingEstimate(true)}
                className="flex items-center gap-0.5 text-xs text-muted-foreground/50 hover:text-accent transition-colors"
              >
                <Clock className="h-3 w-3" />
                {task.estimated_hours ? `${task.estimated_hours}h` : '+ estimate'}
              </button>
            )
          )}

          {task.asana_id && (
            <span className="text-xs text-muted-foreground/40 flex items-center gap-0.5">
              <ExternalLink className="h-3 w-3" /> Asana
            </span>
          )}
          {!done && (
            <button
              onClick={onEditCategory}
              className="text-xs text-muted-foreground/40 hover:text-accent transition-colors"
            >
              {task.category ? `↳ ${task.category}` : '+ category'}
            </button>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant={task.priority}>{task.priority}</Badge>

        {/* Todo toggle */}
        {!done && (
          <button
            onClick={onToggleTodo}
            title={inTodo ? 'Remove from todo board' : 'Add to todo board'}
            className={`transition-colors ${inTodo ? 'text-accent' : 'text-muted-foreground hover:text-accent'}`}
          >
            <ListTodo className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Team assignment */}
        {!done && (
          <div className="relative">
            {!assignedMember ? (
              <button
                onClick={() => setShowAssign((v) => !v)}
                className="text-muted-foreground hover:text-accent transition-colors"
                title="Assign to team member"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {showAssign && (
              <div className="absolute right-0 top-6 z-50 w-44 rounded-lg border border-border bg-card shadow-xl py-1">
                {teamMembers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No team members yet</p>
                ) : (
                  teamMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onAssign(m.id); setShowAssign(false) }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      {m.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {!task.asana_id && !done && (
          <button onClick={onPushToAsana} className="text-muted-foreground hover:text-accent" title="Push to Asana">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={onDelete} className="text-muted-foreground hover:text-red-400 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function CategoryEditor({
  task,
  allCategories,
  onSave,
  onCancel,
}: {
  task: Task
  allCategories: string[]
  onSave: (category: string | null, context: string) => void
  onCancel: () => void
}) {
  const [category, setCategory] = useState(task.category ?? '')
  const [context, setContext] = useState('')
  const [isNew, setIsNew] = useState(false)

  const handleSave = () => {
    onSave(category.trim() || null, context.trim())
  }

  return (
    <div className="px-4 py-3 bg-muted/20 space-y-2">
      <p className="text-xs text-muted-foreground truncate">↳ {task.title}</p>
      <div className="flex gap-2">
        {isNew ? (
          <input
            autoFocus
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="New category name…"
            className="flex-1 rounded border border-border bg-muted px-2 py-1.5 text-sm outline-none focus:border-accent/50"
          />
        ) : (
          <select
            value={category}
            onChange={(e) => {
              if (e.target.value === '__new__') { setIsNew(true); setCategory('') }
              else setCategory(e.target.value)
            }}
            className="flex-1 rounded border border-border bg-muted px-2 py-1.5 text-sm text-foreground outline-none"
          >
            <option value="">Unsorted</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__new__">+ New category…</option>
          </select>
        )}
      </div>
      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Why does this go here? (helps Claude learn)"
        className="w-full rounded border border-border bg-muted px-2 py-1.5 text-sm outline-none focus:border-accent/50 text-muted-foreground placeholder:text-muted-foreground/40"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
