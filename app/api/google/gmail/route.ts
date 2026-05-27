import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/google/tokens'

export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  snippet: string
  date: string
  isUnread: boolean
}

/**
 * GET /api/google/gmail?max=10
 * Returns recent inbox messages (default: 10).
 */
export async function GET(req: NextRequest) {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: 'not_connected', messages: [] }, { status: 401 })
  }

  const max = parseInt(req.nextUrl.searchParams.get('max') ?? '10', 10)

  // Fetch message list
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('labelIds',   'INBOX')
  listUrl.searchParams.set('maxResults', String(max))

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!listRes.ok) {
    const err = await listRes.text()
    return NextResponse.json({ error: err, messages: [] }, { status: listRes.status })
  }

  const listData = await listRes.json()
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id)

  if (ids.length === 0) return NextResponse.json({ messages: [] })

  // Fetch each message in parallel (metadata only — no body)
  const messagePromises = ids.map((id) =>
    fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json())
  )

  const rawMessages = await Promise.all(messagePromises)

  const messages: GmailMessage[] = rawMessages.map((msg) => {
    const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
    const header = (name: string) => headers.find((h) => h.name === name)?.value ?? ''
    const isUnread = (msg.labelIds as string[] ?? []).includes('UNREAD')

    return {
      id:       msg.id,
      threadId: msg.threadId,
      subject:  header('Subject') || '(No subject)',
      from:     header('From'),
      snippet:  msg.snippet ?? '',
      date:     header('Date'),
      isUnread,
    }
  })

  return NextResponse.json({ messages })
}
