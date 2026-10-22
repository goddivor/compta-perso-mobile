// Currency and date formatting helpers. The active locale follows the app
// language (set by the I18nProvider via setFormatLocale); default en-US.
// The currency label is the profile currency's symbol, set at start and on
// every profile change by the CurrencyProvider (context/CurrencyContext.js)
// through setCurrencyLabel: the registry's local symbol ('R', '₦', 'F CFA'),
// or the ISO code while the registry is not cached. Empty before onboarding.

let locale = 'en-US'
export const setFormatLocale = (l) => { locale = l || 'en-US' }
export const getFormatLocale = () => locale

// Live binding: modules importing CURRENCY_LABEL read the current value at
// use time (ES module semantics, kept by Metro's CommonJS transform).
export let CURRENCY_LABEL = ''
export const setCurrencyLabel = (label) => { CURRENCY_LABEL = label ? String(label) : '' }
export const getCurrencyLabel = () => CURRENCY_LABEL

export const fmtNumber = (n) =>
  new Intl.NumberFormat(locale).format(Math.round(n || 0))

// "12 500 R", or the bare number while no currency is known
export const fmt = (n) => (CURRENCY_LABEL ? fmtNumber(n) + ' ' + CURRENCY_LABEL : fmtNumber(n))

export const fmtSigned = (type, n) =>
  (type === 'CREDIT' ? '+' : '-') + fmt(n)

// v2 split form of fmt() for styled amounts (number and a quieter currency
// suffix): { sign, number, currency }. sign is '+' (CREDIT), '−' (U+2212,
// DEBIT or a negative balance) or ''. fmt(n) === number + ' ' + currency
// (currency '' → fmt(n) === number).
export const fmtParts = (n, type = null) => {
  const v = Math.round(n || 0)
  const sign = type === 'CREDIT' ? '+' : type === 'DEBIT' || (!type && v < 0) ? '\u2212' : ''
  return { sign, number: fmtNumber(Math.abs(v)), currency: CURRENCY_LABEL }
}

// First letter upper-cased in the app locale: CLDR names some currencies in
// lower case in French ('naira nigérian'), shown alone they read as a title
export const capitalizeFirst = (s) => {
  const str = String(s ?? '')
  return str ? str.charAt(0).toLocaleUpperCase(locale) + str.slice(1) : str
}

export const fmtDate = (s) =>
  s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString(locale) : '—'

// Long day label for list group headers, e.g. "mercredi 16 juillet 2026"
export const fmtDay = (day) => {
  if (!day) return '—'
  const d = new Date(day + 'T00:00:00')
  const label = d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const fmtDateTime = (s) =>
  s ? new Date(s).toLocaleString(locale) : '—'

// Localized month name (0-based index), capitalized, e.g. "Janvier" / "January"
export const monthName = (monthIndex) => {
  const label = new Date(2000, monthIndex, 1).toLocaleDateString(locale, { month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Short month label for chart axes from 'YYYY-MM', e.g. "janv. 26" / "Jan 26"
export const monthShortLabel = (ym) => {
  const [y, m] = ym.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(locale, { month: 'short' })
  return `${label.replace(/\.$/, '')} ${y.slice(2)}`
}

// Weekday initials, Monday first, e.g. ['L','M','M','J','V','S','D']
export const weekdayInitials = () => {
  const out = []
  for (let i = 0; i < 7; i++) {
    // 2024-01-01 is a Monday
    const label = new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })
    out.push(label.toUpperCase())
  }
  return out
}

export const today = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Shift an ISO day string (YYYY-MM-DD) by n days
export const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const isValidDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00').getTime())
