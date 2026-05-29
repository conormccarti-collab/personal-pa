export interface CategoryRule {
  id: string
  keyword: string    // matched case-insensitively
  category: string
  sort_order: number
}

/**
 * Derive a task category from a text string (section name or task title).
 * User-defined rules are checked first, then built-in keyword fallbacks.
 */
export function categoryFromText(
  text: string | null,
  userRules: CategoryRule[] = []
): string | null {
  if (!text) return null
  const s = text.toLowerCase()

  // User-defined rules (ordered by sort_order)
  for (const rule of userRules) {
    if (s.includes(rule.keyword.toLowerCase())) return rule.category
  }

  // Built-in fallbacks
  if (s.includes('shoot') || s.includes('filming') || s.includes('photography') || s.includes('recce')) return 'Shoot'
  if (s.includes('edit') && !s.includes('pre-edit') && !s.includes('pre edit') && !s.includes('review')) return 'Editing'
  if (s.includes('planning') || s.includes('pre-production') || s.includes('pre production')) return 'Planning & Pre-Production'
  if (s.includes('pre-edit') || s.includes('pre edit') || s.includes('brief')) return 'Pre-Edit Review'
  if (s.includes('review')) return 'Review'
  if (s.includes('idea') || s.includes('ideation')) return 'Ideas'
  return null
}
