// Full transaction list grouped by day, with a search bar (debounced,
// matches description / category / account, accent-insensitive) and a
// filter button opening the full-screen Filter screen (shared context).
// Floating "+" button, tap to edit and long press to delete (confirmation
// alert). Deleting one side of a transfer removes the pair.
// Perf: deferred loading after transitions, SectionList with memoized rows
// and stable callbacks.
import { useCallback, useMemo, useState, useEffect } from 'react'
import { View, Text, TextInput, SectionList, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { listTransactions, deleteTransaction } from '../db/database'
import { fmtDay } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFilters } from '../context/FiltersContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { EmptyState } from '../components/ui'
import { TransactionRow } from '../components/TransactionRow'

// Case- and accent-insensitive normalization for search matching
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function TransactionsScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const { filters, setFilters, search, setSearch, activeCount } = useFilters()
  const [txs, setTxs] = useState([])
  const [input, setInput] = useState(search)

  // Debounce the local input before pushing it to the shared context
  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 250)
    return () => clearTimeout(t)
  }, [input, setSearch])

  const clearSearch = useCallback(() => {
    setInput('')
    setSearch('')
  }, [setSearch])

  // Account filter pushed from the Home screen
  useEffect(() => {
    if (route.params?.filterStamp) {
      setFilters((f) => ({ ...f, account_id: route.params.accountId || null }))
    }
  }, [route.params?.filterStamp])

  const { loading } = useFocusData(() => {
    setTxs(
      listTransactions({
        account_id: filters.account_id || undefined,
        type: filters.type || undefined,
        category_id: filters.category_id || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      })
    )
  }, [filters, tick])

  const visibleTxs = useMemo(() => {
    const q = normalize(search.trim())
    if (!q) return txs
    return txs.filter(
      (tx) =>
        normalize(tx.description).includes(q) ||
        normalize(tx.category_name).includes(q) ||
        normalize(tx.account_name).includes(q)
    )
  }, [txs, search])

  const sections = useMemo(() => {
    const map = new Map()
    for (const tx of visibleTxs) {
      const day = String(tx.date).slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(tx)
    }
    return [...map.entries()].map(([day, data]) => ({ day, data }))
  }, [visibleTxs])

  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])
  const openFilter = useCallback(() => navigation.navigate('Filter'), [navigation])

  const confirmDelete = useCallback(
    (tx) => {
      Alert.alert(
        t('tx.deleteTitle'),
        tx.transfer_pair_id ? t('tx.deleteTransferMsg') : t('tx.deleteMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => { deleteTransaction(tx.id); refresh() },
          },
        ]
      )
    },
    [refresh, t]
  )

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('tx.title')}</Text>
      </View>

      {/* Search bar + filter button */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search" size={19} color={colors.muted} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('tx.searchPlaceholder')}
            placeholderTextColor={colors.faint}
            style={[styles.searchInput, { color: colors.ink }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {input.length > 0 ? (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={openFilter}
          style={({ pressed }) => [
            styles.filterBtn,
            { backgroundColor: pressed ? colors.primary600 : colors.primary },
          ]}
        >
          <Ionicons name="options" size={22} color={colors.primaryInk} />
          {activeCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.ink, borderColor: colors.bg }]}>
              <Text style={[styles.badgeText, { color: colors.bg }]}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
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
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState text={t('tx.emptyFiltered')} />}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 24,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 13,
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
