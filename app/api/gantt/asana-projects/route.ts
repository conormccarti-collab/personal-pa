import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') ?? ''
  const workspaceGid = process.env.ASANA_WORKSPACE_GID
  const token = process.env.ASANA_PERSONAL_ACCESS_TOKEN

  const url =
    `https://app.asana.com/api/1.0/projects?workspace=${workspaceGid}` +
    `&limit=20&opt_fields=gid,name,due_on,start_on,color`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json(
      { error: err?.errors?.[0]?.message ?? `Asana ${res.status}` },
      { status: 500 }
    )
  }

  const { data } = await res.json()
  const projects = (data ?? []) as { gid: string; name: string; due_on: string | null; start_on: string | null }[]

  const filtered = query
    ? projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : projects

  return NextResponse.json(filtered.slice(0, 20))
}
