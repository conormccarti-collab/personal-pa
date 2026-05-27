import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reprioritiseTasks } from '@/lib/ai/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { instruction, tasks } = await req.json()

  const profileRes = await supabase.from('profiles').select('role, priorities, ai_context').single()
  const profile = profileRes.data
  const profileText = profile
    ? [profile.role, profile.priorities, profile.ai_context].filter(Boolean).join(' ')
    : ''

  const changes = await reprioritiseTasks({
    instruction,
    tasks: JSON.stringify(tasks),
    profile: profileText,
  })

  // Persist changes to DB
  await Promise.all(
    changes.map((c) =>
      supabase
        .from('tasks')
        .update({ priority: c.priority, updated_at: new Date().toISOString() })
        .eq('id', c.id)
    )
  )

  return NextResponse.json({ changes })
}
