// React hooks over the registry getters. Each returns
// { data, loading, error, retry } — data null until loaded; error.code is
// 'offline' or 'not_found'. Values already in memory are returned at once.
// When a registry check swaps a file in, every mounted hook re-reads it in
// place (the previous value stays on screen until the new one is ready).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  getCountries, getCountry, getCurrencies, getCurrency, getOperators, getOperator,
  getSvg, getLogo, peekOperator, peekLogo, getInternationalFor,
  checkRegistry, subscribeRegistry, getRegistryRevision, isRegistryBusy, subscribeRegistryBusy,
} from './api'

// Revision of the registry data (increases when a check swaps files in)
export const useRegistryRevision = () => useSyncExternalStore(subscribeRegistry, getRegistryRevision)

// True while a registry check or download runs
export const useRegistryBusy = () => useSyncExternalStore(subscribeRegistryBusy, isRegistryBusy)

function useAsyncValue(load, key, initial) {
  const [state, setState] = useState(() => ({ data: initial ?? null, loading: initial === undefined && key != null, error: null }))
  const [attempt, setAttempt] = useState(0)
  const revision = useRegistryRevision()
  const initialRef = useRef(initial)
  initialRef.current = initial
  const keyRef = useRef(key)
  useEffect(() => {
    if (key == null) { keyRef.current = key; setState({ data: null, loading: false, error: null }); return }
    let alive = true
    // a new key never shows the previous key's value; a new revision of the
    // same key keeps it until the reload ends
    if (keyRef.current !== key) {
      keyRef.current = key
      setState({ data: initialRef.current ?? null, loading: initialRef.current === undefined, error: null })
    }
    load()
      .then((data) => { if (alive) setState({ data, loading: false, error: null }) })
      .catch((error) => { if (alive) setState((s) => (s.data != null ? { ...s, loading: false } : { data: null, loading: false, error })) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, revision])
  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { ...state, retry }
}

// All countries
export const useCountries = () => useAsyncValue(getCountries, 'countries')
// One country by ISO2 (null key → data null)
export const useCountry = (iso2) => useAsyncValue(() => getCountry(iso2), iso2 || null)
// All currencies
export const useCurrencies = () => useAsyncValue(getCurrencies, 'currencies')
// One currency by code
export const useCurrency = (code) => useAsyncValue(() => getCurrency(code), code || null)
// Operators of one country
export const useOperators = (iso2) => useAsyncValue(() => getOperators(iso2), iso2 || null)
// International services available in one country
export const useInternational = (iso2) => useAsyncValue(() => getInternationalFor(iso2), iso2 || null)
// One operator by id
export const useOperator = (id) => useAsyncValue(() => getOperator(id), id || null, peekOperator(id))
// SVG source of a registry path
export const useSvg = (path) => useAsyncValue(() => getSvg(path), path || null)
// Logo of an operator: { xml, layout, background } or null (no logo)
export const useLogo = (operatorId) => useAsyncValue(() => getLogo(operatorId), operatorId || null, peekLogo(operatorId))

// Checks the registry for an update each time the screen gains focus while
// `enabled` (at most once per 15 minutes, in the background, silent)
export function useRegistryCheck(iso2, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (enabled) checkRegistry({ iso2 })
    }, [iso2, enabled]),
  )
}
