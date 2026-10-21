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

// Starting balance to save. v1 stored parseFloat values, so an account may
// hold a decimal balance: until the field is edited, `exact` is the stored
// number and is saved as is. A typed value is parsed to whole FCFA.
export function balanceToSave(text, exact) {
  if (exact != null) return exact
  return Math.round(parseFloat(String(text).replace(/\s/g, '').replace(',', '.')) || 0)
}

// Only active operators can be picked (rebranded, merged, defunct cannot)
export const isActiveOperator = (op) => (op.status || 'active') === 'active'

// French preposition before each registry country: au Togo, en Côte d'Ivoire,
// aux Comores, à Madagascar. A country missing here gets a neutral title.
const COUNTRY_IN = {
  au: ['BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'TD', 'CG', 'CD', 'GA', 'GH', 'KE', 'LS', 'LR', 'MW', 'ML', 'MA', 'MZ', 'NE', 'NG', 'RW', 'SN', 'SS', 'SD', 'TG', 'ZW'],
  en: ['DZ', 'AO', 'CF', 'CI', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GM', 'GN', 'GW', 'LY', 'MR', 'NA', 'SL', 'SO', 'ZA', 'TZ', 'TN', 'UG', 'ZM'],
  aux: ['KM', 'SC'],
  a: ['DJ', 'MG', 'MU', 'ST'],
}
const IN_KEY = { au: 'Au', en: 'En', aux: 'Aux', a: 'A' }

// "Suggestions au Togo" · "Suggestions in Togo" · "Suggestions · Xyz" (no known preposition)
export function suggestionsTitle(t, lang, country) {
  if (!country) return t('accountForm.suggestionsNone')
  const name = country.name?.[lang] || country.name?.en || country.iso2
  const prep = Object.keys(COUNTRY_IN).find((p) => COUNTRY_IN[p].includes(country.iso2))
  return prep
    ? t(`accountForm.suggestions${IN_KEY[prep]}`, { country: name })
    : t('accountForm.suggestions', { country: name })
}
