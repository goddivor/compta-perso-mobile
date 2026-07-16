// Full transaction list grouped by day, with filters (account, type,
// category, period), a floating "+" button, tap to edit and long press
// to delete (confirmation alert). Deleting one side of a transfer removes
// the pair.
import { useCallback, useMemo, useState, useEffect } from 'react'
import { View, Text, SectionList, Pressable, Modal, FlatList, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { listTransactions, listAccounts, listCategories, deleteTransaction } from '../db/database'
import { fmtDay, today, shiftDay } from '../utils/format'
import { useApp } from '../context/AppContext'
import { EmptyState, Dot } from '../components/ui'
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

// Small filter chip that opens a bottom-sheet option list
function FilterChip({ label, active, options, value, onChange }) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.line,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: active ? fonts.semibold : fonts.medium,
            fontSize: 12,
            color: active ? colors.primaryInk : colors.content,
            maxWidth: 120,
          }}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={12} color={active ? colors.primaryInk : colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, shadowOverlay, { backgroundColor: colors.surface, borderColor: colors.line }]}
            onPress={() => {}}
          >
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => {
                const selected = String(item.value) === String(value)
                return (
                  <Pressable
                    onPress={() => { onChange(item.value); setOpen(false) }}
                    style={({ pressed }) => [
                      styles.option,
                      { backgroundColor: selected || pressed ? colors.surface2 : 'transparent' },
                    ]}
                  >
                    {item.color ? <Dot color={item.color} size={9} /> : null}
                    <Text style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.regular, fontSize: 14, color: colors.ink }}>
                      {item.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={17} color={colors.ink} /> : null}
                  </Pressable>
                )
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
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

  const load = useCallback(() => {
    setAccounts(listAccounts())
    setCategories(listCategories())
    const { account_id, type, category_id, period } = filters
    setTxs(listTransactions({
      account_id: account_id || undefined,
      type: type || undefined,
      category_id: category_id || undefined,
      ...periodRange(period),
    }))
  }, [filters])

  useFocusEffect(useCallback(() => { load() }, [load, tick]))

  const sections = useMemo(() => {
    const map = new Map()
    for (const tx of txs) {
      const day = String(tx.date).slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(tx)
    }
    return [...map.entries()].map(([day, data]) => ({ day, data }))
  }, [txs])

  const confirmDelete = (tx) => {
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
  }

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
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
          onChange={(v) => set('account_id', v)}
          options={[{ label: 'Tous les comptes', value: '' }, ...accounts.map((a) => ({ label: a.name, value: a.id, color: a.color }))]}
        />
        <FilterChip
          label={filters.type === 'DEBIT' ? 'Débits' : filters.type === 'CREDIT' ? 'Crédits' : 'Type'}
          active={!!filters.type}
          value={filters.type}
          onChange={(v) => set('type', v)}
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
          onChange={(v) => set('category_id', v)}
          options={[{ label: 'Toutes les catégories', value: '' }, ...categories.map((c) => ({ label: c.name, value: c.id, color: c.color }))]}
        />
        <FilterChip
          label={filters.period ? periodLabel : 'Période'}
          active={!!filters.period}
          value={filters.period}
          onChange={(v) => set('period', v)}
          options={PERIODS}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(tx) => String(tx.id)}
        contentContainerStyle={{ paddingBottom: 110 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<EmptyState text="Aucune transaction ne correspond aux filtres." />}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.dayHeader, { color: colors.muted }]}>{fmtDay(section.day)}</Text>
        )}
        renderItem={({ item, index, section }) => (
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
            <TransactionRow
              tx={item}
              onPress={() => navigation.navigate('TransactionForm', { id: item.id })}
              onLongPress={() => confirmDelete(item)}
            />
          </View>
        )}
      />

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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: 10,
    paddingBottom: 26,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    minHeight: 48,
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
})
