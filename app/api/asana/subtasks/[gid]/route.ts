import { NextResponse } from 'next/server'
import { getTaskSubtasks } from '@/lib/asana'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gid: string }> }
) {
  const { gid } = await params
  try {
    const subtasks = await getTaskSubtasks(gid)
    return NextResponse.json(subtasks.filter((t) => !t.completed))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
