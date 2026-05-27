import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { subDays, startOfWeek, getDay } from 'date-fns'

export interface IntelligenceData {
  overdueTasks: { id: string; title: string; due_date: string; priority: string }[]
  staleTasks: { id: string; title: string; updated_at: string; priority: string }[]
  completedThisWeek: number
  highPriorityPending: number
  totalPending: number
  nudges: string[]
}

export async function GET() {
  const supabase = await createClient()
  const today = new Date()
  const todayDate = today.toISOString().slice(0, 10)
  const staleThreshold = subDays(today, 7).toISOString()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }).toISOString()
  const dayOfWeek = getDay(today) // 0=Sun, 5=Fri

  const [overdueRes, staleRes, doneThisWeekRes, pendingRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, due_date, priority')
      .in('status', ['todo', 'in_progress'])
      .not('due_date', 'is', null)
      .lt('due_date', todayDate)
      .order('due_date')
      .limit(10),
    supabase
      .from('tasks')
      .select('id, title, updated_at, priority')
      .in('status', ['todo', 'in_progress'])
      .lt('updated_at', staleThreshold)
      .order('updated_at')
      .limit(10),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'done')
      .gte('updated_at', weekStart),
    supabase
      .from('tasks')
      .select('id, priority')
      .in('status', ['todo', 'in_progress']),
  ])

  const overdueTasks = (overdueRes.data ?? []) as IntelligenceData['overdueTasks']
  const staleTasks = (staleRes.data ?? []) as IntelligenceData['staleTasks']
  const completedThisWeek = doneThisWeekRes.count ?? 0
  const pending = pendingRes.data ?? []
  const highPriorityPending = pending.filter((t) => t.priority === 'high').length
  const totalPending = pending.length

  // Compute nudges
  const nudges: string[] = []

  if (overdueTasks.length > 0) {
    nudges.push(
      `${overdueTasks.length} task${overdueTasks.length > 1 ? 's are' : ' is'} past due date`
    )
  }

  if (staleTasks.length > 0) {
    nudges.push(
      `${staleTasks.length} task${staleTasks.length > 1 ? 's have' : ' has'} had no movement in 7+ days`
    )
  }

  if (highPriorityPending > 2) {
    nudges.push(`${highPriorityPending} high-priority tasks still waiting`)
  }

  if (completedThisWeek === 0 && dayOfWeek >= 3) {
    // Wed–Sun: nudge if nothing done this week yet
    nudges.push("Nothing completed this week yet — a good day to clear something")
  } else if (completedThisWeek > 0) {
    nudges.push(
      `${completedThisWeek} task${completedThisWeek > 1 ? 's' : ''} completed this week`
    )
  }

  const data: IntelligenceData = {
    overdueTasks,
    staleTasks,
    completedThisWeek,
    highPriorityPending,
    totalPending,
    nudges,
  }

  return NextResponse.json(data)
}
