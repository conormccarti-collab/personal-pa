import { NextRequest, NextResponse } from 'next/server'
import { createTracked } from '@/lib/ai/claude'
import { TODO_CATEGORIES, colorForCategory } from '@/lib/todo-categories'

const CATEGORY_LIST = TODO_CATEGORIES.map((c) => c.name).join(', ')

/**
 * POST /api/ai/categorise-todo
 * Body: { items: { id: string; title: string; notes?: string | null }[] }
 * Returns: { results: { id: string; category: string; color: string }[] }
 *
 * Accepts a batch so a single API call can handle both single-item
 * (after creation) and bulk re-categorisation.
 */
export async function POST(req: NextRequest) {
  const { items } = await req.json() as {
    items: { id: string; title: string; notes?: string | null }[]
  }

  if (!items?.length) return NextResponse.json({ results: [] })

  const itemList = items
    .map((item, i) =>
      `${i + 1}. id="${item.id}" title="${item.title}"${item.notes ? ` notes="${item.notes}"` : ''}`
    )
    .join('\n')

  const message = await createTracked('categorise_todo', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `You categorise todo items for a video production professional. Return JSON only — no markdown, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `Assign each item to exactly one category from this list: ${CATEGORY_LIST}

Use "Misc" only as a last resort. Prefer specific categories when there is any reasonable match.

Items:
${itemList}

Return a JSON array: [{"id":"...","category":"..."}]
Use the exact ids from the input.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'

  let assignments: { id: string; category: string }[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    assignments = match ? JSON.parse(match[0]) : []
  } catch {
    assignments = []
  }

  const results = assignments.map(({ id, category }) => ({
    id,
    category,
    color: colorForCategory(category) ?? '#64748b',
  }))

  return NextResponse.json({ results })
}
