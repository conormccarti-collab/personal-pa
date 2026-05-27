'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { Sparkles, Loader2, ChevronDown, ChevronUp, ListTodo, FolderPlus, ExternalLink } from 'lucide-react'
import type { Idea } from '@/types'

type DevelopFormat = 'brief' | 'action_plan' | 'explore'

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [developing, setDeveloping] = useState<string | null>(null)
  const [todoMap, setTodoMap] = useState<Map<string, string>>(new Map())
  const [newIdea, setNewIdea] = useState('')
  const [adding, setAdding] = useState(false)
  const [creatingProject, setCreatingProject] = useState<string | null>(null) // idea id
  const [projectLinks, setProjectLinks] = useState<Record<string, string>>({}) // idea id → asana url

  const supabase = createClient()

  const load = async () => {
    const [ideasResult, todoResult] = await Promise.all([
      supabase.from('ideas').select('*').order('created_at', { ascending: false }),
      supabase.from('todo_items').select('id, idea_id').not('idea_id', 'is', null),
    ])

    setIdeas((ideasResult.data as Idea[]) ?? [])

    const newTodoMap = new Map<string, string>()
    for (const item of (todoResult.data ?? [])) {
      if (item.idea_id) newTodoMap.set(item.idea_id, item.id)
    }
    setTodoMap(newTodoMap)
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addIdea = async () => {
    if (!newIdea.trim() || adding) return
    setAdding(true)
    const res = await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newIdea.trim(), content: newIdea.trim() }),
    })
    if (res.ok) {
      const created = await res.json()
      setIdeas((prev) => [created as Idea, ...prev])
      setNewIdea('')
    }
    setAdding(false)
  }

  const createProject = async (idea: Idea) => {
    setCreatingProject(idea.id)
    const res = await fetch('/api/asana/create-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: idea.title, notes: idea.content }),
    })
    const data = await res.json()
    if (data.permalink_url) {
      setProjectLinks((prev) => ({ ...prev, [idea.id]: data.permalink_url }))
    }
    setCreatingProject(null)
  }

  const develop = async (idea: Idea, fmt: DevelopFormat) => {
    setDeveloping(idea.id)
    const res = await fetch('/api/ai/develop-idea', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: idea.id, content: idea.content, format: fmt }),
    })
    const { result } = await res.json()
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === idea.id
          ? { ...i, [fmt === 'brief' ? 'brief' : 'expanded_content']: result }
          : i
      )
    )
    setExpanded(idea.id)
    setDeveloping(null)
  }

  const toggleTodo = async (idea: Idea) => {
    const existingId = todoMap.get(idea.id)
    if (existingId) {
      // Remove from todo
      setTodoMap((prev) => { const m = new Map(prev); m.delete(idea.id); return m })
      await fetch(`/api/todo/${existingId}`, { method: 'DELETE' })
    } else {
      // Add to next_two_months (ideas don't have due dates)
      const res = await fetch('/api/todo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          idea_id: idea.id,
          section: 'next_two_months',
        }),
      })
      const data = await res.json()
      if (data.id) setTodoMap((prev) => new Map([...prev, [idea.id, data.id]]))
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ideas Vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture ideas below — they land here and get auto-tagged.
        </p>
      </div>

      {/* Quick-add */}
      <div className="flex gap-2">
        <input
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addIdea()}
          placeholder="Drop an idea here…"
          disabled={adding}
          className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent/50 placeholder:text-muted-foreground/50"
        />
        <Button onClick={addIdea} disabled={!newIdea.trim() || adding} size="sm">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : ideas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No ideas yet. Capture one from the bar below — mark it as an idea to send it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => {
            const inTodo = todoMap.has(idea.id)
            return (
              <Card key={idea.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{idea.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {format(new Date(idea.created_at), 'MMM d')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {idea.tags?.map((tag) => (
                        <Badge key={tag} variant="accent" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground leading-relaxed">{idea.content}</p>

                  {/* Expanded content */}
                  {expanded === idea.id && (idea.brief || idea.expanded_content) && (
                    <div className="mt-4 rounded-md border border-border/50 bg-muted/30 p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {idea.brief || idea.expanded_content}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={developing === idea.id}
                      onClick={() => develop(idea, 'brief')}
                    >
                      {developing === idea.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Brief
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      disabled={developing === idea.id}
                      onClick={() => develop(idea, 'action_plan')}
                    >
                      Action plan
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      disabled={developing === idea.id}
                      onClick={() => develop(idea, 'explore')}
                    >
                      Explore
                    </Button>

                    {/* Todo toggle */}
                    <button
                      onClick={() => toggleTodo(idea)}
                      title={inTodo ? 'Remove from todo board' : 'Add to todo board'}
                      className={`ml-auto flex items-center gap-1 text-xs transition-colors ${
                        inTodo
                          ? 'text-accent'
                          : 'text-muted-foreground/50 hover:text-accent'
                      }`}
                    >
                      <ListTodo className="h-3.5 w-3.5" />
                      {inTodo ? 'In todo' : 'Add to todo'}
                    </button>

                    {/* Create Asana project */}
                    {projectLinks[idea.id] ? (
                      <a
                        href={projectLinks[idea.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open in Asana
                      </a>
                    ) : (
                      <button
                        onClick={() => createProject(idea)}
                        disabled={creatingProject === idea.id}
                        title="Create Asana project from this idea"
                        className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-accent transition-colors disabled:opacity-40"
                      >
                        {creatingProject === idea.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <FolderPlus className="h-3.5 w-3.5" />
                        }
                        Create project
                      </button>
                    )}

                    {(idea.brief || idea.expanded_content) && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setExpanded(expanded === idea.id ? null : idea.id)}
                      >
                        {expanded === idea.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
