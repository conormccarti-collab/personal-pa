import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron'
import { getMyTasks } from '@/lib/asana'
import { createTracked } from '@/lib/ai/claude'

function categoryFromText(text: string | null): string | null {
  if (!text) return null
  const s = text.toLowerCase()
  if (s.includes('shoot') || s.includes('filming') || s.includes('photography') || s.includes('recce')) return 'Shoot'
  if (s.includes('edit') && !s.includes('pre-edit') && !s.includes('pre edit') && !s.includes('review')) return 'Editing'
  if (s.includes('planning') || s.includes('pre-production') || s.includes('pre production')) return 'Planning & Pre-Production'
  if (s.includes('pre-edit') || s.includes('pre edit') || s.includes('brief')) return 'Pre-Edit Review'
  if (s.includes('review')) return 'Review'
  if (s.includes('idea') || s.includes('ideation')) return 'Ideas'
  return null
}

/**
 * GET /api/cron/asana-sync
 * Runs every 3 hours. Three jobs in one:
 *   1. Sync Asana tasks to DB
 *   2. Auto-categorise any new uncategorised tasks
 *   3. Run shoot-proposal detection and badge the Shoots page if any found
 */
export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  if (!workspaceGid) {
    return NextResponse.json({ error: 'ASANA_WORKSPACE_GID not set' }, { status: 500 })
  }

  const supabase = await createClient()

  // ── 1. Sync Asana tasks ─────────────────────────────────────────────────
  const asanaTasks = await getMyTasks(workspaceGid)

  const { data: existing } = await supabase
    .from('tasks')
    .select('id, asana_id, category')
    .not('asana_id', 'is', null)

  const existingMap = new Map(
    (existing ?? []).map((t) => [t.asana_id, { id: t.id, category: t.category }])
  )

  const newTaskIds: string[] = []
  let synced = 0

  for (const t of asanaTasks) {
    // Find the first membership that has a named section (memberships[0] may be "My Tasks" with no section)
    const sectionName = t.memberships?.find((m) => m.section?.name)?.section?.name ?? null
    const category = categoryFromText(sectionName) ?? categoryFromText(t.name)
    const payload = {
      asana_id:          t.gid,
      title:             t.name,
      description:       t.notes || null,
      due_date:          t.due_on || null,
      status:            t.completed ? ('done' as const) : ('todo' as const),
      priority:          'medium' as const,
      parent_asana_id:   t.parent?.gid   ?? null,
      parent_task_title: t.parent?.name  ?? null,
      asana_section:     sectionName,
      // Only set category when derivable from section — don't wipe manually-set categories
      ...(category ? { category } : {}),
      updated_at:        new Date().toISOString(),
    }

    if (existingMap.has(t.gid)) {
      await supabase.from('tasks').update(payload).eq('id', existingMap.get(t.gid)!.id)
    } else {
      const { data: inserted } = await supabase
        .from('tasks')
        .insert(payload)
        .select('id')
        .single()
      // Only queue for AI categorisation if we couldn't derive category from section
      if (inserted?.id && !category) newTaskIds.push(inserted.id)
    }
    synced++
  }

  // ── 2. Auto-categorise new tasks ────────────────────────────────────────
  let categorised = 0
  if (newTaskIds.length > 0) {
    const { data: newTasks } = await supabase
      .from('tasks')
      .select('id, title, description, due_date')
      .in('id', newTaskIds)
      .is('category', null)

    if (newTasks?.length) {
      const [profileRes, existingCatsRes] = await Promise.all([
        supabase.from('profiles').select('*').maybeSingle(),
        supabase.from('tasks').select('category').not('category', 'is', null).neq('status', 'archived'),
      ])
      const profile = profileRes.data
      const existingCategories = [
        ...new Set(
          (existingCatsRes.data ?? []).map((r: { category: string | null }) => r.category).filter(Boolean)
        ),
      ] as string[]

      const profileText = profile
        ? [profile.role, profile.job_spec, profile.priorities, profile.ai_context].filter(Boolean).join(' ')
        : ''

      const existingCatsBlock = existingCategories.length
        ? `EXISTING CATEGORIES (reuse these — do not invent near-duplicates):\n${existingCategories.map((c) => `  - ${c}`).join('\n')}\n\n`
        : ''

      const message = await createTracked('cron_categorise', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `You are organising tasks into categories. Return a JSON array only.`,
        messages: [{
          role: 'user',
          content: `Sort each task into a category.

${profileText ? `About this person: ${profileText}\n` : ''}${existingCatsBlock}Tasks:
${JSON.stringify(newTasks.map((t) => ({ id: t.id, title: t.title, description: t.description })), null, 2)}

Rules: ALWAYS reuse an existing category name if it fits. Only create new names if nothing fits. 3-7 categories total. Short names (1-3 words), capitalised.

Return JSON only: [{"id": "...", "category": "..."}]`,
        }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
      try {
        const match = text.match(/\[[\s\S]*\]/)
        const assignments: { id: string; category: string }[] = match ? JSON.parse(match[0]) : []
        await Promise.all(
          assignments.map((a) =>
            supabase.from('tasks').update({ category: a.category }).eq('id', a.id)
          )
        )
        categorised = assignments.length
      } catch { /* silent */ }
    }
  }

  // ── 3. Detect shoot proposals from all active tasks ──────────────────────
  const { data: activeTasks } = await supabase
    .from('tasks')
    .select('id, title, description, due_date, project, category, tags')
    .not('status', 'in', '("done","archived")')
    .order('due_date', { ascending: true, nullsFirst: false })

  const { data: existingShoots } = await supabase.from('shoots').select('title')
  const existingTitles = (existingShoots ?? []).map((s: { title: string }) => s.title.toLowerCase())

  let proposalCount = 0
  if (activeTasks?.length) {
    const msg = await createTracked('cron_shoot_detect', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You identify shoot tasks. Return JSON only.`,
      messages: [{
        role: 'user',
        content: `From this task list, identify tasks that represent a real-world shoot (photo/video/filming day). Keywords: shoot, film, record, filming day, location, on-set, BTS, photography, videography. Exclude editing, planning, admin.
Also exclude tasks whose titles closely match: ${existingTitles.length ? existingTitles.join(', ') : 'none'}.

Tasks: ${JSON.stringify(activeTasks.map((t) => ({ id: t.id, title: t.title, description: t.description?.slice(0, 100) ?? null, due_date: t.due_date })), null, 2)}

Return JSON array (empty if none): [{"task_id":"...","title":"...","shoot_type":"photo|video|mixed","start_date":"YYYY-MM-DD or null"}]`,
      }],
    })

    const txt = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    try {
      const match = txt.match(/\[[\s\S]*\]/)
      const proposals = match ? JSON.parse(match[0]) : []
      proposalCount = proposals.length

      if (proposals.length > 0) {
        await supabase.from('notifications').upsert(
          {
            type:  'shoot_proposals',
            title: `${proposals.length} new shoot${proposals.length !== 1 ? 's' : ''} found in tasks`,
            body:  `AI detected ${proposals.length} potential shoot${proposals.length !== 1 ? 's' : ''} in your task list. Open Shoots → Import from tasks to review.`,
            data:  { count: proposals.length },
            read:  false,
          },
          { onConflict: 'type,day', ignoreDuplicates: false }
        )
      }
    } catch { /* silent */ }
  }

  return NextResponse.json({ ok: true, synced, categorised, proposalCount })
}
