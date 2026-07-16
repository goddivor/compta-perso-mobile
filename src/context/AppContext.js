// Global refetch context — mobile equivalent of the desktop `tick`.
// Any screen that mutates data calls refresh(); screens re-query on tick.
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AppContext = createContext({ tick: 0, refresh: () => {} })

export function AppProvider({ children }) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const value = useMemo(() => ({ tick, refresh }), [tick, refresh])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => useContext(AppContext)
