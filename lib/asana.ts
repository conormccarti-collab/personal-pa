const BASE = 'https://app.asana.com/api/1.0'

function headers() {
  return {
    Authorization: `Bearer ${process.env.ASANA_PERSONAL_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

async function asana<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.errors?.[0]?.message ?? `Asana ${res.status}`)
  }
  const { data } = await res.json()
  return data as T
}

export interface AsanaTask {
  gid: string
  name: string
  notes: string
  due_on: string | null
  completed: boolean
  assignee: { gid: string; name: string } | null
  memberships: { project: { gid: string; name: string }; section: { gid: string; name: string } | null }[]
  parent: { gid: string; name: string } | null
}

export async function getMe(): Promise<{ gid: string; name: string }> {
  return asana('/users/me?opt_fields=gid,name')
}

export async function getMyTasks(workspaceGid: string): Promise<AsanaTask[]> {
  return asana(
    `/tasks?assignee=me&workspace=${workspaceGid}&completed_since=now&limit=100` +
      `&opt_fields=gid,name,notes,due_on,completed,assignee,memberships.project,memberships.section.name,parent.gid,parent.name`
  )
}

export async function createTask(payload: {
  name: string
  notes?: string
  due_on?: string | null
  workspace: string
  assignee: string
}): Promise<AsanaTask> {
  return asana('/tasks', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  })
}

export async function updateTask(
  gid: string,
  payload: Partial<{ name: string; notes: string; due_on: string | null; completed: boolean }>
): Promise<AsanaTask> {
  return asana(`/tasks/${gid}`, {
    method: 'PUT',
    body: JSON.stringify({ data: payload }),
  })
}

export async function addComment(gid: string, text: string): Promise<void> {
  await asana(`/tasks/${gid}/stories`, {
    method: 'POST',
    body: JSON.stringify({ data: { text } }),
  })
}

export interface AsanaProjectTask {
  gid: string
  name: string
  due_on: string | null
  completed: boolean
  assignee: { gid: string; name: string } | null
  tags: { name: string }[]
  memberships: { section: { gid: string; name: string } | null }[]
}

export interface AsanaMember {
  gid: string
  name: string
}

export async function getProjectTasks(projectGid: string): Promise<AsanaProjectTask[]> {
  return asana(
    `/projects/${projectGid}/tasks?limit=100` +
    `&opt_fields=gid,name,due_on,completed,assignee.gid,assignee.name,tags.name,memberships.section.name`
  )
}

export async function getTaskSubtasks(taskGid: string): Promise<AsanaProjectTask[]> {
  return asana(
    `/tasks/${taskGid}/subtasks?opt_fields=gid,name,due_on,completed,assignee.gid,assignee.name`
  )
}

export async function getProjectMembers(projectGid: string): Promise<AsanaMember[]> {
  return asana(`/projects/${projectGid}/members?opt_fields=gid,name`)
}

export async function getWorkspaceUsers(workspaceGid: string): Promise<AsanaMember[]> {
  return asana(`/workspaces/${workspaceGid}/users?opt_fields=gid,name`)
}

export async function assignTask(taskGid: string, assigneeGid: string): Promise<void> {
  await asana(`/tasks/${taskGid}`, {
    method: 'PUT',
    body: JSON.stringify({ data: { assignee: assigneeGid } }),
  })
}
