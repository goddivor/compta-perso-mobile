// The "popular" operators of a country, shown before any search: the New
// account list and the onboarding step-3 grid. Pure (no React Native import),
// so it can be checked in Node.
//
// The set is split so mobile money (what most users hold) is never pushed
// out by banks: up to half (3 of 6) mobile money, the rest from the other
// types (bank, digital bank, wallet, microfinance, money transfer,
// investment, in that order); a group with fewer operators leaves its slots
// to the other. Mobile money is shown first. Merchant-only gateways
// (`consumer: false`) and international services never appear here.
// Inside a group, registry v1.2.0's `presence` (number of countries where
// the brand exists, >= 1) orders it: presence (high first), then operators
// with a logo, then name. A registry file without the field (older cached
// tag) keeps the previous order inside each group: logo, then name
// ({ logoOnly } also drops operators without a logo, as the onboarding grid
// did).

import { isActiveOperator } from './accountForm'

// order of the non mobile money group (registry v2 types; 'fintech' only in
// a legacy v1 cache)
const OTHER_ORDER = ['bank', 'digital_bank', 'wallet', 'microfinance', 'money_transfer', 'investment', 'fintech']
// order of the type groups in search results
export const OPERATOR_TYPE_ORDER = ['mobile_money', ...OTHER_ORDER]

const otherRank = (o) => {
  const i = OTHER_ORDER.indexOf(o.type)
  return i < 0 ? OTHER_ORDER.length : i
}
const logoRank = (o) => (o.logo?.svg ? 0 : 1)
const presenceOf = (o) => (Number.isInteger(o.presence) && o.presence >= 1 ? o.presence : 1)
const byName = (a, b) => a.name.localeCompare(b.name)

export const hasPresence = (operators) => !!operators?.some((o) => Number.isInteger(o.presence))

// Active operators, most popular first; `count` of them (all when omitted)
export function popularOperators(operators, count, { logoOnly = false } = {}) {
  if (!operators) return []
  let list = operators.filter(isActiveOperator)
  const presence = hasPresence(list)
  if (!presence && logoOnly) list = list.filter((o) => o.logo?.svg)
  const inGroup = presence
    ? (a, b) => presenceOf(b) - presenceOf(a) || logoRank(a) - logoRank(b) || byName(a, b)
    : (a, b) => logoRank(a) - logoRank(b) || byName(a, b)
  const mobile = list.filter((o) => o.type === 'mobile_money').sort(inGroup)
  const others = list
    .filter((o) => o.type !== 'mobile_money')
    .sort((a, b) => otherRank(a) - otherRank(b) || inGroup(a, b))
  if (count == null) return [...mobile, ...others]
  const half = Math.ceil(count / 2)
  const nMobile = Math.min(mobile.length, Math.max(half, count - others.length))
  const nOthers = Math.min(others.length, count - nMobile)
  return [...mobile.slice(0, nMobile), ...others.slice(0, nOthers)]
}
