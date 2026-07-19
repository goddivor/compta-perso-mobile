// One transaction line: description/category, account, signed colored amount,
// and a swap icon when the transaction is part of a transfer pair.
// Memoized: parents pass STABLE onPress/onLongPress callbacks that receive
// the transaction, so list re-renders skip unchanged rows.
import { memo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { fmt, fmtSigned } from '../utils/format'
import { useT } from '../i18n'
import { Badge, Dot } from './ui'

export const TransactionRow = memo(function TransactionRow({ tx, onPress, onLongPress, showDate }) {
  const { colors } = useTheme()
  const t = useT()
  const isCredit = tx.type === 'CREDIT'
  const amountColor = isCredit ? colors.success : colors.danger
  const title =
    tx.description || tx.category_name || (tx.transfer_pair_id ? t('tx.transfer') : isCredit ? t('tx.income') : t('tx.expense'))

  const handlePress = useCallback(() => onPress?.(tx), [onPress, tx])
  const handleLongPress = useCallback(() => onLongPress?.(tx), [onLongPress, tx])

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {tx.transfer_pair_id ? (
            <Ionicons name="swap-horizontal" size={14} color={colors.link} />
          ) : null}
          <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.ink, flexShrink: 1 }}>
            {title}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {tx.category_name ? <Badge label={tx.category_name} color={tx.category_color} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Dot color={tx.account_color || colors.faint} size={7} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>{tx.account_name}</Text>
          </View>
          {showDate ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
              {String(tx.date).slice(0, 10).split('-').reverse().join('/')}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: amountColor }}>
          {fmtSigned(tx.type, tx.amount)}
        </Text>
        {tx.fees > 0 ? (
          <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.faint }}>
            {t('tx.inclFees', { amount: fmt(tx.fees) })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
})
