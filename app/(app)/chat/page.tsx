'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STARTERS = [
  'What should I focus on today?',
  'Is anyone on the team overloaded?',
  "What's at risk this week?",
  'Any ideas ready to develop?',
  "What's my most critical task right now?",
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-6),
        }),
      })
      const data = await res.json()
      setMessages([...newMessages, { role: 'assistant', content: data.reply ?? 'Sorry, something went wrong.' }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Something went wrong — try again.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] animate-fade-in">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ask your PA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask anything about your tasks, team, deadlines, or priorities.
        </p>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.length === 0 ? (
          <div className="space-y-6 pt-4">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Bot className="h-8 w-8 shrink-0 opacity-40" />
              <p className="text-sm">I have full visibility of your tasks, team workload, deadlines, and recent captures. Ask me anything.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-left text-sm text-muted-foreground hover:border-accent/40 hover:bg-accent/5 hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${
                msg.role === 'user' ? 'bg-accent/20' : 'bg-muted'
              }`}>
                {msg.role === 'user'
                  ? <User className="h-3.5 w-3.5 text-accent" />
                  : <Bot  className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </div>
              <div className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent/10 text-foreground'
                  : 'bg-muted/50 text-foreground'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border pt-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask anything…"
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm outline-none focus:border-accent/50 placeholder:text-muted-foreground/50 disabled:opacity-50"
          />
          <Button onClick={() => send(input)} disabled={!input.trim() || loading} size="sm" className="px-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
