/** Brand colour map — keyed by the exact project code prefix */
export const BRAND_COLORS: Record<string, string> = {
  WS:   '#115177',
  WI:   '#438222',
  WE:   '#8a1e27',
  WG:   '#157379',
  MVLT: '#cca054',
}

/**
 * Returns the brand hex colour for a task's project name, or null if none match.
 * Matches the first word/token before a space, dash, or underscore.
 * e.g. "WS - Campaign Brief" → '#115177'
 */
export function getBrandColor(project: string | null | undefined): string | null {
  if (!project) return null
  const first = project.toUpperCase().split(/[\s\-_/]/)[0]
  return BRAND_COLORS[first] ?? null
}
