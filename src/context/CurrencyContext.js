// Currency label of every amount: the profile currency's registry symbol
// ('R', '₦', 'F CFA'…), or its ISO code while the registry is not cached.
// Resolved once at boot (App.js, file cache only, before the first render)
// and again whenever the profile's currency or country changes (re-read on
// every data tick, e.g. after onboarding). The label lives in utils/format
// (fmt, fmtParts, CURRENCY_LABEL) so non-React code formats with it too;
// this provider re-renders the subscribed amounts (<Amount>) when it changes.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getProfile } from '../db/database'
import { currencyLabel } from '../registry'
import { getCurrencyLabel, setCurrencyLabel } from '../utils/format'
import { useTick } from './AppContext'

const CurrencyContext = createContext('')

// Label of the stored profile; cacheOnly never waits on the network
export async function resolveProfileCurrencyLabel({ cacheOnly = false } = {}) {
  const { currency, country_iso2 } = getProfile()
  return currencyLabel(currency, country_iso2, { cacheOnly })
}

function readProfile() {
  try {
    const p = getProfile()
    return { currency: p.currency || null, iso2: p.country_iso2 || null }
  } catch (e) {
    console.warn('currency: profile read failed', e)
    return { currency: null, iso2: null }
  }
}

export function CurrencyProvider({ children }) {
  const tick = useTick()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { currency, iso2 } = useMemo(readProfile, [tick])
  const [label, setLabel] = useState(getCurrencyLabel)

  useEffect(() => {
    let alive = true
    if (!currency) { setLabel(''); return undefined }
    // Cache first (instant), then the network when the cache had nothing
    currencyLabel(currency, iso2, { cacheOnly: true }).then((cached) => {
      if (!alive) return
      setLabel(cached)
      if (cached !== currency) return
      currencyLabel(currency, iso2).then((full) => { if (alive) setLabel(full) })
    })
    return () => { alive = false }
  }, [currency, iso2])

  // Module-level label updated BEFORE children render (fmt() included)
  setCurrencyLabel(label)
  return <CurrencyContext.Provider value={label}>{children}</CurrencyContext.Provider>
}

// The current currency label; subscribing re-renders on a change
export const useCurrencyLabel = () => useContext(CurrencyContext)
