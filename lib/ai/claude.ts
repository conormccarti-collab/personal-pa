import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = 'claude-sonnet-4-6'

// ── Cost tracking ─────────────────────────────────────────────────────────────

const TOKEN_COST_PER_M: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':           { input: 15.00, output: 75.00 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = TOKEN_COST_PER_M[model] ?? TOKEN_COST_PER_M['claude-sonnet-4-6']
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

/** Fire-and-forget — logs a Claude API call to Supabase using the REST API directly */
export function logUsage(endpoint: string, model: string, inputTokens: number, outputTokens: number): void {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return
  fetch(`${url}/rest/v1/api_usage`, {
    method: 'POST',
    headers: {
      apikey:          key,
      Authorization:   `Bearer ${key}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal',
    },
    body: JSON.stringify({ model, endpoint, input_tokens: inputTokens, output_tokens: outputTokens }),
  }).catch(() => {})
}

/** Tracked wrapper — drop-in replacement for anthropic.messages.create that logs usage */
export async function createTracked(
  endpoint: string,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  const message = await anthropic.messages.create(params)
  logUsage(endpoint, params.model, message.usage.input_tokens, message.usage.output_tokens)
  return message
}

export async function generateBriefing(context: {
  profile: string
  aiContext: string
  tasks: string
  meetings: string
  followUps: string
  date: string
  dayOfWeek: string
  overdueCount: number
  staleCount: number
  completedThisWeek: number
  // Enhanced context
  criticalTask?: { title: string; due_date: string } | null
  riskSummary?: string
  teamSummary?: string
  ideasReadyCount?: number
  shootPrepAlerts?: string
}): Promise<string> {
  const intelligenceLines: string[] = []
  if (context.overdueCount > 0)
    intelligenceLines.push(`${context.overdueCount} task${context.overdueCount > 1 ? 's are' : ' is'} overdue`)
  if (context.staleCount > 0)
    intelligenceLines.push(`${context.staleCount} task${context.staleCount > 1 ? 's have' : ' has'} had no movement in 7+ days`)
  if (context.completedThisWeek > 0)
    intelligenceLines.push(`${context.completedThisWeek} task${context.completedThisWeek > 1 ? 's' : ''} completed so far this week`)

  const intelligenceSummary = intelligenceLines.length
    ? `Patterns this week: ${intelligenceLines.join('; ')}.`
    : ''

  const extraContext: string[] = []
  if (context.criticalTask) extraContext.push(`Most critical task: "${context.criticalTask.title}" (due ${context.criticalTask.due_date})`)
  if (context.riskSummary)  extraContext.push(`Risk flags: ${context.riskSummary}`)
  if (context.teamSummary)  extraContext.push(`Team: ${context.teamSummary}`)
  if (context.ideasReadyCount && context.ideasReadyCount > 0) extraContext.push(`${context.ideasReadyCount} idea${context.ideasReadyCount > 1 ? 's' : ''} sitting untouched for 7+ days`)
  if (context.shootPrepAlerts) extraContext.push(context.shootPrepAlerts)

  const message = await createTracked('morning_brief', {
    model: MODEL,
    max_tokens: 400,
    system: `You are a calm, sharp personal assistant. Write in a direct, human tone — no corporate speak, no filler. You know this person well. Be brief and genuinely useful.`,
    messages: [
      {
        role: 'user',
        content: `Write a morning briefing paragraph for ${context.date} (${context.dayOfWeek}).

About me: ${context.profile}
${context.aiContext ? `Additional context: ${context.aiContext}` : ''}

Today's tasks (prioritised): ${context.tasks}
Meetings today: ${context.meetings}
${intelligenceSummary}
${extraContext.length ? extraContext.join('\n') : ''}

Write 2-3 sentences that feel like a sharp PA briefing me for the day. Lead with what matters most — the critical task, a risk, or a deadline. If the team is overloaded or ideas are collecting dust, mention it. No bullet points, no headers — just a clear, direct paragraph.`,
      },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}

export async function generateFridayReview(context: {
  profile: string
  aiContext: string
  date: string
  completedTasks: string
  pendingTasks: string
  overdueTasks: string
  staleTasks: string
}): Promise<string> {
  const message = await createTracked('weekly_review', {
    model: MODEL,
    max_tokens: 500,
    system: `You are a sharp, honest personal assistant doing a weekly review. Be direct and useful. No filler. Acknowledge what went well and what needs attention. Write like a trusted advisor, not a motivational poster.`,
    messages: [
      {
        role: 'user',
        content: `Write a weekly review for the week ending ${context.date}.

About me: ${context.profile}
${context.aiContext ? `Additional context: ${context.aiContext}` : ''}

Completed this week: ${context.completedTasks || 'Nothing marked as done this week.'}

Still pending (todo/in progress): ${context.pendingTasks || 'None.'}

Overdue: ${context.overdueTasks || 'None.'}

Stale (no movement in 7+ days): ${context.staleTasks || 'None.'}

Write a 3-4 sentence weekly review: what got done, what's carrying over, and one specific focus recommendation for next week. Be honest. No bullet points — just a clear, flowing paragraph.`,
      },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}

export async function reprioritiseTasks(context: {
  instruction: string
  tasks: string
  profile: string
}): Promise<{ id: string; priority: string; reasoning: string }[]> {
  const message = await createTracked('reprioritise', {
    model: MODEL,
    max_tokens: 1000,
    system: `You are a personal assistant helping to reprioritise a task list. Return JSON only — no explanation outside the JSON.`,
    messages: [
      {
        role: 'user',
        content: `Reprioritise these tasks based on the instruction.

Instruction: "${context.instruction}"

About me: ${context.profile}

Current tasks (JSON): ${context.tasks}

Return a JSON array with this shape: [{ "id": "...", "priority": "high|medium|low", "reasoning": "one short sentence" }]
Only include tasks whose priority should change. Return [] if no changes needed.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch {
    return []
  }
}

export async function developIdea(context: {
  idea: string
  profile: string
  format: 'brief' | 'action_plan' | 'explore'
}): Promise<string> {
  const formatInstructions = {
    brief: 'Write a one-page project brief: problem, opportunity, proposed approach, and 3 key next steps.',
    action_plan: 'Write a concrete action plan: goal, 5-7 specific steps with owners and timelines, success criteria.',
    explore: 'Explore this idea deeply: angles I might not have considered, risks, analogies from other fields, questions worth answering first.',
  }

  const message = await createTracked('develop_idea', {
    model: MODEL,
    max_tokens: 800,
    system: `You are a sharp strategic thinking partner. Write clearly and concisely — no padding, no obvious statements.`,
    messages: [
      {
        role: 'user',
        content: `About me: ${context.profile}

Idea to develop: "${context.idea}"

${formatInstructions[context.format]}`,
      },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}

export async function autoTagIdea(idea: string): Promise<string[]> {
  const message = await createTracked('auto_tag_idea', {
    model: MODEL,
    max_tokens: 100,
    system: `Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: `Generate 2-4 short theme tags for this idea. Return JSON array of lowercase strings only.

Idea: "${idea}"

Example output: ["strategy", "content", "product"]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  try {
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch {
    return []
  }
}

export async function breakdownTask(context: {
  title: string
  description: string | null
  profile: string
}): Promise<string[]> {
  const message = await createTracked('breakdown_task', {
    model: MODEL,
    max_tokens: 500,
    system: `You are a practical productivity assistant. Return JSON only — no explanation outside the JSON.`,
    messages: [
      {
        role: 'user',
        content: `Break this task into 5-7 specific, actionable steps. Each step should be completable in one sitting. Start each with an action verb.

Task: "${context.title}"
${context.description ? `Description: ${context.description}` : ''}
About me: ${context.profile}

Return a JSON array of strings. Example: ["Open the doc and review the existing draft", "Identify the 3 sections that need rewriting", ...]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  try {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}

export async function justThreeTasks(context: {
  tasks: { id: string; title: string; priority: string; due_date: string | null; status: string }[]
  profile: string
  date: string
}): Promise<{ id: string; title: string; reason: string }[]> {
  if (context.tasks.length === 0) return []

  const message = await createTracked('just_three', {
    model: MODEL,
    max_tokens: 400,
    system: `You are a sharp personal assistant helping someone with ADHD focus. Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: `From this task list, pick the 3 most important tasks to focus on today (${context.date}).

About me: ${context.profile}

Tasks: ${JSON.stringify(context.tasks)}

Pick based on: due dates (overdue first), priority, and likely impact. Return exactly 3.

Return a JSON array: [{"id": "...", "title": "...", "reason": "one short sentence — why this one today"}]
Use the exact ids from the input. If fewer than 3 tasks exist, return all of them.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  try {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}

// ── Feature 3: Smart capture classification ───────────────────────────────────

export async function classifyCapture(content: string): Promise<{
  type: 'task' | 'idea' | 'reminder' | 'note'
  title: string
  suggested_due_date: string | null
  push_to_asana: boolean
}> {
  const message = await createTracked('classify_capture', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `You classify captured text. Return JSON only — no markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Classify this captured text and return JSON.

Text: "${content}"

Rules:
- task: something actionable with a clear deliverable ("edit the Dubai video", "send contract to client")
- idea: a creative thought, concept, or vague possibility ("what if we did a series on X")
- reminder: time-based ("remind me to follow up with Emma on Friday", "check in with client next week")
- note: reference information, not actionable ("client likes warm grades", "camera settings from today")

For tasks: push_to_asana=true if it sounds like a real project deliverable (not just a personal errand).
For reminders: extract suggested_due_date as YYYY-MM-DD if a date/day is mentioned, else null.
Title: concise version of the core action/idea (max 60 chars).

Return: {"type":"task|idea|reminder|note","title":"...","suggested_due_date":null,"push_to_asana":false}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  try {
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : {}
    return {
      type:               parsed.type ?? 'note',
      title:              parsed.title ?? content.slice(0, 60),
      suggested_due_date: parsed.suggested_due_date ?? null,
      push_to_asana:      parsed.push_to_asana ?? false,
    }
  } catch {
    return { type: 'note', title: content.slice(0, 60), suggested_due_date: null, push_to_asana: false }
  }
}

// ── Feature 5: Weekly plan generation ────────────────────────────────────────

export interface DayPlan {
  date: string
  focus: string
  tasks: { title: string; estimated_hours: number; why: string }[]
  notes: string
}

export interface WeeklyPlanData {
  monday: DayPlan
  tuesday: DayPlan
  wednesday: DayPlan
  thursday: DayPlan
  friday: DayPlan
}

export async function generateWeeklyPlan(context: {
  weekStart: string
  weekDays: string[]
  tasks: string
  shoots: string
  calendarEvents: string
  profile: string
  aiContext: string
}): Promise<WeeklyPlanData | null> {
  const message = await createTracked('weekly_plan', {
    model: MODEL,
    max_tokens: 1500,
    system: `You are a personal assistant building a weekly work plan. Return JSON only — no markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Build a day-by-day plan for the week starting ${context.weekStart}.

About me: ${context.profile}
${context.aiContext ? `Context: ${context.aiContext}` : ''}

Tasks with deadlines: ${context.tasks}
Shoots this week: ${context.shoots || 'None'}
Calendar events: ${context.calendarEvents || 'None'}
Days: ${context.weekDays.join(', ')}

Rules:
- Don't schedule heavy work on days with shoots or full-day events
- Front-load urgent/high-priority work to Monday/Tuesday
- Leave Friday afternoon lighter for reviews and planning
- Each day: 1 "focus" sentence, 2-4 specific tasks, any notes

Return JSON:
{
  "monday":    {"date":"${context.weekDays[0]}","focus":"...","tasks":[{"title":"...","estimated_hours":2,"why":"..."}],"notes":"..."},
  "tuesday":   {"date":"${context.weekDays[1]}","focus":"...","tasks":[...],"notes":"..."},
  "wednesday": {"date":"${context.weekDays[2]}","focus":"...","tasks":[...],"notes":"..."},
  "thursday":  {"date":"${context.weekDays[3]}","focus":"...","tasks":[...],"notes":"..."},
  "friday":    {"date":"${context.weekDays[4]}","focus":"...","tasks":[...],"notes":"..."}
}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  } catch {
    return null
  }
}

// ── Feature 2: Enhanced morning briefing ─────────────────────────────────────

export async function generateChatReply(context: {
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  message: string
}): Promise<string> {
  const message = await createTracked('chat', {
    model: MODEL,
    max_tokens: 600,
    system: context.systemPrompt,
    messages: [
      ...context.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: context.message },
    ],
  })
  return message.content[0].type === 'text' ? message.content[0].text : ''
}

export async function ocrHandwriting(base64Image: string, mediaType: string): Promise<string> {
  const message = await createTracked('ocr', {
    model: MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: 'Transcribe all text from this image exactly as written. If it contains handwriting, transcribe it faithfully. Return only the transcribed text, nothing else.',
          },
        ],
      },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}
