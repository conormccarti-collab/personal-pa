'use client'

import { useState } from 'react'
import { getDay } from 'date-fns'
import { Sparkles, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WeeklyReview() {
  const [review, setReview] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const isFriday = getDay(new Date()) === 5

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/friday-review')
      const data = await res.json()
      setReview(data.review ?? '')
      setOpen(true)
    } catch {
      setReview('Could not generate review. Try again.')
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => {
          if (!review && !open) {
            generate()
          } else {
            setOpen((v) => !v)
          }
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Weekly Review</span>
          {isFriday && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
              Friday
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!loading && (open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {review ? (
            <>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{review}</p>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                  disabled={loading}
                  onClick={generate}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
            </>
          ) : loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reviewing your week…
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
