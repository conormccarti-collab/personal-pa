export const TODO_CATEGORIES = [
  { name: 'Shoot',           color: '#c2410c' },
  { name: 'Editing Video',   color: '#7c3aed' },
  { name: 'Editing Photos',  color: '#0e7490' },
  { name: 'Pre-production',  color: '#b45309' },
  { name: 'Ideation',        color: '#059669' },
  { name: 'Google Calendar', color: '#1a73e8' },
  { name: 'Misc',            color: '#64748b' },
] as const

export type TodoCategoryName = (typeof TODO_CATEGORIES)[number]['name']

/** Look up the color for a known category name (case-insensitive). */
export function colorForCategory(name: string): string | null {
  const match = TODO_CATEGORIES.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  )
  return match?.color ?? null
}
