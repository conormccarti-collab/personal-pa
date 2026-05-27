import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createTracked, MODEL } from '@/lib/ai/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { tasks } = await req.json()

  if (!tasks?.length) return NextResponse.json({ assignments: [] })

  const [profileRes, existingCatsRes] = await Promise.all([
    supabase.from('profiles').select('*').maybeSingle(),
    supabase.from('tasks').select('category').not('category', 'is', null).neq('status', 'archived'),
  ])
  const profile = profileRes.data

  // Deduplicated list of categories already in use — AI must prefer these
  const existingCategories = [
    ...new Set(
      (existingCatsRes.data ?? []).map((r: { category: string | null }) => r.category).filter(Boolean)
    ),
  ] as string[]

  const profileText = profile
    ? [profile.role, profile.job_spec, profile.priorities, profile.ai_context]
        .filter(Boolean)
        .join(' ')
    : null

  const taskList = tasks.map((t: { id: string; title: string; description?: string; due_date?: string; category_context?: string }) => ({
    id: t.id,
    title: t.title,
    description: t.description || null,
    due_date: t.due_date || null,
    prior_context: t.category_context || null,
  }))

  const today = new Date().toISOString().split('T')[0]

  const existingCatsBlock = existingCategories.length
    ? `EXISTING CATEGORIES (use these exact names where they fit — do not invent near-duplicates):
${existingCategories.map((c) => `  - ${c}`).join('\n')}\n\n`
    : ''

  const message = await createTracked('categorise', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    system: `You are organising a task list into categories. Return a JSON array only — no explanation, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Sort every task into a category. Every task must receive a category.

${profileText ? `About this person: ${profileText}\n` : ''}${existingCatsBlock}Today's date: ${today}

Tasks:
${JSON.stringify(taskList, null, 2)}

Rules:
- ALWAYS reuse an existing category name (above) if it is a reasonable fit — do not create near-duplicates like "Shooting" when "Shooting and Production" already exists.
- Only create a brand-new category name if none of the existing ones fit at all.
- Total distinct categories across the full task list: 3–7.
- Category names: short (1–3 words), capitalised, specific (e.g. "Video Production", "Blog & Content", "Client Projects", "Admin", "Planning").
- Due date ≠ priority — categorise by topic, not urgency.
- If prior_context is set on a task, treat it as a strong signal for that task's category.
- Use "Needs Review" only as a genuine last resort.

Return JSON array only (no markdown, no explanation):
[{"id": "...", "category": "Category Name"}]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const assignments: { id: string; category: string }[] = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : []

    await Promise.all(
      assignments.map((a) =>
        supabase
          .from('tasks')
          .update({ category: a.category, updated_at: new Date().toISOString() })
          .eq('id', a.id)
      )
    )

    return NextResponse.json({ assignments })
  } catch {
    return NextResponse.json({ assignments: [] })
  }
}
