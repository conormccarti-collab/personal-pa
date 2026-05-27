'use client'

import { useEffect, useState } from 'react'
import { getGreeting } from '@/lib/utils'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'

interface Props {
  profileName: string
}

export function MorningBriefing({ profileName }: Props) {
  const [briefing, setBriefing] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ai/briefing')
      .then((r) => r.json())
      .then((data) => { setBriefing(data.briefing || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const now = new Date()

  return (
    <div className="animate-fade-in">
      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}{profileName ? `, ${profileName.split(' ')[0]}` : ''}
        </h1>
        <span className="text-sm text-muted-foreground">
          {format(now, "EEEE, d MMMM")}
        </span>
      </div>

      <div className="mt-4 min-h-[3rem]">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-sm">Getting your briefing…</span>
          </div>
        ) : briefing ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground animate-slide-up">
            {briefing}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60">
            Add tasks and meetings to get your daily briefing.
          </p>
        )}
      </div>
    </div>
  )
}
