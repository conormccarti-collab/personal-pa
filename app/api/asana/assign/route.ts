import { NextRequest, NextResponse } from 'next/server'
import { assignTask } from '@/lib/asana'

export async function POST(req: NextRequest) {
  const { taskGid, assigneeGid } = await req.json()
  if (!taskGid || !assigneeGid) {
    return NextResponse.json({ error: 'taskGid and assigneeGid required' }, { status: 400 })
  }
  try {
    await assignTask(taskGid, assigneeGid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
