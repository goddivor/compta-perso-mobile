// Pure helpers for the v2 transaction filters (shape documented in
// context/FiltersContext.js). No React here: screens and the context share them.
import { today, shiftDay } from './format'
import { monthRange } from './dates'

export const PERIODS = ['today', '7d', '30d'] // quick periods, newest window first
export const TX_TYPES = ['DEBIT', 'CREDIT', 'TRANSFER'] // null = every type

const emptySet = () => ({ include: [], exclude: [] })

// The v2 filter state with nothing selected
export const emptyFilterState = () => ({
  accounts: emptySet(), // account ids
  categories: emptySet(), // category ids, may contain 'none' (uncategorized)
  type: null, // 'DEBIT' | 'CREDIT' | 'TRANSFER' | null
  period: null, // 'today' | '7d' | '30d' | null   } at most one of
  month: null, // 'YYYY-MM' | null                  } period, month
  range: null, // { from: 'YYYY-MM-DD'|null, to: … } } and range
})

// State of one chip: 'neutral' | 'include' | 'exclude'
export function triState(set, id) {
  if (set.include.includes(id)) return 'include'
  if (set.exclude.includes(id)) return 'exclude'
  return 'neutral'
}

// One tap: neutral → include → exclude → neutral. Returns a new set.
export function cycleTri(set, id) {
  const st = triState(set, id)
  const include = set.include.filter((x) => x !== id)
  const exclude = set.exclude.filter((x) => x !== id)
  if (st === 'neutral') include.push(id)
  else if (st === 'include') exclude.push(id)
  return { include, exclude }
}

// Days covered by the period / month / range → { from, to } (nulls = open)
export function dateBounds(f) {
  if (f.period) {
    const now = today()
    const back = { today: 0, '7d': 6, '30d': 29 }[f.period] ?? 0
    return { from: shiftDay(now, -back), to: now }
  }
  if (f.month) return monthRange(f.month)
  if (f.range) return { from: f.range.from || null, to: f.range.to || null }
  return { from: null, to: null }
}

// Included ids win; without them, every id except the excluded ones
function toLegacySet(set) {
  if (set.include.length) return { ids: [...set.include], exclude: false }
  if (set.exclude.length) return { ids: [...set.exclude], exclude: true }
  return { ids: [], exclude: false }
}

// v2 state → the query shape of database.listTransactions():
// { account_ids, accounts_exclude, category_ids, categories_exclude, type,
//   date_from, date_to, transfers_only }. The 'TRANSFER' type becomes
// transfers_only: listTransactions then keeps only transfer legs (rows with
// a transfer_pair_id); type stays null so both legs are listed.
export function toQuery(f) {
  const a = toLegacySet(f.accounts)
  const c = toLegacySet(f.categories)
  const { from, to } = dateBounds(f)
  return {
    account_ids: a.ids,
    accounts_exclude: a.exclude,
    category_ids: c.ids,
    categories_exclude: c.exclude,
    type: f.type === 'DEBIT' || f.type === 'CREDIT' ? f.type : null,
    transfers_only: f.type === 'TRANSFER',
    date_from: from,
    date_to: to,
  }
}

// Number of active filter groups (accounts, type, categories, dates)
export function countActive(f) {
  return (f.accounts.include.length || f.accounts.exclude.length ? 1 : 0) +
    (f.type ? 1 : 0) +
    (f.categories.include.length || f.categories.exclude.length ? 1 : 0) +
    (f.period || f.month || f.range ? 1 : 0)
}

/* ------------- v1 compatibility (screens not yet rewritten) ------------- */

const sameIds = (a = [], b = []) => a.length === b.length && a.every((x, i) => String(x) === String(b[i]))

const fromLegacySet = (ids = [], exclude = false) =>
  exclude ? { include: [], exclude: [...ids] } : { include: [...ids], exclude: [] }

// Accepts a v2 state, a v1 object (account_ids, accounts_exclude,
// category_ids, categories_exclude, date_from, date_to) or a mix built by
// spreading the exposed filters: a v1 field that differs from what the v2
// fields imply wins, so v1 screens keep working unchanged.
export function normalizeFilters(obj) {
  const base = emptyFilterState()
  const f = {
    accounts: obj?.accounts ? { include: [...obj.accounts.include], exclude: [...obj.accounts.exclude] } : base.accounts,
    categories: obj?.categories ? { include: [...obj.categories.include], exclude: [...obj.categories.exclude] } : base.categories,
    type: obj?.type ?? null,
    period: obj?.period ?? null,
    month: obj?.month ?? null,
    range: obj?.range ?? null,
  }
  if (!obj) return f
  const q = toQuery(f)
  if ('account_ids' in obj || 'accounts_exclude' in obj) {
    const ids = obj.account_ids || []
    const ex = !!obj.accounts_exclude && ids.length > 0
    if (!sameIds(ids, q.account_ids) || ex !== q.accounts_exclude) f.accounts = fromLegacySet(ids, ex)
  }
  if ('category_ids' in obj || 'categories_exclude' in obj) {
    const ids = obj.category_ids || []
    const ex = !!obj.categories_exclude && ids.length > 0
    if (!sameIds(ids, q.category_ids) || ex !== q.categories_exclude) f.categories = fromLegacySet(ids, ex)
  }
  if ('date_from' in obj || 'date_to' in obj) {
    const from = obj.date_from || null
    const to = obj.date_to || null
    if (from !== q.date_from || to !== q.date_to) {
      f.period = null
      f.month = null
      f.range = from || to ? { from, to } : null
    }
  }
  // period, month and range are mutually exclusive: keep the first set
  if (f.period) { f.month = null; f.range = null } else if (f.month) f.range = null
  return f
}
