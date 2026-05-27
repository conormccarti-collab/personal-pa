'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Camera, Send, X, Loader2, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Mode = 'idle' | 'typing' | 'recording' | 'uploading'
type Route = 'inbox' | 'idea'

export function CaptureBar() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('idle')
  const [route, setRoute] = useState<Route>('inbox')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastCapture, setLastCapture] = useState<{ text: string; dest: Route } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const submit = useCallback(
    async (content: string, source: 'text' | 'voice' | 'photo', imageUrl?: string) => {
      if (!content.trim()) return
      setIsSubmitting(true)
      setError(null)
      try {
        const endpoint = route === 'idea' ? '/api/ideas' : '/api/capture'
        const body = route === 'idea'
          ? { title: content.trim().slice(0, 80), content: content.trim() }
          : { content, source, raw_image_url: imageUrl }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `Error ${res.status}`)
        }

        setLastCapture({ text: content, dest: route })
        setText('')
        setMode('idle')
        setTimeout(() => setLastCapture(null), 3000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
        setTimeout(() => setError(null), 4000)
      } finally {
        setIsSubmitting(false)
      }
    },
    [route]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(text, 'text')
    }
  }

  const startVoice = () => {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      alert('Voice input not supported in this browser.')
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-GB'

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('')
      setText(transcript)
    }

    recognition.onend = () => {
      setMode('idle')
      if (text.trim()) submit(text, 'voice')
    }

    recognition.start()
    recognitionRef.current = recognition
    setMode('recording')
  }

  const stopVoice = () => {
    recognitionRef.current?.stop()
    setMode('idle')
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMode('uploading')
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/capture/ocr', { method: 'POST', body: formData })
      const { text: ocrText, imageUrl } = await res.json()
      await submit(ocrText || 'Photo captured', 'photo', imageUrl)
    } catch {
      setIsSubmitting(false)
    } finally {
      setMode('idle')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl px-4 py-3 pl-[calc(3.5rem+1rem)] md:pl-[calc(13rem+2rem)]">

        {/* Feedback line */}
        {lastCapture && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {lastCapture.dest === 'idea' ? 'Saved to Ideas vault' : 'Saved to Inbox'}
          </div>
        )}
        {error && (
          <div className="mb-2 flex items-center gap-2 text-xs text-red-400 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border transition-colors',
            mode === 'recording'
              ? 'border-red-500/50 bg-red-500/5'
              : 'border-border bg-muted/50 focus-within:border-accent/50'
          )}
        >
          {/* Route toggle: inbox vs idea */}
          <button
            onClick={() => setRoute((r) => r === 'inbox' ? 'idea' : 'inbox')}
            title={route === 'idea' ? 'Sending to Ideas vault (click to switch to Inbox)' : 'Sending to Inbox (click to switch to Ideas)'}
            className={cn(
              'ml-2 shrink-0 rounded-md p-1.5 transition-colors',
              route === 'idea'
                ? 'text-amber-400 bg-amber-400/10'
                : 'text-muted-foreground/40 hover:text-muted-foreground'
            )}
          >
            <Lightbulb className="h-3.5 w-3.5" />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); setMode('typing') }}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'recording'
                ? 'Listening…'
                : mode === 'uploading'
                ? 'Processing image…'
                : route === 'idea'
                ? 'Capture an idea…'
                : 'Capture a thought, task, or idea…'
            }
            disabled={mode === 'recording' || mode === 'uploading' || isSubmitting}
            className="flex-1 bg-transparent px-2 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />

          <div className="flex items-center gap-1 pr-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={mode === 'recording' ? stopVoice : startVoice}
              disabled={isSubmitting}
              className={cn(mode === 'recording' && 'text-red-400 hover:text-red-400')}
              title={mode === 'recording' ? 'Stop recording' : 'Voice input'}
            >
              {mode === 'recording' ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => fileRef.current?.click()}
              disabled={isSubmitting || mode === 'recording'}
              title="Capture photo or handwritten note"
            >
              {mode === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>

            {text && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { setText(''); setMode('idle') }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}

            <Button
              size="icon-sm"
              onClick={() => submit(text, 'text')}
              disabled={!text.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhoto}
        />
      </div>
    </div>
  )
}
