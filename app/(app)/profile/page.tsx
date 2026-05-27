'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2 } from 'lucide-react'
import type { Profile } from '@/types'

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

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .maybeSingle()                          // won't error on 0 rows
      .then(({ data, error }) => {
        if (error) console.error('[ProfilePage] load error:', error)
        if (data)  setProfile(data as Profile)
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    </div>
  )
}
