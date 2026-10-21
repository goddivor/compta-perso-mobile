// Small text helpers shared by the accounts screens. `t` is passed in by the
// caller (from useT()) so the screens re-render when the language changes.
import { fmt, getFormatLocale } from '../utils/format'

// registry operator type ('bank', 'mobile_money', …) → "Banque" / "Mobile money" …
export const operatorTypeLabel = (t, type) => t(`accounts.type.${type}`)

// Plural group title of an operator type → "Banques" …
export const operatorGroupLabel = (t, type) => t(`accounts.group.${type}`)

// 0.01 → "1" (a percent rule stores a fraction); decimals follow the app language
export function percentText(fraction) {
  const pct = Number((Number(fraction) * 100).toPrecision(10))
  return new Intl.NumberFormat(getFormatLocale(), { maximumFractionDigits: 4 }).format(pct)
}

// "1 % du montant" · "500 FCFA" · "22 paliers"
export function ruleSummary(t, rule) {
  if (rule.kind === 'percent') return t('accountForm.rulePercent', { pct: percentText(rule.value) })
  if (rule.kind === 'fixed') return t('accountForm.ruleFixed', { amount: fmt(rule.value) })
  return t('accountForm.ruleTiers', { n: (rule.tiers || []).length })
}

// Ionicons name per rule kind
export const RULE_ICON = { percent: 'calculator-outline', fixed: 'cash-outline', tiers: 'layers-outline' }
