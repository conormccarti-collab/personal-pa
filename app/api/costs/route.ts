import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateCost } from '@/lib/ai/claude'
import { startOfMonth, subMonths } from 'date-fns'

export interface CostSummary {
  thisMonth:  number            // USD
  lastMonth:  number
  allTime:    number
  byEndpoint: { endpoint: string; cost: number; calls: number }[]
  byModel:    { model: string;    cost: number; calls: number; inputTokens: number; outputTokens: number }[]
  totalCalls: number
}

export async function GET() {
  const supabase  = await createClient()
  const now       = new Date()
  const thisStart = startOfMonth(now).toISOString()
  const lastStart = startOfMonth(subMonths(now, 1)).toISOString()

  const { data: rows } = await supabase
    .from('api_usage')
    .select('model, endpoint, input_tokens, output_tokens, created_at')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (!rows?.length) {
    return NextResponse.json({
      thisMonth: 0, lastMonth: 0, allTime: 0,
      byEndpoint: [], byModel: [], totalCalls: 0,
    } satisfies CostSummary)
  }

  let thisMonth = 0, lastMonth = 0, allTime = 0
  const endpointMap = new Map<string, { cost: number; calls: number }>()
  const modelMap    = new Map<string, { cost: number; calls: number; inputTokens: number; outputTokens: number }>()

  for (const row of rows) {
    const cost = estimateCost(row.model, row.input_tokens, row.output_tokens)
    allTime += cost
    if (row.created_at >= thisStart) thisMonth += cost
    else if (row.created_at >= lastStart) lastMonth += cost

    const ep = endpointMap.get(row.endpoint) ?? { cost: 0, calls: 0 }
    endpointMap.set(row.endpoint, { cost: ep.cost + cost, calls: ep.calls + 1 })

    const m = modelMap.get(row.model) ?? { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 }
    modelMap.set(row.model, {
      cost:         m.cost + cost,
      calls:        m.calls + 1,
      inputTokens:  m.inputTokens  + row.input_tokens,
      outputTokens: m.outputTokens + row.output_tokens,
    })
  }

  const byEndpoint = [...endpointMap.entries()]
    .map(([endpoint, v]) => ({ endpoint, ...v }))
    .sort((a, b) => b.cost - a.cost)

  const byModel = [...modelMap.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.cost - a.cost)

  return NextResponse.json({
    thisMonth, lastMonth, allTime,
    byEndpoint, byModel,
    totalCalls: rows.length,
  } satisfies CostSummary)
}
