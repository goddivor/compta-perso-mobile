// Full transaction list grouped by day, with filters (account, type,
// category, period), a floating "+" button, tap to edit and long press
// to delete (confirmation alert). Deleting one side of a transfer removes
// the pair.
// Perf: deferred loading after transitions, SectionList with memoized rows
// and stable callbacks.
import { useCallback, useMemo, useState, useEffect } from 'react'
import { View, Text, SectionList, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { listTransactions, listAccounts, listCategories, deleteTransaction } from '../db/database'
import { fmtDay, today, shiftDay } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { EmptyState } from '../components/ui'
import { FilterChip } from '../components/FilterChip'
import { TransactionRow } from '../components/TransactionRow'

const PERIODS = [
  { label: 'Toute la période', value: '' },
  { label: '7 derniers jours', value: '7d' },
  { label: '30 derniers jours', value: '30d' },
  { label: 'Ce mois-ci', value: 'month' },
]

function periodRange(period) {
  const t = today()
  if (period === '7d') return { date_from: shiftDay(t, -6) }
  if (period === '30d') return { date_from: shiftDay(t, -29) }
  if (period === 'month') return { date_from: t.slice(0, 8) + '01' }
  return {}
}

export default function TransactionsScreen({ navigation, route }) {
  const { colors } = useTheme()
  const { tick, refresh } = useApp()
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [txs, setTxs] = useState([])
  const [filters, setFilters] = useState({ account_id: '', type: '', category_id: '', period: '' })

  // Account filter pushed from the Home screen
  useEffect(() => {
    if (route.params?.filterStamp) {
      setFilters((f) => ({ ...f, account_id: route.params.accountId || '' }))
    }
  }, [route.params?.filterStamp])

  const { loading } = useFocusData(() => {
    setAccounts(listAccounts())
    setCategories(listCategories())
    const { account_id, type, category_id, period } = filters
    setTxs(
      listTransactions({
        account_id: account_id || undefined,
        type: type || undefined,
        category_id: category_id || undefined,
        ...periodRange(period),
      })
    )
  }, [filters, tick])

  const sections = useMemo(() => {
    const map = new Map()
    for (const tx of txs) {
      const day = String(tx.date).slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(tx)
    }
    return [...map.entries()].map(([day, data]) => ({ day, data }))
  }, [txs])

  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])

  const confirmDelete = useCallback(
    (tx) => {
      Alert.alert(
        'Supprimer la transaction',
        tx.transfer_pair_id
          ? 'Cette transaction fait partie d’un transfert : les deux écritures seront supprimées. Continuer ?'
          : 'Cette transaction sera définitivement supprimée. Continuer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => { deleteTransaction(tx.id); refresh() },
          },
        ]
      )
    },
    [refresh]
  )

  const set = useCallback((k, v) => setFilters((f) => ({ ...f, [k]: v })), [])
  const setAccount = useCallback((v) => set('account_id', v), [set])
  const setType = useCallback((v) => set('type', v), [set])
  const setCategory = useCallback((v) => set('category_id', v), [set])
  const setPeriod = useCallback((v) => set('period', v), [set])

  const keyExtractor = useCallback((tx) => String(tx.id), [])
  const renderSectionHeader = useCallback(
    ({ section }) => <Text style={[styles.dayHeader, { color: colors.muted }]}>{fmtDay(section.day)}</Text>,
    [colors.muted]
  )
  const renderItem = useCallback(
    ({ item, index, section }) => (
      <View
        style={[
          styles.rowWrap,
          { backgroundColor: colors.surface, borderColor: colors.line },
          index === 0 && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1 },
          index === section.data.length - 1 && {
            borderBottomLeftRadius: radius.lg,
            borderBottomRightRadius: radius.lg,
            borderBottomWidth: 1,
          },
        ]}
      >
        {index > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
        <TransactionRow tx={item} onPress={openTx} onLongPress={confirmDelete} />
      </View>
    ),
    [colors, openTx, confirmDelete]
  )

  const accountLabel = accounts.find((a) => String(a.id) === String(filters.account_id))?.name
  const categoryLabel = categories.find((c) => String(c.id) === String(filters.category_id))?.name
  const periodLabel = PERIODS.find((p) => p.value === filters.period)?.label

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>Transactions</Text>
      </View>

      {/* Filter chips */}
      <View style={styles.chipsRow}>
        <FilterChip
          label={accountLabel || 'Compte'}
          active={!!filters.account_id}
          value={filters.account_id}
          onChange={setAccount}
          options={[{ label: 'Tous les comptes', value: '' }, ...accounts.map((a) => ({ label: a.name, value: a.id, color: a.color }))]}
        />
        <FilterChip
          label={filters.type === 'DEBIT' ? 'Débits' : filters.type === 'CREDIT' ? 'Crédits' : 'Type'}
          active={!!filters.type}
          value={filters.type}
          onChange={setType}
          options={[
            { label: 'Tous les types', value: '' },
            { label: 'Débits (dépenses)', value: 'DEBIT' },
            { label: 'Crédits (entrées)', value: 'CREDIT' },
          ]}
        />
        <FilterChip
          label={categoryLabel || 'Catégorie'}
          active={!!filters.category_id}
          value={filters.category_id}
          onChange={setCategory}
          options={[{ label: 'Toutes les catégories', value: '' }, ...categories.map((c) => ({ label: c.name, value: c.id, color: c.color }))]}
        />
        <FilterChip
          label={filters.period ? periodLabel : 'Période'}
          active={!!filters.period}
          value={filters.period}
          onChange={setPeriod}
          options={PERIODS}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingBottom: 110 }}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={<EmptyState text="Aucune transaction ne correspond aux filtres." />}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
        />
      )}

      {/* Floating add button */}
      <Pressable
        onPress={() => navigation.navigate('TransactionForm', { defaultAccountId: filters.account_id || undefined })}
        style={({ pressed }) => [
          styles.fab,
          shadowOverlay,
          { backgroundColor: pressed ? colors.primary600 : colors.primary },
        ]}
      >
        <Ionicons name="add" size={30} color={colors.primaryInk} />
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  dayHeader: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 6,
  },
  rowWrap: {
    marginHorizontal: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
