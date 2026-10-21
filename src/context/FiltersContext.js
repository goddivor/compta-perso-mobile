// Shared transactions filter state (v2) + search text, consumed by the
// Transactions list, the Filter screen and the Stats shortcuts.
//
// filters = {
//   accounts:   { include: [id…], exclude: [id…] },  tri-state chips
//   categories: { include: [id…|'none'], exclude: […] },
//   type: 'DEBIT' | 'CREDIT' | 'TRANSFER' | null,
//   period: 'today' | '7d' | '30d' | null,   ┐ mutually exclusive:
//   month: 'YYYY-MM' | null,                  │ setting one clears
//   range: { from, to } | null,               ┘ the other two
//   …plus the v1 fields (account_ids, accounts_exclude, category_ids,
//   categories_exclude, date_from, date_to) DERIVED for screens not yet
//   rewritten; setFilters() accepts either form.
// }
// Combination rule: with included chips, only those; otherwise everything
// except the excluded ones. `query` is ready for listTransactions().
import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import { emptyFilterState, normalizeFilters, toQuery, countActive, cycleTri } from '../utils/filters'

// Legacy fields derived from a v2 state (kept so v1 screens read them)
const legacyOf = (f) => {
  const q = toQuery(f)
  return {
    account_ids: q.account_ids,
    accounts_exclude: q.accounts_exclude,
    category_ids: q.category_ids,
    categories_exclude: q.categories_exclude,
    date_from: q.date_from,
    date_to: q.date_to,
  }
}

const expose = (f) => ({ ...f, ...legacyOf(f) })

// Empty filters, in the exposed form (v2 fields + derived v1 fields)
export const emptyFilters = expose(emptyFilterState())

const FiltersContext = createContext(null)

export function FiltersProvider({ children }) {
  const [state, setState] = useState(emptyFilterState)
  const [search, setSearch] = useState('')

  // setFilters(next | (current) => next); next may be v2, v1 or a mix
  const setFilters = useCallback((next) => {
    setState((prev) => normalizeFilters(typeof next === 'function' ? next(expose(prev)) : next))
  }, [])
  const resetFilters = useCallback(() => setState(emptyFilterState()), [])

  const setPeriod = useCallback((period) => setState((f) => ({ ...f, period, month: null, range: null })), [])
  const setMonth = useCallback((month) => setState((f) => ({ ...f, month, period: null, range: null })), [])
  const setRange = useCallback((range) => setState((f) => ({ ...f, range, period: null, month: null })), [])
  const setType = useCallback((type) => setState((f) => ({ ...f, type })), [])
  const cycleAccount = useCallback((id) => setState((f) => ({ ...f, accounts: cycleTri(f.accounts, id) })), [])
  const cycleCategory = useCallback((id) => setState((f) => ({ ...f, categories: cycleTri(f.categories, id) })), [])

  const value = useMemo(() => {
    const filters = expose(state)
    return {
      filters,
      query: toQuery(state),
      activeCount: countActive(state),
      setFilters,
      resetFilters,
      setPeriod,
      setMonth,
      setRange,
      setType,
      cycleAccount,
      cycleCategory,
      search,
      setSearch,
    }
  }, [state, search, setFilters, resetFilters, setPeriod, setMonth, setRange, setType, cycleAccount, cycleCategory])

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider')
  return ctx
}
