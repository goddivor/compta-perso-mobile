// Amount format of every amount: the profile currency's registry symbol
// ('FCFA', '₦', 'R'…, the ISO code while the registry is not cached) and the
// profile country's amountFormat (symbol position, spacing, separators).
// Resolved once at boot (App.js, file cache only, before the first render)
// and again on every data tick (profile change after onboarding, registry
// data refreshed in the cache). Both live in utils/format (fmt, fmtParts,
// CURRENCY_LABEL) so non-React code formats with them too; this provider
// re-renders the subscribed amounts (<Amount>) when either changes.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getProfile } from '../db/database'
import { getCountries, getCurrencies, currencySymbol } from '../registry'
import { getCachedJson } from '../registry/client'
import {
  getAmountFormat, getCurrencyLabel, normalizeAmountFormat, setAmountFormat, setCurrencyLabel, stripInvisible,
} from '../utils/format'
import { useTick } from './AppContext'

const CurrencyContext = createContext({ label: '', format: null })

// Registry lists, cache only (never the network) or cache then network.
// A failed read gives null: the other list still counts.
async function readLists(cacheOnly) {
  const safe = (p) => p.catch((e) => {
    if (!e?.code) console.warn('amount format: registry read failed', e?.message)
    return null
  })
  if (cacheOnly) {
    const [cur, cty] = await Promise.all([
      safe(getCachedJson('data/currencies.json')), safe(getCachedJson('data/countries.json')),
    ])
    return { currencies: cur?.currencies || null, countries: cty?.countries || null }
  }
  const [currencies, countries] = await Promise.all([safe(getCurrencies()), safe(getCountries())])
  return { currencies, countries }
}

// { label, format } for a currency code in a country:
//   label   registry symbol (localSymbols[iso2] ?? narrowSymbol ?? symbol)
//           kept exactly, or the code when unknown or invisible
//   format  the country's amountFormat + localSymbol (its main currency's
//           localSymbols[iso2]), or null (no country, registry v1 data).
//           Without it the label is compacted as before ('F CFA' → 'FCFA'):
//           the app locale's group space would make "1 234 F CFA" ambiguous.
export async function resolveAmountFormat(code, iso2, { cacheOnly = false } = {}) {
  if (!code) return { label: '', format: null }
  const iso = iso2 ? String(iso2).toUpperCase() : null
  const { currencies, countries } = await readLists(cacheOnly)
  const cur = currencies?.find((c) => c.code === code)
  const symbol = cur ? stripInvisible(currencySymbol(cur, iso)) : ''
  const country = iso ? countries?.find((c) => c.iso2 === iso) : null
  const af = country?.amountFormat
  if (!af) {
    const compact = symbol.replace(/\s+/g, '')
    return { label: compact || code, format: null }
  }
  const main = currencies?.find((c) => c.code === country.currencies?.[0])
  const format = normalizeAmountFormat({ ...af, localSymbol: main?.localSymbols?.[iso] ?? null })
  return { label: symbol.trim() ? symbol : code, format }
}

// Format of the stored profile, applied to utils/format; resolves to the
// label (App.js sets it again with setCurrencyLabel, a no-op)
export async function resolveProfileCurrencyLabel({ cacheOnly = false } = {}) {
  const { currency, country_iso2 } = getProfile()
  const { label, format } = await resolveAmountFormat(currency, country_iso2, { cacheOnly })
  setAmountFormat(format)
  setCurrencyLabel(label)
  return label
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

const sameValue = (a, b) => a.label === b.label && JSON.stringify(a.format) === JSON.stringify(b.format)

export function CurrencyProvider({ children }) {
  const tick = useTick()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { currency, iso2 } = useMemo(readProfile, [tick])
  const [value, setValue] = useState(() => ({ label: getCurrencyLabel(), format: getAmountFormat() }))
  const networked = useRef(null) // profile key already looked up on the network

  useEffect(() => {
    let alive = true
    const apply = (next) => { if (alive) setValue((prev) => (sameValue(prev, next) ? prev : next)) }
    if (!currency) { apply({ label: '', format: null }); return undefined }
    const key = `${currency}|${iso2 || ''}`
    // Cache first (instant, re-read on every tick for refreshed registry
    // data), then the network once per profile when the cache lacked data
    resolveAmountFormat(currency, iso2, { cacheOnly: true }).then((cached) => {
      if (!alive) return
      apply(cached)
      const missing = cached.label === currency || (iso2 && !cached.format)
      if (!missing || networked.current === key) return
      networked.current = key
      resolveAmountFormat(currency, iso2).then(apply)
    })
    return () => { alive = false }
  }, [currency, iso2, tick])

  // Module-level format updated BEFORE children render (fmt() included)
  setAmountFormat(value.format)
  setCurrencyLabel(value.label)
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

// The current currency label; subscribing re-renders on any format change
export const useCurrencyLabel = () => useContext(CurrencyContext).label

// { label, format } of the amounts; subscribe to re-render on a change
export const useAmountFormat = () => useContext(CurrencyContext)
