'use client'

import { useState } from 'react'
import { Loader2, Target, ChevronDown, ChevronUp, Zap, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface Pick {
  id: string
  title: string
  reason: string
}

export function JustThreeToday() {
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [generated, setGenerated] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/just-three')
      const data = await res.json()
      setPicks(data.tasks ?? [])
      setOpen(true)
      setGenerated(true)
    } catch {
      setPicks([])
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = () => {
    if (!generated) {
      generate()
    } else {
      setOpen((v) => !v)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Just 3 today</span>
          <span className="text-xs text-muted-foreground">— cut through the noise</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!loading && (
            open
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Picking your three…
            </div>
          ) : picks.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              No active tasks to pick from.
            </p>
          ) : (
            <div>
              {picks.map((pick, i) => (
                <div
                  key={pick.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{pick.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{pick.reason}</p>
                  </div>
                  <Link href={`/focus?taskId=${pick.id}`} className="shrink-0">
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-accent hover:bg-accent/10">
                      <Zap className="h-3 w-3" />
                      Focus
                    </Button>
                  </Link>
                </div>
              ))}
              <div className="flex justify-end px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                  disabled={loading}
                  onClick={generate}
                >
                  <RefreshCw className="h-3 w-3" />
                  Repick
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
