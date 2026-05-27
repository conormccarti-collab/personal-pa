import { NextResponse } from 'next/server'
import { getWorkspaceUsers } from '@/lib/asana'

// Filter to only the people you'll ever assign to
const ALLOWED_NAMES = ['Emma', 'Chloe']

export async function GET() {
  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  if (!workspaceGid) {
    return NextResponse.json({ error: 'ASANA_WORKSPACE_GID not set' }, { status: 500 })
  }
  try {
    const all = await getWorkspaceUsers(workspaceGid)
    const filtered = all.filter((m) =>
      ALLOWED_NAMES.some((n) => m.name.toLowerCase().includes(n.toLowerCase()))
    )
    return NextResponse.json(filtered)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
