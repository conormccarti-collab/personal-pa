'use client'

import { useEffect, useState } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'
import { Loader2, RefreshCw, CalendarClock, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { DayPlan, WeeklyPlanData } from '@/lib/ai/claude'
import { createClient } from '@/lib/supabase/client'

const DAY_KEYS: (keyof WeeklyPlanData)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

export default function PlanPage() {
  const [plan, setPlan] = useState<WeeklyPlanData | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const supabase = createClient()

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekStartStr = monday.toISOString().slice(0, 10)

  const load = async () => {
    const { data } = await supabase
      .from('weekly_plans')
      .select('plan, generated_at')
      .eq('week_start', weekStartStr)
      .maybeSingle()

    if (data?.plan) {
      setPlan(data.plan as WeeklyPlanData)
      setGeneratedAt(data.generated_at)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/generate-weekly-plan', { method: 'POST' })
      const data = await res.json()
      if (data.plan) {
        setPlan(data.plan)
        setGeneratedAt(new Date().toISOString())
      }
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Week Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(monday, 'MMM d')} – {format(addDays(monday, 4), 'MMM d, yyyy')}
            {generatedAt && (
              <span className="ml-2 text-muted-foreground/50">
                · Generated {format(new Date(generatedAt), 'EEE h:mma')}
              </span>
            )}
          </p>
        </div>
        <Button onClick={generate} disabled={generating} variant="outline" size="sm" className="gap-2 shrink-0">
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : <><RefreshCw className="h-4 w-4" /> {plan ? 'Regenerate' : 'Generate plan'}</>
          }
        </Button>
      </div>

      {!plan ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mb-4">No plan for this week yet.</p>
            <Button onClick={generate} disabled={generating} size="sm">
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate this week&apos;s plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {DAY_KEYS.map((day) => {
            const dayPlan: DayPlan = plan[day]
            if (!dayPlan) return null
            const isToday = dayPlan.date === format(new Date(), 'EEEE MMM d')
            return (
              <Card key={day} className={`overflow-hidden ${isToday ? 'ring-1 ring-accent/50' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold capitalize">{day}</p>
                    {isToday && <span className="text-[10px] font-medium text-accent bg-accent/10 rounded-full px-2 py-0.5">Today</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{dayPlan.date}</p>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {/* Focus */}
                  <p className="text-xs italic text-accent/80 leading-relaxed">{dayPlan.focus}</p>

                  {/* Tasks */}
                  {dayPlan.tasks?.length > 0 && (
                    <div className="space-y-2">
                      {dayPlan.tasks.map((task, i) => (
                        <div key={i} className="rounded-md bg-muted/30 px-2.5 py-2">
                          <p className="text-xs font-medium leading-snug">{task.title}</p>
                          <div className="mt-1 flex items-center gap-2">
                            {task.estimated_hours > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                {task.estimated_hours}h
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/60 leading-tight">{task.why}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {dayPlan.notes && (
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{dayPlan.notes}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
