import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron'
import { getProjectTasks } from '@/lib/asana'
import { format, subDays } from 'date-fns'

const PROJECT_GID = '1202651230977728'

export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const supabase = await createClient()
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const staleThreshold = subDays(today, 5).toISOString()
  const urgentThreshold = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // 3 days from now

  const [overdueRes, staleRes, shootsRes] = await Promise.all([
    // Overdue tasks
    supabase
      .from('tasks')
      .select('id, title, due_date, priority')
      .in('status', ['todo', 'in_progress'])
      .not('due_date', 'is', null)
      .lt('due_date', todayStr)
      .order('due_date', { ascending: true })
      .limit(10),

    // High/medium priority tasks with no movement in 5+ days AND deadline within 3 days
    supabase
      .from('tasks')
      .select('id, title, due_date, updated_at, priority')
      .in('status', ['todo', 'in_progress'])
      .in('priority', ['high', 'medium'])
      .lt('updated_at', staleThreshold)
      .not('due_date', 'is', null)
      .lte('due_date', urgentThreshold)
      .order('due_date', { ascending: true })
      .limit(10),

    // Shoots in the next 7 days
    supabase
      .from('shoots')
      .select('id, title, start_date, shoot_type')
      .neq('status', 'cancelled')
      .gte('start_date', todayStr)
      .lte('start_date', new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('start_date', { ascending: true }),
  ])

  const overdueTasks    = overdueRes.data ?? []
  const staleTasks      = staleRes.data ?? []
  const upcomingShoots  = shootsRes.data ?? []

  // Check team overload via Asana
  let overloadedMembers: { name: string; taskCount: number }[] = []
  try {
    const allTasks = await getProjectTasks(PROJECT_GID)
    const memberCounts: Record<string, number> = {}
    for (const t of allTasks) {
      if (!t.completed && t.assignee?.name) {
        memberCounts[t.assignee.name] = (memberCounts[t.assignee.name] ?? 0) + 1
      }
    }
    overloadedMembers = Object.entries(memberCounts)
      .filter(([, count]) => count >= 7)
      .map(([name, taskCount]) => ({ name, taskCount }))
  } catch { /* Asana unavailable — skip */ }

  // Build risk summary
  const riskLines: string[] = []
  if (overdueTasks.length > 0)
    riskLines.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}: ${overdueTasks.slice(0, 2).map(t => `"${t.title}"`).join(', ')}`)
  if (staleTasks.length > 0)
    riskLines.push(`${staleTasks.length} task${staleTasks.length > 1 ? 's' : ''} stalled near deadline: ${staleTasks.slice(0, 2).map(t => `"${t.title}" (due ${t.due_date})`).join(', ')}`)
  if (upcomingShoots.length > 0)
    riskLines.push(`${upcomingShoots.length} shoot${upcomingShoots.length > 1 ? 's' : ''} in the next 7 days: ${upcomingShoots.map(s => `${s.title} on ${format(new Date(s.start_date), 'EEE MMM d')}`).join(', ')}`)
  if (overloadedMembers.length > 0)
    riskLines.push(`Overloaded: ${overloadedMembers.map(m => `${m.name} (${m.taskCount} tasks)`).join(', ')}`)

  const totalRisks = overdueTasks.length + staleTasks.length + overloadedMembers.length
  const plainSummary = riskLines.join('. ')

  if (totalRisks > 0 || upcomingShoots.length > 0) {
    await supabase.from('notifications').upsert(
      {
        type:  'risk_alert',
        title: `${totalRisks} risk${totalRisks !== 1 ? 's' : ''} flagged`,
        body:  plainSummary || 'No critical risks today.',
        data:  {
          overdue_tasks:     overdueTasks,
          stale_tasks:       staleTasks,
          upcoming_shoots:   upcomingShoots,
          overloaded_members: overloadedMembers,
        },
        read: false,
      },
      { onConflict: 'type,day', ignoreDuplicates: false }
    )
  }

  return NextResponse.json({ ok: true, risks: totalRisks, shoots: upcomingShoots.length })
}
