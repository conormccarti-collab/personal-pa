import { createClient } from '@/lib/supabase/server'
import { MorningBriefing } from '@/components/dashboard/MorningBriefing'
import { UpcomingDeadlines } from '@/components/dashboard/UpcomingDeadlines'
import { UpcomingItems } from '@/components/dashboard/UpcomingItems'
import { GanttChart } from '@/components/dashboard/GanttChart'
import { IntelligenceAlerts } from '@/components/dashboard/IntelligenceAlerts'
import { WeeklyReview } from '@/components/dashboard/WeeklyReview'
import { JustThreeToday } from '@/components/dashboard/JustThreeToday'
import { GoogleIntegration } from '@/components/dashboard/GoogleIntegration'
import { CostTracker } from '@/components/dashboard/CostTracker'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { startOfDay, endOfDay } from 'date-fns'
import type { Task, Meeting, FollowUp, Profile } from '@/types'

export const revalidate = 0

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date()
  const dayStart = startOfDay(today).toISOString()
  const dayEnd = endOfDay(today).toISOString()

  const [tasksRes, meetingsRes, followUpsRes, profileRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .in('status', ['todo', 'in_progress', 'done'])
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('meetings')
      .select('*')
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time'),
    supabase
      .from('follow_ups')
      .select('*')
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(8),
    supabase.from('profiles').select('*').single(),
  ])

  // Degrade gracefully — a single failed query shouldn't crash the page
  const tasks = (tasksRes.data ?? []) as Task[]
  const meetings = (meetingsRes.data ?? []) as Meeting[]
  const followUps = (followUpsRes.data ?? []) as FollowUp[]
  const profile = profileRes.data as Profile | null

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <ErrorBoundary label="Morning Briefing">
        <MorningBriefing profileName={profile?.name ?? ''} />
      </ErrorBoundary>

      <ErrorBoundary label="Intelligence Alerts">
        <IntelligenceAlerts />
      </ErrorBoundary>

      <ErrorBoundary label="Just 3 Today">
        <JustThreeToday />
      </ErrorBoundary>

      <div className="h-px bg-border" />

      <ErrorBoundary label="Upcoming Items">
        <UpcomingItems meetings={meetings} followUps={followUps} />
      </ErrorBoundary>

      <ErrorBoundary label="Gantt Chart">
        <GanttChart />
      </ErrorBoundary>

      <ErrorBoundary label="Upcoming Deadlines">
        <UpcomingDeadlines tasks={tasks} />
      </ErrorBoundary>

      <ErrorBoundary label="Weekly Review">
        <WeeklyReview />
      </ErrorBoundary>

      <ErrorBoundary label="Google Integration">
        <GoogleIntegration />
      </ErrorBoundary>

      <ErrorBoundary label="Cost Tracker">
        <CostTracker />
      </ErrorBoundary>
    </div>
  )
}
