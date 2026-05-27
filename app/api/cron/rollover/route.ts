import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron'

/**
 * GET /api/cron/rollover
 * Runs at 18:30 every day. Finds todo items still in the "today" section
 * that aren't done, and stores them as a rollover notification.
 * The TodoBoard reads this on load and presents a "roll to tomorrow?" modal.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const supabase = await createClient()

  const { data: todayItems } = await supabase
    .from('todo_items')
    .select('id, title, color, scheduled_time')
    .eq('section', 'today')
    .not('completed', 'eq', true)
    .order('scheduled_time', { ascending: true, nullsFirst: false })

  if (!todayItems?.length) {
    return NextResponse.json({ ok: true, items: 0 })
  }

  await supabase.from('notifications').upsert(
    {
      type:  'rollover',
      title: `${todayItems.length} item${todayItems.length !== 1 ? 's' : ''} left from today`,
      body:  `You have ${todayItems.length} unfinished item${todayItems.length !== 1 ? 's' : ''} from today. Move them to tomorrow?`,
      data:  {
        items: todayItems.map((i) => ({
          id:    i.id,
          text:  i.title,   // TodoItem uses 'title' in DB, surfaced as 'text' in UI
          color: i.color,
        })),
      },
      read: false,
    },
    { onConflict: 'type,day', ignoreDuplicates: false }
  )

  return NextResponse.json({ ok: true, items: todayItems.length })
}
