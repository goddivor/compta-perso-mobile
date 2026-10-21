// Fee rule helpers for v2 forms. The arithmetic lives once, in the data
// layer (feeFromRule); this file adds what screens need around it.
// A rule: { id, account_id, name, kind: 'percent' | 'fixed' | 'tiers',
// value (percent as a FRACTION: 0.01 = 1 %), tiers: [[max, fee], …] }.
// Fees are always typed freely: rules only SUGGEST an amount (chips).
import { feeFromRule, FEE_RULE_KINDS } from '../db/database'
import { t } from '../i18n'

export { FEE_RULE_KINDS }

// Fee of one rule for a base amount → integer FCFA, or null (no base,
// invalid rule, or above the last tier). Tiers: first tier whose max covers the base.
export const computeFee = (rule, base) => feeFromRule(rule, base)

// Suggestion chips for a base amount: [{ rule, fee, label }], rules giving no fee skipped
export function feeSuggestions(rules, base) {
  return (rules || [])
    .map((rule) => ({ rule, fee: computeFee(rule, base), label: feeRuleLabel(rule) }))
    .filter((s) => s.fee != null)
}

// Display name of a rule; the rule migrated from v1 has no name
export const feeRuleLabel = (rule) => (rule?.name ? rule.name : t('common.feeRuleDefault'))
