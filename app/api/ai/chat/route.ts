import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateChatReply } from '@/lib/ai/claude'
import { format, startOfDay } from 'date-fns'
import { getProjectTasks } from '@/lib/asana'

const PROJECT_GID = '1202651230977728'

export async function POST(req: NextRequest) {
  const { message, history = [] } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  const supabase = await createClient()
  const today = new Date()

  const [tasksRes, profileRes, riskAlertRes, capturesRes, ideasRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, status, due_date, category')
      .in('status', ['todo', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(25),
    supabase.from('profiles').select('*').maybeSingle(),
    supabase
      .from('notifications')
      .select('body, data')
      .eq('type', 'risk_alert')
      .gte('created_at', startOfDay(today).toISOString())
      .maybeSingle(),
    supabase
      .from('captures')
      .select('content, created_at')
      .eq('status', 'inbox')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('ideas')
      .select('title, created_at')
      .is('brief', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const tasks    = tasksRes.data ?? []
  const profile  = profileRes.data
  const riskAlert = riskAlertRes.data
  const captures = capturesRes.data ?? []
  const ideas    = ideasRes.data ?? []

  // Get team workload from Asana
  let teamSummary = 'Not available'
  try {
    const allTasks = await getProjectTasks(PROJECT_GID)
    const memberCounts: Record<string, number> = {}
    for (const t of allTasks) {
      if (!t.completed && t.assignee?.name) {
        memberCounts[t.assignee.name] = (memberCounts[t.assignee.name] ?? 0) + 1
      }
    }
    teamSummary = Object.entries(memberCounts)
      .map(([name, count]) => `${name}: ${count} tasks`)
      .join(', ') || 'No assigned tasks'
  } catch { /* Asana unavailable */ }

  const profileText = profile
    ? [profile.name, profile.role, profile.priorities].filter(Boolean).join(' — ')
    : 'No profile set'

  const taskLines = tasks.map(t =>
    `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}${t.category ? ` [${t.category}]` : ''}`
  ).join('\n')

  const systemPrompt = `You are ${profile?.name ?? 'Conor'}'s personal assistant. You have full visibility of their tasks, risks, team, and recent captures. Answer directly and conversationally — no lists unless asked, no filler, no "great question". Give specific recommendations with clear reasoning.

Today: ${format(today, 'EEEE, MMMM d yyyy')}
About me: ${profileText}

Active tasks (${tasks.length}):
${taskLines || 'None'}

Risk flags today: ${riskAlert?.body ?? 'None'}
Team workload: ${teamSummary}
Unprocessed inbox: ${captures.map(c => `"${c.content.slice(0, 60)}"`).join(', ') || 'Empty'}
Ideas awaiting development: ${ideas.map(i => `"${i.title}"`).join(', ') || 'None'}

Answer based on this data. If something is genuinely unknown, say so briefly.`

  const reply = await generateChatReply({
    systemPrompt,
    history: history.slice(-6),
    message: message.trim(),
  })

  return NextResponse.json({ reply })
}
