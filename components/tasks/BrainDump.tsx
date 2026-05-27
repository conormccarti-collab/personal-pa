'use client'

import { useEffect, useRef, useState } from 'react'
import { Brain, X, Check, Loader2 } from 'lucide-react'

type SaveStatus = 'idle' | 'saving' | 'saved'

export function BrainDump() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [hasContent, setHasContent] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Load existing context on mount
  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        const ctx = data?.ai_context ?? ''
        setText(ctx)
        setHasContent(!!ctx.trim())
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    // Small delay so the open-click doesn't immediately close
    const id = setTimeout(() => window.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', handler)
    }
  }, [open])

  const save = (value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setStatus('saving')
    saveTimer.current = setTimeout(async () => {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_context: value }),
      })
      setStatus('saved')
      setHasContent(!!value.trim())
      setTimeout(() => setStatus('idle'), 2000)
    }, 800)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    save(e.target.value)
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">AI Context</span>
            </div>
            <div className="flex items-center gap-2">
              {status === 'saving' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {status === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-3">
            <textarea
              autoFocus={loaded}
              value={text}
              onChange={handleChange}
              placeholder={`Dump context here — what's going on, priorities, blockers, constraints…\n\nClaude reads this before sorting and prioritising your tasks.`}
              rows={10}
              className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 leading-relaxed"
            />
          </div>

          {/* Footer tip */}
          <div className="px-4 pb-3">
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
              Feeds into AI Sort, Reprioritise, and the morning briefing. Plain language is fine.
            </p>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="AI context brain dump"
        className={`
          relative flex h-11 w-11 items-center justify-center rounded-full shadow-lg
          transition-all duration-200 hover:scale-110
          ${open
            ? 'bg-accent text-white'
            : 'bg-card border border-border text-accent hover:border-accent/50'
          }
        `}
      >
        <Brain className="h-5 w-5" />
        {/* Dot indicator when context exists */}
        {hasContent && !open && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent border-2 border-background" />
        )}
      </button>
    </div>
  )
}
