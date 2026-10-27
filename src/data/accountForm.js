// Pure rules of the account form (no React Native import, so they can be
// checked in Node). `t` is passed in by the caller.

// What the form lets the user change about the account's kind. Once the
// account exists (edited, or created by "Ajouter une règle"), its type is
// fixed: updateAccount does not store `type`, so the operator ↔ cash switch
// is gone. An electronic account may still link, change or drop its operator
// (written by "Enregistrer" through updateAccount's operator_id).
export function kindControls({ savedId, type, operatorId }) {
  if (!savedId) return { canChange: true, linkMode: false, canUnlink: false }
  const electronic = type === 'ELECTRONIC'
  return { canChange: electronic, linkMode: true, canUnlink: electronic && !!operatorId }
}

// "Ajouter une règle" writes the form only for an account that does not exist
// yet (a rule needs an account id); an existing account is written by
// "Enregistrer" only.
export const saveBeforeRule = (savedId) => !savedId

// Typed text of a whole amount: digits only (amounts are whole units, and
// "50,000" or "50.000" is a grouped 50000 in many countries, never 50).
// `negative`: keeps a leading minus (a starting balance may be negative).
export function wholeAmountText(text, { negative = false } = {}) {
  const s = String(text ?? '')
  const digits = s.replace(/\D/g, '').slice(0, 12)
  return negative && /^\s*[-\u2212]/.test(s) ? `-${digits}` : digits
}

// Starting balance to save. v1 stored parseFloat values, so an account may
// hold a decimal balance: until the field is edited, `exact` is the stored
// number and is saved as is. A typed value is read as a whole amount.
export function balanceToSave(text, exact) {
  if (exact != null) return exact
  return parseInt(wholeAmountText(text, { negative: true }), 10) || 0
}

// Only active consumer operators can be picked: not rebranded, merged or
// defunct, and not a merchant-only gateway (`consumer: false`, registry v2).
// An account already linked to one still shows it (lookups go by id).
export const isActiveOperator = (op) => (op.status || 'active') === 'active' && op.consumer !== false

// French preposition before each registry country: au Togo, en Côte d'Ivoire,
// aux Comores, à Madagascar. A country missing here gets a neutral title.
const COUNTRY_IN = {
  au: ['BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'TD', 'CG', 'CD', 'GA', 'GH', 'KE', 'LS', 'LR', 'MW', 'ML', 'MA', 'MZ', 'NE', 'NG', 'RW', 'SN', 'SS', 'SD', 'TG', 'ZW'],
  en: ['DZ', 'AO', 'CF', 'CI', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GM', 'GN', 'GW', 'LY', 'MR', 'NA', 'SL', 'SO', 'ZA', 'TZ', 'TN', 'UG', 'ZM'],
  aux: ['KM', 'SC'],
  a: ['DJ', 'MG', 'MU', 'ST'],
}
const IN_KEY = { au: 'Au', en: 'En', aux: 'Aux', a: 'A' }

// Number of operators the user can pick in the profile country, or null while
// the registry is still loading (or offline without a cache)
export const activeOperatorCount = (operators) =>
  (operators ? operators.filter(isActiveOperator).length : null)

// One short line, with the count once it is known: "Search 42 banks & wallets"
export function searchPlaceholder(t, count) {
  return count ? t('accountForm.searchPlaceholderCount', { n: count }) : t('accountForm.searchPlaceholder')
}

// "Not listed? Search all 42": only when the popular list does not show them all
export const showSearchAll = (count, shown) => !!count && count > shown

// "Les plus utilisés au Togo" · "Popular in Togo" · "Popular · Xyz" (no known preposition)
export function popularTitle(t, lang, country) {
  if (!country) return t('accountForm.popularNone')
  const name = country.name?.[lang] || country.name?.en || country.iso2
  const prep = Object.keys(COUNTRY_IN).find((p) => COUNTRY_IN[p].includes(country.iso2))
  return prep
    ? t(`accountForm.popular${IN_KEY[prep]}`, { country: name })
    : t('accountForm.popular', { country: name })
}
