// Shared transactions filter state: search text + filters, consumed by
// TransactionsScreen (list + search bar) and FilterScreen (full-screen filter).
import { createContext, useContext, useMemo, useState, useCallback } from 'react'

export const emptyFilters = {
  account_id: null,   // number | null
  type: null,         // 'CREDIT' | 'DEBIT' | null
  category_id: null,  // number | null
  date_from: null,    // 'YYYY-MM-DD' | null
  date_to: null,      // 'YYYY-MM-DD' | null
}

const FiltersContext = createContext(null)

export function FiltersProvider({ children }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')

  const resetFilters = useCallback(() => setFilters(emptyFilters), [])

  const activeCount = useMemo(
    () => Object.entries(filters).filter(([, v]) => v !== null && v !== '').length,
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
