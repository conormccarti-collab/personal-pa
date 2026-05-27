'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, CheckCircle2, TrendingUp, X } from 'lucide-react'
import type { IntelligenceData } from '@/app/api/intelligence/route'

type Alert = {
  id: string
  icon: React.ReactNode
  message: string
  variant: 'error' | 'warning' | 'success' | 'info'
}

const VARIANT_STYLES: Record<Alert['variant'], string> = {
  error:   'border-destructive/20 bg-destructive/5 text-destructive',
  warning: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  success: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  info:    'border-border bg-muted/30 text-muted-foreground',
}

export function IntelligenceAlerts() {
  const [data, setData] = useState<IntelligenceData | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/intelligence')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) return null

  const alerts: Alert[] = []

  if (data.overdueTasks.length > 0) {
    alerts.push({
      id: 'overdue',
      icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
      message:
        data.overdueTasks.length === 1
          ? `"${data.overdueTasks[0].title}" is past its due date`
          : `${data.overdueTasks.length} tasks are past their due date`,
      variant: 'error',
    })
  }

  if (data.staleTasks.length > 0) {
    alerts.push({
      id: 'stale',
      icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
      message:
        data.staleTasks.length === 1
          ? `"${data.staleTasks[0].title}" hasn't moved in 7+ days`
          : `${data.staleTasks.length} tasks haven't moved in 7+ days`,
      variant: 'warning',
    })
  }

  if (data.completedThisWeek > 0) {
    alerts.push({
      id: 'completed',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
      message: `${data.completedThisWeek} task${data.completedThisWeek > 1 ? 's' : ''} completed this week`,
      variant: 'success',
    })
  }

  if (data.highPriorityPending > 2) {
    alerts.push({
      id: 'high-priority',
      icon: <TrendingUp className="h-3.5 w-3.5 shrink-0" />,
      message: `${data.highPriorityPending} high-priority tasks still waiting`,
      variant: 'info',
    })
  }

  const visible = alerts.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {visible.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${VARIANT_STYLES[alert.variant]}`}
        >
          {alert.icon}
          <span className="flex-1">{alert.message}</span>
          <button
            onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}
            className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
