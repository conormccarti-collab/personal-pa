import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'

type Section = 'today' | 'tomorrow' | 'next_fortnight'

// Fortnight board: 1 unit = 1 day column = 30 stored minutes
function durationFromSection(sectionName: string | null, estimatedHours: number | null): number {
  if (sectionName) {
    const s = sectionName.toLowerCase()
    if (s.includes('edit') && !s.includes('pre-edit') && !s.includes('pre edit') && !s.includes('review')) return 10 * 30 // 2 weeks
    if (s.includes('planning') || s.includes('pre-production') || s.includes('pre production')) return 2 * 30
    if (s.includes('pre-edit') || s.includes('pre edit') || s.includes('brief')) return 1 * 30
    if (s.includes('review')) return 2 * 30
  }
  if (estimatedHours) return Math.min(480, Math.round(estimatedHours * 60))
  return 30
}

// Assign a color based on Asana section so the AI doesn't guess wrong
function colorFromSection(sectionName: string | null): string | null {
  if (!sectionName) return null
  const s = sectionName.toLowerCase()
  if (s.includes('edit') && !s.includes('pre-edit') && !s.includes('pre edit') && !s.includes('review')) return '#7c3aed' // Editing Video
  if (s.includes('planning') || s.includes('pre-production') || s.includes('pre production')) return '#b45309' // Pre-production
  if (s.includes('pre-edit') || s.includes('pre edit') || s.includes('brief')) return '#b45309' // Pre-production
  if (s.includes('review')) return '#b45309' // Pre-production
  if (s.includes('shoot') || s.includes('filming')) return '#c2410c' // Shoot
  if (s.includes('idea') || s.includes('ideation')) return '#059669' // Ideation
  return null
}

function sectionFromDueDate(dueDate: string | null): Section | null {
  if (!dueDate) return null
  const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()))
  if (days <= 0)  return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 14) return 'next_fortnight'
  return null
}

export async function POST() {
  const supabase = await createClient()

  const { data: linked } = await supabase
    .from('todo_items')
    .select('id, task_id, duration_minutes, color')
    .not('task_id', 'is', null)

  const linkedMap = new Map(
    (linked ?? []).map((r) => [
      r.task_id as string,
      { id: r.id as string, duration: r.duration_minutes as number, color: r.color as string | null },
    ])
  )

  const { data: tasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, title, due_date, estimated_hours, asana_section')
    .not('status', 'in', '("done","archived")')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })
  if (!tasks?.length) return NextResponse.json({ created: [], updatedItems: [] })

  // Update existing linked items that still have default duration (30) or no color
  const toUpdate = tasks.filter((t) => {
    const existing = linkedMap.get(t.id)
    if (!existing) return false
    const newDuration = durationFromSection(t.asana_section, t.estimated_hours)
    const newColor = colorFromSection(t.asana_section)
    return (existing.duration === 30 && newDuration !== 30) ||
           (!existing.color && newColor)
  })

  const updatedItems: { id: string; duration_minutes: number; color?: string }[] = []
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((t) => {
        const existing = linkedMap.get(t.id)!
        const duration_minutes = durationFromSection(t.asana_section, t.estimated_hours)
        const color = colorFromSection(t.asana_section)
        const patch: Record<string, unknown> = {}
        if (existing.duration === 30 && duration_minutes !== 30) patch.duration_minutes = duration_minutes
        if (!existing.color && color) patch.color = color
        if (!Object.keys(patch).length) return Promise.resolve()
        updatedItems.push({ id: existing.id, duration_minutes: duration_minutes, ...(color ? { color } : {}) })
        return supabase.from('todo_items').update(patch).eq('id', existing.id)
      })
    )
  }

  // Create new todo_items for unlinked tasks
  const toCreate = tasks
    .filter((t) => !linkedMap.has(t.id))
    .flatMap((t) => {
      const section = sectionFromDueDate(t.due_date)
      if (!section) return []
      return [{
        task_id:          t.id,
        title:            t.title,
        section,
        origin:           'asana' as const,
        duration_minutes: durationFromSection(t.asana_section, t.estimated_hours),
        color:            colorFromSection(t.asana_section),
        completed:        false,
        sort_order:       0,
      }]
    })

  if (!toCreate.length) return NextResponse.json({ created: [], updatedItems })

  const { data: created, error } = await supabase
    .from('todo_items')
    .insert(toCreate)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ created: created ?? [], updatedItems })
}
