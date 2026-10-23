// Registry getters (countries, currencies, operators, SVG art).
// Data shapes: registry/SCHEMA.md (countries[], currencies[], operators[]).
// Every getter is async: memory, then file cache, then network.
// Live updates: checkRegistry (client.js) swaps changed files in; the
// operator index below follows.
import {
  getText, getJson, getCachedJson, getLogoText, peek, remember, subscribeRegistry,
  REGISTRY_TAG, REGISTRY_BASE,
} from './client'
import { logoLayout } from './logo'

export { REGISTRY_TAG, REGISTRY_BASE, logoLayout }
export {
  checkRegistry, subscribeRegistry, getRegistryRevision, isRegistryBusy, subscribeRegistryBusy,
  CHECK_INTERVAL_MS, STARTUP_INTERVAL_MS,
} from './client'

// All 54 countries: [{ iso2, name: { fr, en }, flag: { svgSquare… }, currencies: ['XOF'] }]
export const getCountries = async () => (await getJson('data/countries.json')).countries

// One country by ISO2 ('TG'), or null
export const getCountry = async (iso2) => (await getCountries()).find((c) => c.iso2 === String(iso2).toUpperCase()) || null

// All currencies: [{ code, name: { fr, en }, symbol, narrowSymbol, localSymbols, decimals, sign: { text, svg, svgColor } }]
export const getCurrencies = async () => (await getJson('data/currencies.json')).currencies

// One currency by code ('XOF'), or null
export const getCurrency = async (code) => (await getCurrencies()).find((c) => c.code === code) || null

// Symbol to show for a currency in a country: localSymbols[iso2] ?? narrowSymbol ?? symbol
export const currencySymbol = (currency, iso2) =>
  currency ? (currency.localSymbols?.[iso2] ?? currency.narrowSymbol ?? currency.symbol) : ''

// Invisible characters a symbol may carry (zero-width, bidi marks, BOM)
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g

// Label amounts carry for a currency code in a country: the registry symbol
// (currencySymbol) when the currency is known and the symbol is visible,
// the ISO code otherwise (registry not cached, code unknown to it). Spaces
// inside the symbol are dropped ('F CFA' becomes one token): the label
// follows the number after one space, and fr-FR uses the same narrow space
// (U+202F) as thousands separator, so "1 234 F CFA" would read as a longer
// number.
//   cacheOnly: read the registry from memory or the file cache only (boot);
//   a failed or offline read also falls back to the code. '' for no code.
export async function currencyLabel(code, iso2, { cacheOnly = false } = {}) {
  if (!code) return ''
  try {
    const file = cacheOnly ? await getCachedJson('data/currencies.json') : await getJson('data/currencies.json')
    const cur = file?.currencies?.find((c) => c.code === code)
    const symbol = currencySymbol(cur, iso2 ? String(iso2).toUpperCase() : iso2)
    const compact = symbol ? symbol.replace(/\s+/g, '') : ''
    return compact.replace(INVISIBLE, '') ? compact : code
  } catch (e) {
    if (!e?.code) console.warn('currency label: registry read failed', code, e?.message)
    return code
  }
}

const operatorsPath = (iso2) => `data/operators/${String(iso2).toUpperCase()}.json`
const INTERNATIONAL = 'data/international.json'
const INTL = 'intl-'

// Index operators by id for getOperator / peekOperator
const index = (operators) => { for (const op of operators || []) remember(`op:${op.id}`, op) }

// A file swapped in by a registry check re-indexes its operators
subscribeRegistry((paths) => {
  for (const p of paths) if (p.startsWith('data/operators/') || p === INTERNATIONAL) index(peek(p)?.operators)
})

// Operators of one country: [{ id, name, aliases, type, group, status, presence, consumer?, logo: { svg, background, sha256 } | null }]
// type (registry v2): bank | microfinance | mobile_money | digital_bank | wallet | money_transfer | investment
// ('fintech' in a legacy v1 cache). presence: countries where the brand exists, >= 1.
// consumer: false = merchant-only gateway, hidden from search (still resolves by id)
export async function getOperators(iso2) {
  const file = await getJson(operatorsPath(iso2))
  index(file.operators)
  return file.operators
}

// International services (registry v2): operators with an `intl-` id and
// `availability` { mode: 'all' | 'only' | 'except', countries: [ISO2] }
export async function getInternational() {
  const file = await getJson(INTERNATIONAL)
  index(file.operators)
  return file.operators
}

// Whether an international service is available in a country
export function availableIn(op, iso2) {
  const a = op?.availability
  if (!a || !iso2) return false
  const listed = (a.countries || []).includes(String(iso2).toUpperCase())
  return a.mode === 'all' || (a.mode === 'only' && listed) || (a.mode === 'except' && !listed)
}

// International services available in a country
export const getInternationalFor = async (iso2) => (await getInternational()).filter((op) => availableIn(op, iso2))

// Whether an operator id is an international service ('intl-paypal')
export const isInternationalId = (id) => !!id && String(id).startsWith(INTL)

// Country code of an operator id ('tg-mixx-by-yas' → 'TG'); null for an
// international service
export const operatorCountry = (id) => (id && !isInternationalId(id) ? String(id).slice(0, 2).toUpperCase() : null)

// One operator by id, or null (loads its country file, or international.json)
export async function getOperator(id) {
  if (!id) return null
  if (peek(`op:${id}`)) return peek(`op:${id}`)
  try {
    if (isInternationalId(id)) await getInternational()
    else await getOperators(operatorCountry(id))
  } catch (e) {
    if (e.code === 'not_found') return null
    throw e
  }
  return peek(`op:${id}`) || null
}

// The operator if its file is already loaded (sync), else undefined
export const peekOperator = (id) => (id ? peek(`op:${id}`) : undefined)

// SVG source of a registry path ('svg/flags/1x1/tg.svg', currency.sign.svg)
export const getSvg = (path) => getText(path)

// Memory key of an operator's logo: its sha256 (v2), else its path (legacy)
const logoKey = (logo) => `logo:${logo.sha256 || logo.svg}`

// Logo of an operator → { xml, layout: { mode, bg }, background: 'dark'|'light'|null } or null
// The SVG is cached by its sha256: a new sha downloads the new logo.
export async function getLogo(operatorId) {
  const op = await getOperator(operatorId)
  if (!op?.logo?.svg) return null
  const key = logoKey(op.logo)
  if (!peek(key)) {
    const xml = await getLogoText(op.logo.svg, op.logo.sha256)
    remember(key, { xml, layout: logoLayout(xml), background: op.logo.background ?? null })
  }
  return peek(key)
}

// The logo if already loaded (sync), else undefined
export const peekLogo = (operatorId) => {
  const op = peekOperator(operatorId)
  return op?.logo?.svg ? peek(logoKey(op.logo)) : op ? null : undefined
}
