import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron'
import { createTracked } from '@/lib/ai/claude'
import { format } from 'date-fns'

/**
 * GET /api/cron/shoot-prep
 * Runs at 07:00 every day. Checks for shoots happening today.
 * If any found, generates a quick prep summary and stores it as a notification.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCron(req)
  if (authError) return authError

  const supabase  = await createClient()
  const todayStr  = new Date().toISOString().slice(0, 10)

  // Find shoots starting today (or multi-day shoots that span today)
  const { data: shoots } = await supabase
    .from('shoots')
    .select('id, title, client, shoot_type, start_date, end_date, location, brief')
    .lte('start_date', todayStr)
    .or(`end_date.is.null,end_date.gte.${todayStr}`)
    .neq('status', 'cancelled')

  if (!shoots?.length) {
    return NextResponse.json({ ok: true, shoots: 0 })
  }

  // For each shoot, get shot list + equipment stats
  const shootDetails = await Promise.all(
    shoots.map(async (shoot) => {
      const [shotsRes, equipRes] = await Promise.all([
        supabase
          .from('shot_list_items')
          .select('id, title, status')
          .eq('shoot_id', shoot.id),
        supabase
          .from('equipment_items')
          .select('id, name, packed, category')
          .eq('shoot_id', shoot.id),
      ])
      const allShots = shotsRes.data ?? []
      const allEquip = equipRes.data ?? []
      return {
        ...shoot,
        shot_count:    allShots.length,
        shots_done:    allShots.filter((s) => s.status === 'done').length,
        equip_count:   allEquip.length,
        equip_packed:  allEquip.filter((e) => e.packed).length,
        unpacked_items: allEquip.filter((e) => !e.packed).map((e) => e.name).slice(0, 5),
      }
    })
  )

  // Generate a brief AI prep note
  const shootSummary = shootDetails.map((s) => `
Shoot: ${s.title}${s.client ? ` (${s.client})` : ''}
Type: ${s.shoot_type}${s.location ? ` · Location: ${s.location}` : ''}
Shot list: ${s.shot_count} shots${s.shot_count > 0 ? ` (${s.shots_done} already done)` : ''}
Equipment: ${s.equip_count} items${s.equip_count > 0 ? ` — ${s.equip_packed}/${s.equip_count} packed` : ''}
${s.unpacked_items.length ? `Still to pack: ${s.unpacked_items.join(', ')}${s.equip_count - s.equip_packed > 5 ? ` + ${s.equip_count - s.equip_packed - 5} more` : ''}` : ''}
${s.brief ? `Brief: ${s.brief}` : ''}
  `.trim()).join('\n\n')

  const message = await createTracked('shoot_prep', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `You are a sharp personal assistant. Write a 2-sentence shoot-day prep note. Direct, practical, no filler.`,
    messages: [{
      role: 'user',
      content: `Write a quick shoot day prep note for today (${format(new Date(), 'EEEE, MMM d')}).

${shootSummary}

Focus on: what needs packing, any outstanding shots from prep, and a one-line motivational send-off. 2 sentences max.`,
    }],
  })

  const note = message.content[0].type === 'text' ? message.content[0].text : ''

  const title = shoots.length === 1
    ? `Shoot day: ${shoots[0].title}`
    : `${shoots.length} shoots today`

  await supabase.from('notifications').upsert(
    {
      type:  'shoot_prep',
      title,
      body:  note,
      data:  {
        shoot_ids: shoots.map((s) => s.id),
        details:   shootDetails.map((s) => ({
          id:          s.id,
          title:       s.title,
          location:    s.location,
          shot_count:  s.shot_count,
          equip_count: s.equip_count,
          equip_packed: s.equip_packed,
        })),
      },
      read: false,
    },
    { onConflict: 'type,day', ignoreDuplicates: false }
  )

  return NextResponse.json({ ok: true, shoots: shoots.length })
}
