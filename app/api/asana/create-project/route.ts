import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://app.asana.com/api/1.0'

export async function POST(req: NextRequest) {
  const { name, notes } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  const token = process.env.ASANA_PERSONAL_ACCESS_TOKEN
  if (!workspaceGid || !token) {
    return NextResponse.json({ error: 'Asana not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${BASE}/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: name.trim(),
          notes: notes?.trim() || undefined,
          workspace: workspaceGid,
          default_view: 'list',
        },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.errors?.[0]?.message ?? `Asana ${res.status}`)
    }

    const { data } = await res.json()
    return NextResponse.json({ gid: data.gid, name: data.name, permalink_url: data.permalink_url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
