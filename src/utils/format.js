// Currency and date formatting helpers. The active locale follows the app
// language (set by the I18nProvider via setFormatLocale); default en-US. It
// drives dates, and amounts only while the profile country has no amount
// format.
//
// Amounts follow the profile country's registry amountFormat (registry v2,
// countries[].amountFormat): symbol before or after the number, the exact
// spaces of the data (U+00A0 / U+202F kept), the group separator. Set by the
// CurrencyProvider (context/CurrencyContext.js) at start and on every change:
//   setAmountFormat(format)  the country's { pattern, signPattern,
//                            alphaPattern, group, decimal, localSymbol } or null
//   setCurrencyLabel(label)  the symbol shown: the registry symbol of the
//                            profile currency ('FCFA', '₦', 'R'), or its ISO
//                            code while the registry is not cached; '' before
//                            onboarding (bare numbers)
// Pattern choice (registry SCHEMA "Amount format"): `pattern` when the symbol
// is the country's own (localSymbols[country] of its main currency); else
// `signPattern` when the symbol's character next to the number is a Unicode
// symbol (₦, $, ₵), `alphaPattern` for a letter (Ksh, KES).
// Without a country format (registry v1 cache, no country): the app locale's
// separators and "2 000 SYMBOL", as before.
// Amounts are whole: the ledger stores whole amounts, every figure is rounded.
// Sign convention: the minus (U+2212) or plus goes before the whole amount,
// symbol included, as CLDR does: −₦2,000, −R2 000, −2 000 FCFA.

let locale = 'en-US'
export const setFormatLocale = (l) => {
  const next = l || 'en-US'
  if (next === locale) return
  locale = next
  compile()
}
export const getFormatLocale = () => locale

const MINUS = '\u2212'
const NUMBER = '#,##0'
const PLACEHOLDER = '\u00a4' // ¤
// Invisible characters the data may carry (zero-width, bidi marks, BOM):
// dropped, never injected
const INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g
export const stripInvisible = (s) => String(s ?? '').replace(INVISIBLE, '')

// A Unicode symbol character (\p{S}); fallback list where the engine lacks
// property escapes
const SYMBOL_CHAR = (() => {
  try { return new RegExp('^\\p{S}$', 'u') } catch (e) {
    return /^[$+<=>^`|~\u00a2-\u00a9\u00ac\u00ae-\u00b1\u00b4\u00b8\u00d7\u00f7\u058f\u060b\u20a0-\u20cf\ufdfc]$/
  }
})()

// Live binding: modules importing CURRENCY_LABEL read the current value at
// use time (ES module semantics, kept by Metro's CommonJS transform).
export let CURRENCY_LABEL = ''
let countryFormat = null
// Compiled form: { before, after, group } (group null → app locale's Intl)
let shape = { before: '', after: '', group: null, decimal: null }

const validPattern = (p) => typeof p === 'string' && p.includes(NUMBER) && p.includes(PLACEHOLDER)

// A registry amountFormat (+ localSymbol) cleaned, or null when unusable
export function normalizeAmountFormat(f) {
  if (!f || typeof f !== 'object') return null
  const pattern = stripInvisible(f.pattern)
  if (!validPattern(pattern)) return null
  const pick = (p) => (validPattern(stripInvisible(p)) ? stripInvisible(p) : pattern)
  return {
    pattern,
    signPattern: pick(f.signPattern),
    alphaPattern: pick(f.alphaPattern),
    group: typeof f.group === 'string' ? f.group : ',',
    decimal: typeof f.decimal === 'string' && f.decimal ? f.decimal : '.',
    localSymbol: f.localSymbol ? stripInvisible(f.localSymbol) : null,
  }
}

function compile() {
  const symbol = CURRENCY_LABEL
  const f = countryFormat
  if (!f) {
    shape = { before: '', after: symbol ? ' ' + symbol : '', group: null, decimal: null }
    return
  }
  let pattern = f.pattern
  if (symbol && symbol !== f.localSymbol) {
    const leading = f.signPattern.indexOf(PLACEHOLDER) < f.signPattern.indexOf(NUMBER)
    const chars = Array.from(symbol)
    const near = leading ? chars[chars.length - 1] : chars[0]
    pattern = SYMBOL_CHAR.test(near) ? f.signPattern : f.alphaPattern
  }
  const at = pattern.indexOf(NUMBER)
  let before = pattern.slice(0, at)
  let after = pattern.slice(at + NUMBER.length)
  if (symbol) {
    before = before.split(PLACEHOLDER).join(symbol)
    after = after.split(PLACEHOLDER).join(symbol)
  } else {
    // No currency yet: the bare number, without the symbol's spacing
    before = ''
    after = ''
  }
  shape = { before, after, group: f.group, decimal: f.decimal }
}

export const setCurrencyLabel = (label) => {
  const next = label ? stripInvisible(String(label)) : ''
  if (next === CURRENCY_LABEL) return
  CURRENCY_LABEL = next
  compile()
}
export const getCurrencyLabel = () => CURRENCY_LABEL

// format: a registry amountFormat with its localSymbol (normalized here), or null
export const setAmountFormat = (format) => {
  const next = normalizeAmountFormat(format)
  if (JSON.stringify(next) === JSON.stringify(countryFormat)) return
  countryFormat = next
  compile()
}
export const getAmountFormat = () => countryFormat

// Digits of a whole, non-negative amount with the active group separator
function groupDigits(abs) {
  if (shape.group == null) return new Intl.NumberFormat(locale).format(abs)
  return String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, shape.group)
}

const whole = (n) => Math.round(Number(n) || 0)

// The grouped number alone ("2 000", "2,000"), "−" when negative
export const fmtNumber = (n) => {
  const v = whole(n)
  return (v < 0 ? MINUS : '') + groupDigits(Math.abs(v))
}

// Split form of an amount for styled rendering:
//   { sign, before, number, after, currency }
// sign is '+' (CREDIT), '−' (U+2212, DEBIT or a negative balance) or '';
// before / after carry the symbol with its spacing on its side of the number
// ('' on the other side); currency is the bare symbol (CURRENCY_LABEL).
// sign + before + number + after === fmt(n) (no type) or fmtSigned(type, n).
export const fmtParts = (n, type = null) => {
  const v = whole(n)
  const sign = type === 'CREDIT' ? '+' : type === 'DEBIT' || (!type && v < 0) ? MINUS : ''
  return { sign, before: shape.before, number: groupDigits(Math.abs(v)), after: shape.after, currency: CURRENCY_LABEL }
}

const join = (p) => p.sign + p.before + p.number + p.after

// "2 000 FCFA", "₦2,000", "R2 000"; the bare number while no currency is known
export const fmt = (n) => join(fmtParts(n))

// "+₦2,000" (CREDIT) or "−₦2,000" (anything else); the amount's own sign is ignored
export const fmtSigned = (type, n) => join(fmtParts(n, type === 'CREDIT' ? 'CREDIT' : 'DEBIT'))

// Compact figure for chart axes: 950, 12k, 1,5M (country's decimal mark)
export const fmtCompact = (n) => {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  if (abs >= 1e6) {
    if (shape.decimal == null) return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v / 1e6) + 'M'
    // A currency's own decimal mark (Cape Verde's '$') stays out of axes
    const mark = /^[.,]$/.test(shape.decimal) ? shape.decimal : shape.group === '.' ? ',' : '.'
    const r = Math.round(abs / 1e5) / 10
    return (v < 0 ? '-' : '') + String(r).replace('.', mark) + 'M'
  }
  if (abs >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(Math.round(v))
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
