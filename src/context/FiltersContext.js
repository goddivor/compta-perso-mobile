// Shared transactions filter state: search text + filters, consumed by
// TransactionsScreen (list + search bar + quick account fan), FilterScreen
// (full-screen filter) and the Stats legend shortcuts.
// Accounts and categories are MULTI-select lists with an optional exclude
// mode; category_ids may contain the special value 'none' (uncategorized).
import { createContext, useContext, useMemo, useState, useCallback } from 'react'

export const emptyFilters = {
  account_ids: [],          // [] = every account; else list of account ids
  accounts_exclude: false,  // true = every account EXCEPT account_ids
  type: null,               // 'CREDIT' | 'DEBIT' | null
  category_ids: [],         // [] = every category; may contain 'none'
  categories_exclude: false,
  date_from: null,          // 'YYYY-MM-DD' | null
  date_to: null,            // 'YYYY-MM-DD' | null
}

const FiltersContext = createContext(null)

export function FiltersProvider({ children }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')

  const resetFilters = useCallback(() => setFilters(emptyFilters), [])

  // One unit per active filter group (accounts, type, categories, period)
  const activeCount = useMemo(
    () =>
      (filters.account_ids.length > 0 ? 1 : 0) +
      (filters.type ? 1 : 0) +
      (filters.category_ids.length > 0 ? 1 : 0) +
      (filters.date_from || filters.date_to ? 1 : 0),
    [filters]
  )

  const value = useMemo(
    () => ({ filters, setFilters, resetFilters, search, setSearch, activeCount }),
    [filters, resetFilters, search, activeCount]
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider')
  return ctx
}
