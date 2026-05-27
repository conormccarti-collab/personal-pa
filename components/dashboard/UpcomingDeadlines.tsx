'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDueDate } from '@/lib/utils'
import { CheckCircle2, Circle, Loader2, Wand2, ListTodo } from 'lucide-react'
import { isToday, isThisWeek, isPast, parseISO } from 'date-fns'
import { getBrandColor } from '@/lib/brand-colors'
import type { Task } from '@/types'

interface Props {
  tasks: Task[]
}

type Group = { label: string; tasks: Task[]; accent?: string }

export function UpcomingDeadlines({ tasks: initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [instruction, setInstruction] = useState('')
  const [reprioritising, setReprioritising] = useState(false)
  const [showInstruction, setShowInstruction] = useState(false)
  const [addingTodo, setAddingTodo] = useState<string | null>(null)

  const toggle = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  const reprioritise = async () => {
    if (!instruction.trim()) return
    setReprioritising(true)
    try {
      const res = await fetch('/api/ai/prioritise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, tasks }),
      })
      const { changes } = await res.json()
      if (changes?.length) {
        setTasks((prev) =>
          prev.map((t) => {
            const change = changes.find((c: { id: string; priority: string }) => c.id === t.id)
            return change ? { ...t, priority: change.priority as Task['priority'] } : t
          })
        )
      }
    } finally {
      setReprioritising(false)
      setInstruction('')
      setShowInstruction(false)
    }
  }

  const addToTodo = async (task: Task) => {
    setAddingTodo(task.id)
    await fetch('/api/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        task_id: task.id,
        section: 'today',
        estimated_hours: task.estimated_hours,
      }),
    })
    setAddingTodo(null)
  }

  const active = tasks.filter((t) => t.status !== 'done' && t.due_date)
  const noDue = tasks.filter((t) => t.status !== 'done' && !t.due_date)

  const groups: Group[] = [
    {
      label: 'Overdue',
      accent: 'text-red-400',
      tasks: active.filter((t) => isPast(parseISO(t.due_date!)) && !isToday(parseISO(t.due_date!))),
    },
    {
      label: 'Due today',
      accent: 'text-amber-400',
      tasks: active.filter((t) => isToday(parseISO(t.due_date!))),
    },
    {
      label: 'This week',
      tasks: active.filter(
        (t) => isThisWeek(parseISO(t.due_date!), { weekStartsOn: 1 }) && !isToday(parseISO(t.due_date!)) && !isPast(parseISO(t.due_date!))
      ),
    },
    {
      label: 'Coming up',
      tasks: active.filter(
        (t) => !isThisWeek(parseISO(t.due_date!), { weekStartsOn: 1 }) && !isPast(parseISO(t.due_date!))
      ),
    },
  ].filter((g) => g.tasks.length > 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>Upcoming Deadlines</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowInstruction(!showInstruction)}
          className="gap-1.5 text-xs"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Reprioritise
        </Button>
      </CardHeader>

      {showInstruction && (
        <div className="mx-5 mb-3 flex gap-2">
          <input
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && reprioritise()}
            placeholder='e.g. "clear my plate this week except the Arran edit"'
            className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
          <Button size="sm" onClick={reprioritise} disabled={reprioritising || !instruction.trim()}>
            {reprioritising ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </Button>
        </div>
      )}

      <CardContent className="pt-0 space-y-4">
        {groups.length === 0 && noDue.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No upcoming deadlines.</p>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            <p className={`mb-1.5 text-xs font-medium uppercase tracking-wider ${group.accent ?? 'text-muted-foreground/60'}`}>
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.tasks.map((task) => (
                <DeadlineRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggle(task)}
                  onAddToTodo={() => addToTodo(task)}
                  addingTodo={addingTodo === task.id}
                />
              ))}
            </div>
          </div>
        ))}

        {noDue.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/40">
              No date
            </p>
            <div className="space-y-0.5">
              {noDue.slice(0, 3).map((task) => (
                <DeadlineRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggle(task)}
                  onAddToTodo={() => addToTodo(task)}
                  addingTodo={addingTodo === task.id}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DeadlineRow({
  task,
  onToggle,
  onAddToTodo,
  addingTodo,
}: {
  task: Task
  onToggle: () => void
  onAddToTodo: () => void
  addingTodo: boolean
}) {
  const brandColor = getBrandColor(task.project)

  return (
    <div
      className="group flex items-start gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
      style={brandColor ? { borderLeft: `3px solid ${brandColor}`, paddingLeft: '0.375rem' } : {}}
    >
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-muted-foreground hover:text-accent">
        {task.status === 'done' ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">{task.title}</p>
        <div className="flex items-center gap-2">
          {task.due_date && (
            <p className="text-xs text-muted-foreground">{formatDueDate(task.due_date)}</p>
          )}
          {task.category && (
            <p className="text-xs text-muted-foreground/50">{task.category}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant={task.priority}>{task.priority}</Badge>
        <button
          onClick={onAddToTodo}
          disabled={addingTodo}
          title="Add to todo list"
          className="text-muted-foreground hover:text-accent transition-colors"
        >
          {addingTodo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListTodo className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}
