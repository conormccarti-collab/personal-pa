import { NextRequest, NextResponse } from 'next/server'
import { getProjectTasks } from '@/lib/asana'

const PROJECT_GID = '1202651230977728'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  try {
    const all = await getProjectTasks(PROJECT_GID)
    const publish = all.filter((t) =>
      !t.completed &&
      t.name.toLowerCase().includes('publish') &&
      t.due_on !== null
    )

    const filtered = publish.filter((t) => {
      if (from && t.due_on! < from) return false
      if (to   && t.due_on! > to)   return false
      return true
    })

    return NextResponse.json(
      filtered.map((t) => ({
        id:                t.gid,
        title:             t.name,
        parent_task_title: null, // subtask parent not fetched at project level
        due_date:          t.due_on,
      }))
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
