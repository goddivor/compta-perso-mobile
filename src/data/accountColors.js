// Palette handed out to accounts (user data colours, used by charts).
// The account form has no colour picker: a new account gets the first colour
// no other account uses; when all are used, the least used one.
export const ACCOUNT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
]

// accounts: rows with a `color` column → a palette colour
export function nextAccountColor(accounts) {
  const used = new Map(ACCOUNT_COLORS.map((c) => [c, 0]))
  for (const a of accounts || []) {
    const c = String(a.color || '').toUpperCase()
    if (used.has(c)) used.set(c, used.get(c) + 1)
  }
  let best = ACCOUNT_COLORS[0]
  for (const c of ACCOUNT_COLORS) if (used.get(c) < used.get(best)) best = c
  return best
}
