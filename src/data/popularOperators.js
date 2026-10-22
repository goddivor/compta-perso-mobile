// The "popular" operators of a country, shown before any search: the New
// account list and the onboarding step-3 grid. Pure (no React Native import),
// so it can be checked in Node.
//
// Registry v1.2.0 gives each operator `presence`: the number of countries
// where its brand exists (>= 1). A brand present in many countries is a
// better guess than an alphabetical one, so the order is: presence (high
// first), then operators with a logo, then mobile money before banks
// (then microfinance, fintech), then name.
// A registry file without the field (older cached tag) keeps the previous
// order: type, then logo, then name ({ logoOnly } also drops operators
// without a logo, as the onboarding grid did).

import { isActiveOperator } from './accountForm'

export const OPERATOR_TYPE_ORDER = ['mobile_money', 'bank', 'microfinance', 'fintech']

const typeRank = (o) => {
  const i = OPERATOR_TYPE_ORDER.indexOf(o.type)
  return i < 0 ? OPERATOR_TYPE_ORDER.length : i
}
const logoRank = (o) => (o.logo?.svg ? 0 : 1)
const presenceOf = (o) => (Number.isInteger(o.presence) && o.presence >= 1 ? o.presence : 1)
const byName = (a, b) => a.name.localeCompare(b.name)

export const hasPresence = (operators) => !!operators?.some((o) => Number.isInteger(o.presence))

// Active operators, most popular first; `count` of them (all when omitted)
export function popularOperators(operators, count, { logoOnly = false } = {}) {
  if (!operators) return []
  let list = operators.filter(isActiveOperator)
  if (hasPresence(list)) {
    list.sort((a, b) => presenceOf(b) - presenceOf(a) || logoRank(a) - logoRank(b) || typeRank(a) - typeRank(b) || byName(a, b))
  } else {
    if (logoOnly) list = list.filter((o) => o.logo?.svg)
    list.sort((a, b) => typeRank(a) - typeRank(b) || logoRank(a) - logoRank(b) || byName(a, b))
  }
  return count == null ? list : list.slice(0, count)
}
