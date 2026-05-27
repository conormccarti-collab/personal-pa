'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Zap, Loader2 } from 'lucide-react'
import type { CostSummary } from '@/app/api/costs/route'

const MODEL_SHORT: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-sonnet-4-6':         'Sonnet',
  'claude-opus-4-7':           'Opus',
}

const ENDPOINT_LABEL: Record<string, string> = {
  morning_brief:    'Morning brief',
  weekly_review:    'Weekly review',
  categorise:       'Categorise tasks',
  categorise_todo:  'Categorise board',
  import_shoots:    'Import shoots',
  plan_week:        'Plan week',
  just_three:       'Just 3 today',
  breakdown_task:   'Task breakdown',
  reprioritise:     'Reprioritise',
  develop_idea:     'Develop idea',
  auto_tag_idea:    'Tag idea',
  ocr:              'OCR',
  shoot_prep:       'Shoot prep',
  cron_categorise:  'Auto-categorise',
  cron_shoot_detect:'Shoot detection',
}

function fmt(usd: number) {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

// Monthly fixed costs (update if your plan changes)
const FIXED_COSTS = [
  { label: 'Vercel',   usd: 0,  note: 'Hobby (free)' },
  { label: 'Supabase', usd: 0,  note: 'Free tier' },
  { label: 'Google',   usd: 0,  note: 'Within free limits' },
]

export function CostTracker() {
  const [data, setData]       = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    fetch('/api/costs')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalMonthly = (data?.thisMonth ?? 0) + FIXED_COSTS.reduce((s, c) => s + c.usd, 0)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">App running costs</span>
        </div>
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-sm font-semibold tabular-nums">
              {fmt(totalMonthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span>
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {loading || !data ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading usage data…
            </div>
          ) : (
            <>
              {/* Monthly summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'This month', value: fmt(data.thisMonth) },
                  { label: 'Last month',  value: fmt(data.lastMonth) },
                  { label: 'All time',    value: fmt(data.allTime) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-muted/40 px-3 py-2 text-center">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* Fixed costs */}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Infrastructure</p>
                <div className="space-y-1">
                  {FIXED_COSTS.map((c) => (
                    <div key={c.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/60">{c.note}</span>
                        <span className="tabular-nums font-medium">{c.usd === 0 ? 'Free' : fmt(c.usd)}</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm border-t border-border/50 pt-1 mt-1">
                    <span className="text-muted-foreground">Claude API</span>
                    <span className="tabular-nums font-medium">{fmt(data.thisMonth)}</span>
                  </div>
                </div>
              </div>

              {/* AI breakdown toggle */}
              {data.totalCalls > 0 && (
                <div>
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {data.totalCalls} API calls — breakdown
                  </button>

                  {showBreakdown && (
                    <div className="mt-2 space-y-3">
                      {/* By model */}
                      <div>
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">By model</p>
                        <div className="space-y-1">
                          {data.byModel.map((m) => (
                            <div key={m.model} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {MODEL_SHORT[m.model] ?? m.model}
                                <span className="ml-1 text-muted-foreground/50">({m.calls} calls · {(m.inputTokens + m.outputTokens).toLocaleString()} tok)</span>
                              </span>
                              <span className="tabular-nums">{fmt(m.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* By feature */}
                      <div>
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">By feature</p>
                        <div className="space-y-1">
                          {data.byEndpoint.map((e) => (
                            <div key={e.endpoint} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {ENDPOINT_LABEL[e.endpoint] ?? e.endpoint}
                                <span className="ml-1 text-muted-foreground/50">({e.calls}×)</span>
                              </span>
                              <span className="tabular-nums">{fmt(e.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {data.totalCalls === 0 && (
                <p className="text-xs text-muted-foreground/60 italic">
                  No API calls logged yet — costs will appear here after using AI features.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
