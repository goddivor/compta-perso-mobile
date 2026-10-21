// React hooks over the registry getters. Each returns
// { data, loading, error, retry } — data null until loaded; error.code is
// 'offline' or 'not_found'. Values already in memory are returned at once.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCountries, getCountry, getCurrencies, getCurrency, getOperators, getOperator,
  getSvg, getLogo, peekOperator, peekLogo,
} from './api'

function useAsyncValue(load, key, initial) {
  const [state, setState] = useState(() => ({ data: initial ?? null, loading: initial === undefined && key != null, error: null }))
  const [attempt, setAttempt] = useState(0)
  const initialRef = useRef(initial)
  initialRef.current = initial
  useEffect(() => {
    if (key == null) { setState({ data: null, loading: false, error: null }); return }
    let alive = true
    // a new key never shows the previous key's value
    setState({ data: initialRef.current ?? null, loading: initialRef.current === undefined, error: null })
    load()
      .then((data) => { if (alive) setState({ data, loading: false, error: null }) })
      .catch((error) => { if (alive) setState({ data: null, loading: false, error }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])
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
// One operator by id
export const useOperator = (id) => useAsyncValue(() => getOperator(id), id || null, peekOperator(id))
// SVG source of a registry path
export const useSvg = (path) => useAsyncValue(() => getSvg(path), path || null)
// Logo of an operator: { xml, layout, background } or null (no logo)
export const useLogo = (operatorId) => useAsyncValue(() => getLogo(operatorId), operatorId || null, peekLogo(operatorId))
