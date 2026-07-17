// Global refetch context — mobile equivalent of the desktop `tick`.
// Split in two contexts so screens that only MUTATE data (forms) subscribe
// to the stable refresh() and never re-render when the tick changes; only
// screens that READ data subscribe to the tick.
import { createContext, useCallback, useContext, useState } from 'react'

const TickContext = createContext(0)
const RefreshContext = createContext(() => {})

export function AppProvider({ children }) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return (
    <RefreshContext.Provider value={refresh}>
      <TickContext.Provider value={tick}>{children}</TickContext.Provider>
    </RefreshContext.Provider>
  )
}

// Stable — safe for forms, never triggers a re-render
export const useRefresh = () => useContext(RefreshContext)

// Re-renders on every data mutation — for screens displaying data
export const useTick = () => useContext(TickContext)

// Convenience for screens needing both
export const useApp = () => ({ tick: useTick(), refresh: useRefresh() })
