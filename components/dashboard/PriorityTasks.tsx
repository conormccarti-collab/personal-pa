'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDueDate, cn } from '@/lib/utils'
import { CheckCircle2, Circle, Loader2, Wand2 } from 'lucide-react'
import type { Task } from '@/types'

interface Props {
  tasks: Task[]
}

export function PriorityTasks({ tasks: initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [instruction, setInstruction] = useState('')
  const [reprioritising, setReprioritising] = useState(false)
  const [showInstruction, setShowInstruction] = useState(false)

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
      setInstruction('')
      setShowInstruction(false)
    } finally {
      setReprioritising(false)
    }
  }

  const active = tasks.filter((t) => t.status !== 'done').slice(0, 6)
  const done = tasks.filter((t) => t.status === 'done').slice(0, 3)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>Today&apos;s Focus</CardTitle>
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

      <CardContent className="space-y-1 pt-0">
        {active.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing on the list. Enjoy the quiet.
          </p>
        )}

        {active.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} />
        ))}

        {done.length > 0 && (
          <>
            <div className="border-t border-border pt-2 mt-3" />
            {done.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} done />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TaskRow({
  task,
  onToggle,
  done = false,
}: {
  task: Task
  onToggle: () => void
  done?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50',
        done && 'opacity-40'
      )}
    >
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-muted-foreground hover:text-accent">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', done && 'line-through')}>{task.title}</p>
        {task.due_date && !done && (
          <p className="mt-0.5 text-xs text-muted-foreground">{formatDueDate(task.due_date)}</p>
        )}
      </div>
      <Badge variant={task.priority}>{task.priority}</Badge>
    </div>
  )
}
