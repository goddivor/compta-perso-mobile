// v2 transaction row: category icon left; title (2 lines); category label ·
// account logo + name; amount right (debit red, credit green) with the
// short date ("Hier", "17 oct.") and the fees under it.
// Pass `pair` (the other leg of a transfer) to show the transfer as ONE row:
// from → to accounts, amount moved in ink, "+fees" under it.
// Memoized: give STABLE onPress / onLongPress callbacks; they receive `tx`.
import { memo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useT } from '../../i18n'
import { fmt } from '../../utils/format'
import { shortDate } from '../../utils/dates'
import { CategoryIcon } from './CategoryIcon'
import { LogoTile } from './LogoTile'
import { Amount } from './Amount'

// Account bit of the meta line: 16 dp tile + name
function AccountTag({ operatorId, name, color, type }) {
  const { colors } = useTheme()
  return (
    <View style={styles.tag}>
      <LogoTile size={16} operatorId={operatorId} name={name} color={color} icon={type === 'PHYSICAL' ? 'cash-outline' : undefined} />
      <Text numberOfLines={1} style={[styles.meta, { color: colors.muted, flexShrink: 1 }]}>{name}</Text>
    </View>
  )
}

const leg = (r) => ({ operatorId: r.account_operator_id, name: r.account_name, color: r.account_color, type: r.account_type })

export const TransactionRow = memo(function TransactionRow({ tx, pair, onPress, onLongPress, showDate = false, sub, style }) {
  const { colors } = useTheme()
  const t = useT()
  const handlePress = useCallback(() => onPress?.(tx), [onPress, tx])
  const handleLongPress = useCallback(() => onLongPress?.(tx), [onLongPress, tx])

  const isTransfer = !!tx.transfer_pair_id
  const merged = isTransfer && pair
  const from = merged ? (tx.type === 'DEBIT' ? tx : pair) : null
  const to = merged ? (tx.type === 'DEBIT' ? pair : tx) : null
  const isCredit = tx.type === 'CREDIT'
  const title = tx.description || pair?.description || tx.category_name ||
    (isTransfer ? t('common.transfer') : isCredit ? t('common.income') : t('common.expense'))

  const fees = merged ? from.fees : tx.type === 'DEBIT' ? tx.fees : 0
  const lines = []
  if (showDate) lines.push(shortDate(tx.date))
  if (sub != null) lines.push(sub)
  else if (fees > 0) lines.push(t(merged ? 'common.transferFees' : 'common.feesIncluded', { amount: fmt(fees) }))

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.surface2 }, style]}
    >
      <CategoryIcon transfer={isTransfer} icon={tx.category_icon} name={tx.category_name} color={tx.category_color} />
      <View style={styles.main}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.ink }]}>{title}</Text>
        <View style={styles.metaRow}>
          {merged ? (
            <>
              <AccountTag {...leg(from)} />
              <Ionicons name="arrow-forward" size={12} color={colors.muted} />
              <AccountTag {...leg(to)} />
            </>
          ) : (
            <>
              {tx.category_name ? (
                <>
                  <Text numberOfLines={1} style={[styles.meta, { color: colors.muted, flexShrink: 1 }]}>{tx.category_name}</Text>
                  <View style={[styles.sep, { backgroundColor: colors.faint }]} />
                </>
              ) : null}
              <AccountTag {...leg(tx)} />
            </>
          )}
        </View>
      </View>
      <View style={styles.right}>
        {merged ? <Amount value={to.amount} /> : <Amount value={tx.amount} type={tx.type} />}
        {lines.map((l, i) => (
          <Text key={i} numberOfLines={1} style={[styles.sub, { color: colors.muted }]}>{l}</Text>
        ))}
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 },
  main: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, overflow: 'hidden' },
  meta: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  sep: { width: 3, height: 3, borderRadius: 1.5 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  right: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '45%' },
  sub: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },
})
