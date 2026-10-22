// Registry getters (countries, currencies, operators, SVG art).
// Data shapes: registry/SCHEMA.md (countries[], currencies[], operators[]).
// Every getter is async: memory, then file cache, then network.
import { getText, getJson, getCachedJson, peek, remember, REGISTRY_TAG, REGISTRY_BASE } from './client'
import { logoLayout } from './logo'

export { REGISTRY_TAG, REGISTRY_BASE, logoLayout }

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

// Operators of one country: [{ id, name, aliases, type, group, status, logo: { svg, background } | null }]
export async function getOperators(iso2) {
  const file = await getJson(operatorsPath(iso2))
  // index by id for getOperator / peekOperator
  for (const op of file.operators) remember(`op:${op.id}`, op)
  return file.operators
}

// Country code of an operator id ('tg-mixx-by-yas' → 'TG')
export const operatorCountry = (id) => (id ? String(id).slice(0, 2).toUpperCase() : null)

// One operator by id, or null (loads its country file)
export async function getOperator(id) {
  if (!id) return null
  if (peek(`op:${id}`)) return peek(`op:${id}`)
  try {
    await getOperators(operatorCountry(id))
  } catch (e) {
    if (e.code === 'not_found') return null
    throw e
  }
  return peek(`op:${id}`) || null
}

// The operator if its country file is already loaded (sync), else undefined
export const peekOperator = (id) => (id ? peek(`op:${id}`) : undefined)

// SVG source of a registry path ('svg/flags/1x1/tg.svg', operator.logo.svg, currency.sign.svg)
export const getSvg = (path) => getText(path)

// Logo of an operator → { xml, layout: { mode, bg }, background: 'dark'|'light'|null } or null
export async function getLogo(operatorId) {
  const op = await getOperator(operatorId)
  if (!op?.logo?.svg) return null
  const key = `logo:${op.logo.svg}`
  if (!peek(key)) {
    const xml = await getSvg(op.logo.svg)
    remember(key, { xml, layout: logoLayout(xml), background: op.logo.background ?? null })
  }
  return peek(key)
}

// The logo if already loaded (sync), else undefined
export const peekLogo = (operatorId) => {
  const op = peekOperator(operatorId)
  return op?.logo?.svg ? peek(`logo:${op.logo.svg}`) : op ? null : undefined
}
