'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { Mic, Camera, Type, Slack, CheckCheck, Trash2, ArrowRight, Lightbulb } from 'lucide-react'
import type { Capture } from '@/types'

const sourceIcon = {
  text: Type,
  voice: Mic,
  photo: Camera,
  slack: Slack,
}

export default function CapturePage() {
  const [captures, setCaptures] = useState<Capture[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase
      .from('captures')
      .select('*')
      .eq('status', 'inbox')
      .order('created_at', { ascending: false })
      .limit(50)
    setCaptures((data as Capture[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('captures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'captures' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const archive = async (id: string) => {
    await supabase.from('captures').update({ status: 'archived' }).eq('id', id)
    setCaptures((prev) => prev.filter((c) => c.id !== id))
  }

  const convertToTask = async (capture: Capture) => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: capture.content, priority: 'medium' }),
    })
    await supabase.from('captures').update({ status: 'processed' }).eq('id', capture.id)
    setCaptures((prev) => prev.filter((c) => c.id !== capture.id))
  }

  const convertToIdea = async (capture: Capture) => {
    await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: capture.content, content: capture.content }),
    })
    await supabase.from('captures').update({ status: 'processed' }).eq('id', capture.id)
    setCaptures((prev) => prev.filter((c) => c.id !== capture.id))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {captures.length} item{captures.length !== 1 ? 's' : ''} to process
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Inbox zero. Use the bar below to capture something.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {captures.map((capture) => {
            const Icon = sourceIcon[capture.source] ?? Type
            return (
              <Card key={capture.id} className="group transition-colors hover:border-border/80">
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="mt-0.5 shrink-0 text-muted-foreground/50">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {capture.raw_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={capture.raw_image_url}
                        alt="Captured"
                        className="mb-2 max-h-32 rounded-md object-cover"
                      />
                    )}
                    <p className="text-sm leading-relaxed">{capture.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(capture.created_at), 'h:mm a')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => convertToTask(capture)}
                      title="Convert to task"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Task
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => convertToIdea(capture)}
                      title="Send to Ideas vault"
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                      Idea
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => archive(capture.id)}
                      title="Archive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
