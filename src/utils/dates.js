// Short, language-aware day labels for v2 rows ("Aujourd’hui", "Hier",
// "17 oct.", "17 oct. 2025") and month helpers shared by the filters.
// Kept apart from format.js because it needs t() (i18n imports format.js).
import { t } from '../i18n'
import { getFormatLocale, today, shiftDay } from './format'

// 'YYYY-MM-DD' (or a full timestamp) → "Aujourd’hui" / "Hier" / "17 oct." / "17 oct. 2025"
export function shortDate(value) {
  if (!value) return ''
  const day = String(value).slice(0, 10)
  const now = today()
  if (day === now) return t('common.today')
  if (day === shiftDay(now, -1)) return t('common.yesterday')
  const d = new Date(day + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const opts = { day: 'numeric', month: 'short' }
  if (day.slice(0, 4) !== now.slice(0, 4)) opts.year = 'numeric'
  return d.toLocaleDateString(getFormatLocale(), opts)
}

// 'YYYY-MM' of a day ('YYYY-MM-DD'), default today
export const monthKey = (day = today()) => String(day).slice(0, 7)

// First and last day of a 'YYYY-MM' month → { from, to }
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

// The n months before (and including) the current one, newest first: ['2026-10', '2026-09', …]
export function recentMonths(n = 12, from = today()) {
  const out = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return out
}
