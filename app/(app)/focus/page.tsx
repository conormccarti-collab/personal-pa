'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Play, Pause, RotateCcw, SkipForward, CheckCircle2, Circle,
  Loader2, Sparkles, ChevronDown, ArrowLeft, Target,
} from 'lucide-react'
import Link from 'next/link'
import type { Task } from '@/types'

// ─── Timer constants ──────────────────────────────────────────────────────────
const TIMER_R = 88
const TIMER_CIRC = 2 * Math.PI * TIMER_R

// ─── Circular timer SVG ───────────────────────────────────────────────────────
function TimerRing({
  timeLeft,
  total,
  mode,
}: {
  timeLeft: number
  total: number
  mode: 'work' | 'break'
}) {
  const progress = timeLeft / total
  const dashOffset = TIMER_CIRC * (1 - progress)
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <div className="relative flex items-center justify-center select-none">
      <svg width={220} height={220} className="-rotate-90">
        <circle
          cx={110} cy={110} r={TIMER_R}
          stroke="currentColor" strokeWidth={8} fill="none"
          className="text-muted/20"
        />
        <circle
          cx={110} cy={110} r={TIMER_R}
          stroke="currentColor" strokeWidth={8} fill="none"
          strokeDasharray={TIMER_CIRC}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className={mode === 'work' ? 'text-accent' : 'text-emerald-400'}
          style={{ transition: 'stroke-dashoffset 0.8s linear' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-5xl font-mono font-semibold tabular-nums tracking-tight">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </p>
        <p className={`mt-1 text-xs font-medium uppercase tracking-widest ${mode === 'work' ? 'text-accent' : 'text-emerald-400'}`}>
          {mode === 'work' ? 'Focus' : 'Break'}
        </p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FocusPage() {
  const searchParams = useSearchParams()
  const preloadId = searchParams.get('taskId')

  const supabase = createClient()

  // ── Task state ───────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [showPicker, setShowPicker] = useState(false)

  // ── Timer state ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'work' | 'break'>('work')
  const [workMins, setWorkMins] = useState(25)
  const [breakMins, setBreakMins] = useState(5)
  // Refs so interval closures always see the latest duration values
  const workMinsRef = useRef(25)
  const breakMinsRef = useRef(5)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [session, setSession] = useState(1)
  const [completed, setCompleted] = useState(false) // task marked done
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setWorkDuration = (m: number) => {
    workMinsRef.current = m
    setWorkMins(m)
    if (mode === 'work' && !running) setTimeLeft(m * 60)
  }
  const setBreakDuration = (m: number) => {
    breakMinsRef.current = m
    setBreakMins(m)
    if (mode === 'break' && !running) setTimeLeft(m * 60)
  }

  // ── Breakdown state ──────────────────────────────────────────────────────────
  const [steps, setSteps] = useState<string[]>([])
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set())
  const [generatingBreakdown, setGeneratingBreakdown] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(true)

  // ── Load tasks ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .in('status', ['todo', 'in_progress'])
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }) => {
        const taskList = (data as Task[]) ?? []
        setTasks(taskList)
        if (preloadId) {
          const match = taskList.find((t) => t.id === preloadId)
          if (match) selectTask(match)
        }
        setLoadingTasks(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Select a task ────────────────────────────────────────────────────────────
  const selectTask = (task: Task) => {
    setSelectedTask(task)
    setShowPicker(false)
    setSteps(task.breakdown_steps ?? [])
    setCheckedSteps(new Set())
    setCompleted(false)
    resetTimer()
  }

  // ── Timer logic ──────────────────────────────────────────────────────────────
  const resetTimer = useCallback((toMode?: 'work' | 'break') => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const m = toMode ?? 'work'
    setMode(m)
    setTimeLeft(m === 'work' ? workMinsRef.current * 60 : breakMinsRef.current * 60)
    setRunning(false)
  }, [])

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!)
          setRunning(false)
          // Switch mode
          setMode((m) => {
            const next = m === 'work' ? 'break' : 'work'
            setTimeLeft(next === 'work' ? workMinsRef.current * 60 : breakMinsRef.current * 60)
            if (next === 'work') setSession((s) => s + 1)
            return next
          })
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [running])

  const skipSession = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const next = mode === 'work' ? 'break' : 'work'
    setMode(next)
    setTimeLeft(next === 'work' ? workMinsRef.current * 60 : breakMinsRef.current * 60)
    setRunning(false)
    if (next === 'work') setSession((s) => s + 1)
  }

  // ── Breakdown ────────────────────────────────────────────────────────────────
  const generateBreakdown = async () => {
    if (!selectedTask) return
    setGeneratingBreakdown(true)
    try {
      const res = await fetch('/api/ai/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: selectedTask.id }),
      })
      const data = await res.json()
      setSteps(data.steps ?? [])
      setShowBreakdown(true)
    } finally {
      setGeneratingBreakdown(false)
    }
  }

  const toggleStep = (i: number) =>
    setCheckedSteps((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  // ── Mark task done ───────────────────────────────────────────────────────────
  const markDone = async () => {
    if (!selectedTask) return
    await supabase
      .from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', selectedTask.id)
    setCompleted(true)
    setRunning(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Focus Mode</span>
          {selectedTask && (
            <span className="text-xs text-muted-foreground">· Session {session}</span>
          )}
        </div>
        <Link href="/tasks">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
            <ArrowLeft className="h-3 w-3" />
            Back to tasks
          </Button>
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center gap-8 pt-4">

        {/* ── Task selector / display ─────────────────────────────────────── */}
        {!selectedTask ? (
          <div className="w-full max-w-lg">
            <p className="mb-3 text-center text-sm text-muted-foreground">
              Pick a task to focus on
            </p>
            {loadingTasks ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No active tasks. <Link href="/tasks" className="text-accent underline">Add one first.</Link>
              </p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => selectTask(task)}
                    className="w-full flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-accent/40 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      {task.due_date && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Due {task.due_date}</p>
                      )}
                    </div>
                    <span className={`mt-0.5 text-xs font-medium capitalize ${
                      task.priority === 'high' ? 'text-red-400' :
                      task.priority === 'medium' ? 'text-amber-400' : 'text-muted-foreground'
                    }`}>
                      {task.priority}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : completed ? (
          /* ── Done state ─────────────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-400" />
            <div>
              <p className="text-xl font-semibold">Task complete!</p>
              <p className="mt-1 text-sm text-muted-foreground">"{selectedTask.title}" is done.</p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => { setSelectedTask(null); setCompleted(false) }}>
                Focus on another task
              </Button>
              <Link href="/tasks">
                <Button>Back to tasks</Button>
              </Link>
            </div>
          </div>
        ) : (
          /* ── Active focus session ───────────────────────────────────────── */
          <div className="w-full max-w-lg space-y-6">
            {/* Task name + change */}
            <div className="text-center">
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="group inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="text-xs">Working on</span>
                <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
              <p className="mt-1 text-lg font-semibold leading-snug">{selectedTask.title}</p>
              {selectedTask.description && (
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {selectedTask.description}
                </p>
              )}
            </div>

            {/* Task switcher dropdown */}
            {showPicker && (
              <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => selectTask(task)}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors ${
                      task.id === selectedTask.id ? 'bg-accent/10 text-accent' : ''
                    }`}
                  >
                    {task.title}
                  </button>
                ))}
              </div>
            )}

            {/* Timer */}
            <div className="flex flex-col items-center gap-5">
              <TimerRing timeLeft={timeLeft} total={mode === 'work' ? workMins * 60 : breakMins * 60} mode={mode} />

              {/* Timer controls */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => resetTimer()}
                  title="Reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="w-24 gap-2"
                  onClick={() => setRunning((v) => !v)}
                >
                  {running
                    ? <><Pause className="h-4 w-4" /> Pause</>
                    : <><Play className="h-4 w-4" /> {timeLeft === (mode === 'work' ? workMins * 60 : breakMins * 60) ? 'Start' : 'Resume'}</>
                  }
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={skipSession}
                  title="Skip session"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* Duration presets */}
              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground/50 w-10 text-right">Focus</span>
                  {[15, 25, 45, 60, 90].map((m) => (
                    <button
                      key={m}
                      onClick={() => setWorkDuration(m)}
                      disabled={running && mode === 'work'}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        workMins === m
                          ? 'bg-accent/20 text-accent font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground/50 w-10 text-right">Break</span>
                  {[5, 10, 15, 20].map((m) => (
                    <button
                      key={m}
                      onClick={() => setBreakDuration(m)}
                      disabled={running && mode === 'break'}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        breakMins === m
                          ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mark done */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                onClick={markDone}
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark task done
              </Button>
            </div>

            {/* Breakdown */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  className="flex items-center gap-2 text-sm font-medium"
                  onClick={() => setShowBreakdown((v) => !v)}
                >
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showBreakdown ? '' : '-rotate-90'}`} />
                  Breakdown steps
                  {steps.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({checkedSteps.size}/{steps.length})
                    </span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={generatingBreakdown}
                  onClick={generateBreakdown}
                >
                  {generatingBreakdown
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Sparkles className="h-3 w-3 text-accent" />
                  }
                  {steps.length > 0 ? 'Regenerate' : 'Break it down'}
                </Button>
              </div>

              {showBreakdown && steps.length > 0 && (
                <div className="border-t border-border px-4 pb-3 pt-2 space-y-2">
                  {steps.map((step, i) => (
                    <button
                      key={i}
                      onClick={() => toggleStep(i)}
                      className="flex w-full items-start gap-3 py-1 text-left group"
                    >
                      <div className="mt-0.5 shrink-0">
                        {checkedSteps.has(i)
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          : <Circle className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                        }
                      </div>
                      <span className={`text-sm leading-snug ${checkedSteps.has(i) ? 'line-through text-muted-foreground' : ''}`}>
                        {step}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showBreakdown && steps.length === 0 && !generatingBreakdown && (
                <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
                  Hit "Break it down" to have Claude split this into concrete steps.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
