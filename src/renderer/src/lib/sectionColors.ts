// Section auto-colour rotation, shared by the Smart Stack applier (actionExecutor)
// and the Smart Stack modal so new sections look native and avoid reusing a colour
// already on the canvas when possible. Same palette as SectionWidget.

export const SECTION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#737373']

export function pickColors(usedColors: string[], n: number): string[] {
  const available = SECTION_COLORS.filter((c) => !usedColors.includes(c))
  const pool = available.length >= n ? available : [...available, ...SECTION_COLORS]
  return pool.slice(0, n)
}
