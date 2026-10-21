// "Hide amounts" switch (the eye in the Home app bar). Every v2 <Amount>
// reads it and shows a mask instead of the figure. Persisted per device.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'amounts_hidden' // '1' | '0'
const PrivacyContext = createContext({ hidden: false, setHidden: () => {}, toggleHidden: () => {} })

export function PrivacyProvider({ children }) {
  const [hidden, setHiddenState] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setHiddenState(v === '1'))
      .catch((e) => console.warn('amounts_hidden read failed', e))
  }, [])

  const setHidden = useCallback((v) => {
    setHiddenState(!!v)
    AsyncStorage.setItem(KEY, v ? '1' : '0').catch((e) => console.warn('amounts_hidden write failed', e))
  }, [])
  const toggleHidden = useCallback(() => setHiddenState((v) => {
    AsyncStorage.setItem(KEY, v ? '0' : '1').catch((e) => console.warn('amounts_hidden write failed', e))
    return !v
  }), [])

  const value = useMemo(() => ({ hidden, setHidden, toggleHidden }), [hidden, setHidden, toggleHidden])
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

// { hidden, setHidden(bool), toggleHidden() }
export const usePrivacy = () => useContext(PrivacyContext)
