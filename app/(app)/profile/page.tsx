'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/types'
import type { CategoryRule } from '@/lib/category'

const fields = [
  { key: 'name',         label: 'Your name',                    placeholder: 'Conor McCarthy',                                                                                          rows: 1 },
  { key: 'role',         label: 'Role / title',                 placeholder: 'e.g. MD, Type Two Media',                                                                                 rows: 1 },
  { key: 'job_spec',     label: 'What you actually do',         placeholder: 'Describe your day-to-day responsibilities, the work that matters most, what success looks like for you…', rows: 4 },
  { key: 'working_style',label: 'Working style',                placeholder: 'How you like to work — deep work windows, communication style, energy patterns…',                          rows: 3 },
  { key: 'priorities',   label: 'Current priorities',           placeholder: 'What are you focused on right now? What should the AI treat as high stakes?',                             rows: 3 },
  { key: 'team_context', label: 'Team context',                 placeholder: 'Who is in your team, what they own, any dynamics worth knowing…',                                          rows: 3 },
  { key: 'ai_context',   label: 'Anything else the AI should know', placeholder: 'Clients, ongoing projects, things to avoid, tone preferences…',                                       rows: 4 },
] as const

type FieldKey = (typeof fields)[number]['key']

export default function ProfilePage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Partial<Profile>>({})
  const [loading, setLoading]   = useState(true)
  const [savingKey, setSavingKey] = useState<FieldKey | null>(null)
  const [savedKey,  setSavedKey]  = useState<FieldKey | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Category rules
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').maybeSingle(),
      fetch('/api/category-rules').then((r) => r.json()),
    ]).then(([profileRes, rulesData]) => {
      if (profileRes.error) console.error('[ProfilePage] load error:', profileRes.error)
      if (profileRes.data) setProfile(profileRes.data as Profile)
      setRules(Array.isArray(rulesData) ? rulesData : [])
      setLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addRule = async () => {
    if (!newKeyword.trim() || !newCategory.trim() || addingRule) return
    setAddingRule(true)
    const res = await fetch('/api/category-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: newKeyword.trim(), category: newCategory.trim(), sort_order: rules.length }),
    })
    const created = await res.json()
    if (created.id) { setRules((prev) => [...prev, created]); setNewKeyword(''); setNewCategory('') }
    setAddingRule(false)
  }

  const deleteRule = async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id))
    await fetch(`/api/category-rules/${id}`, { method: 'DELETE' })
  }

  // ── save a single field on blur ───────────────────────────────────────────
  const saveField = async (key: FieldKey) => {
    setSavingKey(key)

    let error: unknown = null

    if ((profile as Profile).id) {
      // Row already exists — update in place
      const { error: e } = await supabase
        .from('profiles')
        .update({ [key]: profile[key] ?? null, updated_at: new Date().toISOString() })
        .eq('id', (profile as Profile).id)
      error = e
    } else {
      // First save ever — insert and keep the generated id
      const { data, error: e } = await supabase
        .from('profiles')
        .insert({ name: '', role: '', ...profile, [key]: profile[key] ?? null, updated_at: new Date().toISOString() })
        .select()
        .single()
      error = e
      if (data) setProfile(data as Profile)
    }

    setSavingKey(null)

    if (error) {
      console.error(`[ProfilePage] save error (${key}):`, error)
      return
    }

    // Flash a saved indicator on the field
    setSavedKey(key)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedKey(null), 2000)
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Know Me</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Train the assistant on who you are. Fields save automatically when you click away.
        </p>
      </div>

      {/* Google Calendar connection */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-muted-foreground mt-0.5">Connect to show events in the calendar view</p>
          </div>
          <a
            href="/api/auth/google"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
          >
            Connect / Reconnect
          </a>
        </div>
      </div>

      <div className="space-y-6">
        {fields.map(({ key, label, placeholder, rows }) => {
          const isSaving = savingKey === key
          const isSaved  = savedKey  === key
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground">{label}</label>
                {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {isSaved  && <CheckCircle2 className="h-3 w-3 text-green-500" />}
              </div>
              <textarea
                rows={rows}
                value={(profile[key] as string) ?? ''}
                onChange={(e) => {
                  setProfile((prev) => ({ ...prev, [key]: e.target.value }))
                }}
                onBlur={() => saveField(key)}
                placeholder={placeholder}
                className="w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/60 focus:bg-muted/60 transition-colors"
              />
            </div>
          )
        })}
      </div>

      {/* Category rules */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Category Rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            If a task title or Asana section contains a keyword, it gets assigned that category automatically — overrides AI.
          </p>
        </div>

        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="flex-1 text-sm">
                  <span className="font-mono text-accent">{rule.keyword}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span>{rule.category}</span>
                </span>
                <button onClick={() => deleteRule(rule.id)} className="text-muted-foreground/40 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="keyword (e.g. drone)"
            className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRule()}
            placeholder="category (e.g. Shoot)"
            className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
          <Button onClick={addRule} disabled={!newKeyword.trim() || !newCategory.trim() || addingRule} size="sm">
            {addingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
