'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CheckSquare, Lightbulb, Camera, CalendarDays, Loader2, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SearchResult } from '@/app/api/search/route'

const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
  task:    <CheckSquare  className="h-3.5 w-3.5" />,
  idea:    <Lightbulb   className="h-3.5 w-3.5" />,
  shoot:   <Camera      className="h-3.5 w-3.5" />,
  content: <CalendarDays className="h-3.5 w-3.5" />,
}

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  task:    'Task',
  idea:    'Idea',
  shoot:   'Shoot',
  content: 'Content',
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function SearchPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 200)

  // ── Keyboard shortcut ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setCursor(0)
    }
  }, [open])

  // ── Search ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? [])
        setCursor(0)
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  // ── Navigate result ─────────────────────────────────────────────────────────
  const navigate = useCallback((result: SearchResult) => {
    router.push(result.href)
    setOpen(false)
  }, [router])

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[cursor]) navigate(results[cursor])
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-slide-up">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {loading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, ideas, shoots, content…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          )}

          {query.length < 2 && (
            <div className="py-8 text-center text-xs text-muted-foreground/60">
              Type at least 2 characters to search
            </div>
          )}

          {results.length > 0 && (
            <div className="py-1">
              {results.map((result, idx) => (
                <button
                  key={result.id}
                  data-idx={idx}
                  onClick={() => navigate(result)}
                  onMouseEnter={() => setCursor(idx)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    cursor === idx ? 'bg-accent/10' : 'hover:bg-muted/40',
                  )}
                >
                  {/* Type icon */}
                  <span className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                    cursor === idx ? 'bg-accent/20 text-accent' : 'bg-muted',
                  )}>
                    {TYPE_ICON[result.type]}
                  </span>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{result.title}</p>
                    {result.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                    )}
                  </div>

                  {/* Type badge + enter hint */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground/50">{TYPE_LABEL[result.type]}</span>
                    {cursor === idx && (
                      <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground/50">
          <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-border px-1">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
