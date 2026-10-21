// Accounts list (from Settings): logo, name, kind · operator, balance. An
// account with no operator gets ONE proposal by name/alias from the profile
// country's registry (tap = link it, ✕ = dismiss for good); linking only
// stores the operator id. The bare "+" opens the new-account search.
import { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { listAccounts, setAccountOperator, dismissOperator } from '../db/database'
import { useApp } from '../context/AppContext'
import { useProfile } from '../hooks/useProfile'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { useOperator, useOperators, suggestOperator } from '../registry'
import { Fab, EmptyState, LogoTile, Amount } from '../components/v2'
import { operatorTypeLabel } from '../data/accountLabels'

const AccountRow = memo(function AccountRow({ account: a, proposal, onOpen, onLink, onDismiss }) {
  const { colors } = useTheme()
  const t = useT()
  const { data: op } = useOperator(a.operator_id)
  const sub = op
    ? `${operatorTypeLabel(t, op.type)} · ${op.name}`
    : a.type === 'PHYSICAL' ? t('common.cash') : a.provider || null

  return (
    <Pressable onPress={() => onOpen(a)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
      <LogoTile
        operatorId={a.operator_id}
        name={a.name}
        color={a.color}
        icon={a.type === 'PHYSICAL' ? 'cash-outline' : undefined}
        size={40}
      />
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{a.name}</Text>
          {a.fees_rate != null ? (
            <View style={[styles.fee, { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.feeText, { color: colors.content }]}>
                {t('accounts.feesBadge', { pct: Number((a.fees_rate * 100).toFixed(2)) })}
              </Text>
            </View>
          ) : null}
        </View>
        {proposal ? (
          <View style={styles.proposalLine}>
            <Pressable
              onPress={() => onLink(a, proposal)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.proposal, { borderColor: colors.line, backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
            >
              <LogoTile operatorId={proposal.id} name={proposal.name} size={20} />
              <Text numberOfLines={1} style={[styles.proposalText, { color: colors.ink }]}>
                {t('accounts.proposal', { name: proposal.name })}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onDismiss(a)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('accounts.dismissProposal')}
              style={({ pressed }) => [styles.dismiss, pressed && { backgroundColor: colors.surface2 }]}
            >
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          </View>
        ) : sub ? (
          <Text numberOfLines={1} style={[styles.sub, { color: colors.muted }]}>{sub}</Text>
        ) : null}
      </View>
      <Amount value={a.current_balance} size={15} />
    </Pressable>
  )
})

export default function AccountsListScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const profile = useProfile()
  const { data: operators } = useOperators(profile.country_iso2)
  const [accounts, setAccounts] = useState([])

  // The "+" is the floating button: drop the one of the navigation header
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => null })
  }, [navigation])

  useFocusData(() => setAccounts(listAccounts()), [tick])

  // account id → proposed operator (accounts with no operator, not dismissed)
  const proposals = useMemo(() => {
    const map = {}
    if (!operators) return map
    for (const a of accounts) {
      if (a.operator_id || a.operator_dismissed || a.type === 'PHYSICAL') continue
      const op = suggestOperator(operators, a.name)
      if (op) map[a.id] = op
    }
    return map
  }, [accounts, operators])

  const open = useCallback((a) => navigation.navigate('AccountForm', { id: a.id }), [navigation])
  const link = useCallback((a, op) => { setAccountOperator(a.id, op.id); refresh() }, [refresh])
  const dismiss = useCallback((a) => { dismissOperator(a.id); refresh() }, [refresh])

  const renderItem = useCallback(
    ({ item }) => (
      <AccountRow account={item} proposal={proposals[item.id]} onOpen={open} onLink={link} onDismiss={dismiss} />
    ),
    [proposals, open, link, dismiss]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <FlatList
        data={accounts}
        keyExtractor={(a) => String(a.id)}
        renderItem={renderItem}
        contentContainerStyle={{ flexGrow: 1, paddingTop: 8, paddingBottom: 96 }}
        ListEmptyComponent={<EmptyState icon="wallet-outline" title={t('accounts.empty')} />}
      />
      <Fab onPress={() => navigation.navigate('AccountForm')} accessibilityLabel={t('common.add')} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 },
  main: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 15, flexShrink: 1 },
  sub: { fontFamily: fonts.regular, fontSize: 12 },
  fee: { paddingHorizontal: 8, height: 20, borderRadius: 6, justifyContent: 'center' },
  feeText: { fontFamily: fonts.medium, fontSize: 11 },
  proposalLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  proposal: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 4, paddingRight: 10, borderRadius: 8, borderWidth: 1, flexShrink: 1 },
  proposalText: { fontFamily: fonts.medium, fontSize: 12, flexShrink: 1 },
  dismiss: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
