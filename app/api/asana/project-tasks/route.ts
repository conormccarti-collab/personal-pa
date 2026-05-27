import { NextResponse } from 'next/server'
import { getProjectTasks, type AsanaProjectTask } from '@/lib/asana'
import { parseISO, isPast, startOfDay } from 'date-fns'

const PROJECT_GID = '1202651230977728'

function sortTasks(tasks: AsanaProjectTask[]) {
  return [...tasks].sort((a, b) => {
    if (!a.due_on && !b.due_on) return 0
    if (!a.due_on) return 1
    if (!b.due_on) return -1
    return a.due_on.localeCompare(b.due_on)
  })
}

export async function GET() {
  try {
    const all = await getProjectTasks(PROJECT_GID)
    const active = all.filter((t) => !t.completed)

    const byAssignee: Record<string, { gid: string; name: string; tasks: AsanaProjectTask[] }> = {}
    const unassigned: AsanaProjectTask[] = []

    for (const task of active) {
      if (!task.assignee) {
        unassigned.push(task)
      } else {
        const key = task.assignee.gid
        if (!byAssignee[key]) {
          byAssignee[key] = { gid: key, name: task.assignee.name, tasks: [] }
        }
        byAssignee[key].tasks.push(task)
      }
    }

    const members = Object.values(byAssignee)
      .map((m) => ({ ...m, tasks: sortTasks(m.tasks) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const today = startOfDay(new Date()).toISOString().slice(0, 10)
    const overdueCount = (tasks: AsanaProjectTask[]) =>
      tasks.filter((t) => t.due_on && t.due_on < today).length

    return NextResponse.json({
      members: members.map((m) => ({ ...m, overdueCount: overdueCount(m.tasks) })),
      unassigned: sortTasks(unassigned),
      totalActive: active.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
