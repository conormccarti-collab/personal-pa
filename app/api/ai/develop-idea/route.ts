import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { developIdea } from '@/lib/ai/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { ideaId, content, format: fmt = 'brief' } = await req.json()

  const profileRes = await supabase.from('profiles').select('role, working_style').single()
  const profile = profileRes.data
  const profileText = profile ? `${profile.role}. ${profile.working_style ?? ''}` : ''

  const result = await developIdea({ idea: content, profile: profileText, format: fmt })

  if (ideaId) {
    const updateField = fmt === 'brief' ? { brief: result } : { expanded_content: result }
    await supabase
      .from('ideas')
      .update({ ...updateField, updated_at: new Date().toISOString() })
      .eq('id', ideaId)
  }

  return NextResponse.json({ result })
}
