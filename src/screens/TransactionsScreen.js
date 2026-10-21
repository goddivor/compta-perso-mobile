// Transactions (v2): search, account chips with logos, and the list grouped
// by day. Each day is a card: label, day net, an "Ouverture → Clôture" strip
// and a "Par compte" table (all from dayBalances(), never recomputed here).
// With ONE account filtered, the strip is that account's and every row shows
// the balance after it. A transfer is ONE row (pair). Search and the type /
// category filters describe a subset of the day, so the balance strips fade.
// No delete here (the form owns it). Adding is the bare Fab.
// Perf: data loads after the transition (useFocusData), memoized day cards.
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { listTransactions, listAccounts, dayBalances } from '../db/database'
import { fmt, getFormatLocale, today } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFilters } from '../context/FiltersContext'
import { usePrivacy } from '../context/PrivacyContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Fab, EmptyState, LogoTile, Amount, Chip, TransactionRow } from '../components/v2'

const MASK = '••••'

// Case- and accent-insensitive normalization for search matching
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// "Lundi 19 octobre" (the year only when it is not the current one)
function dayLabel(day) {
  const d = new Date(day + 'T00:00:00')
  if (isNaN(d.getTime())) return day
  const opts = { weekday: 'long', day: 'numeric', month: 'long' }
  if (day.slice(0, 4) !== today().slice(0, 4)) opts.year = 'numeric'
  const label = d.toLocaleDateString(getFormatLocale(), opts)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const signed = (tx) => (tx.type === 'CREDIT' ? tx.amount : -tx.amount)

// Newest first; the two legs of a transfer become one entry { tx, pair }
// when both are in the list (`pairLegs` false: every leg stays its own row).
function buildEntries(rows, pairLegs) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const seen = new Set()
  const out = []
  for (const tx of rows) {
    if (seen.has(tx.id)) continue
    seen.add(tx.id)
    let pair = null
    if (pairLegs && tx.transfer_pair_id) {
      pair = byId.get(tx.transfer_pair_id) || null
      if (pair) seen.add(pair.id)
    }
    out.push({ tx, pair })
  }
  return out
}

// Net of a day as an Amount: credit green, debit red, nothing in ink
function NetAmount({ value, size }) {
  const type = value > 0 ? 'CREDIT' : value < 0 ? 'DEBIT' : undefined
  return <Amount value={Math.abs(value)} type={type} size={size} currency={false} />
}

/* ------------------------------ Day card -------------------------------- */

const DayCard = memo(function DayCard({ day, entries, bal, solo, accountsById, showBalances, canSplit, onPressTx }) {
  const { colors } = useTheme()
  const t = useT()
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])
  const withBal = showBalances && bal
  const soloAccount = solo || null
  // "Par compte": accounts that moved first, unchanged ones last (dimmed)
  const rows = useMemo(
    () => (bal ? [...bal.accounts.filter((l) => l.count !== 0), ...bal.accounts.filter((l) => l.count === 0)] : []),
    [bal]
  )

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.dayHead}>
        <Text numberOfLines={1} style={[styles.dayTitle, { color: colors.ink }]}>{dayLabel(day)}</Text>
        {withBal ? <NetAmount value={bal.net} size={14} /> : null}
      </View>

      {withBal ? (
        <View style={[styles.strip, { backgroundColor: colors.surface2 }]}>
          {soloAccount ? (
            <LogoTile
              size={24}
              operatorId={soloAccount.operator_id}
              name={soloAccount.name}
              color={soloAccount.color}
              icon={soloAccount.type === 'PHYSICAL' ? 'cash-outline' : undefined}
            />
          ) : null}
          <View>
            <Text style={[styles.stripLabel, { color: colors.muted }]}>{t('tx.opening')}</Text>
            <Amount value={bal.open} size={14} currency={false} />
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.faint} />
          <View>
            <Text style={[styles.stripLabel, { color: colors.muted }]}>{t('tx.closing')}</Text>
            <Amount value={bal.close} size={14} currency={false} />
          </View>
          {canSplit ? (
            <Pressable
              onPress={toggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={({ pressed }) => [styles.more, pressed && { backgroundColor: colors.line }]}
            >
              <Text style={[styles.moreText, { color: colors.content }]}>{t('tx.byAccount')}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.content} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {withBal && canSplit && open ? (
        <View style={styles.per}>
          <View style={styles.pr}>
            <Text style={[styles.th, styles.flex, { color: colors.muted }]}>{t('tx.account')}</Text>
            <Text style={[styles.th, styles.num, { color: colors.muted }]}>{t('tx.opening')}</Text>
            <Text style={[styles.th, styles.num, { color: colors.muted }]}>{t('tx.closing')}</Text>
            <Text style={[styles.th, styles.num, { color: colors.muted }]}>{t('tx.change')}</Text>
          </View>
          {rows.map((l) => {
            const acc = accountsById.get(l.account_id)
            const still = l.count === 0
            return (
              <View key={l.account_id} style={[styles.pr, still && styles.still]}>
                <View style={[styles.flex, styles.who]}>
                  <LogoTile
                    size={24}
                    operatorId={acc?.operator_id}
                    name={acc?.name}
                    color={acc?.color}
                    icon={acc?.type === 'PHYSICAL' ? 'cash-outline' : undefined}
                  />
                  <Text numberOfLines={1} style={[styles.accName, { color: colors.ink }]}>{acc?.name}</Text>
                </View>
                <View style={styles.num}><Amount value={l.open} size={13} weight="regular" currency={false} color={colors.muted} /></View>
                <View style={styles.num}><Amount value={l.close} size={13} currency={false} /></View>
                <View style={styles.num}>
                  {still ? (
                    <Text numberOfLines={1} style={[styles.unchanged, { color: colors.faint }]}>{t('tx.unchanged')}</Text>
                  ) : (
                    <NetAmount value={l.net} size={12} />
                  )}
                </View>
              </View>
            )
          })}
          <View style={[styles.pr, styles.totRow, { borderTopColor: colors.line }]}>
            <Text style={[styles.accName, styles.flex, { color: colors.ink }]}>{t('tx.total')}</Text>
            <View style={styles.num}><Amount value={bal.open} size={13} weight="regular" currency={false} color={colors.muted} /></View>
            <View style={styles.num}><Amount value={bal.close} size={13} currency={false} /></View>
            <View style={styles.num}><NetAmount value={bal.net} size={12} /></View>
          </View>
        </View>
      ) : null}

      {entries.map((e, i) => (
        <View key={e.tx.id}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
          <TransactionRow tx={e.tx} pair={e.pair} sub={e.sub} onPress={onPressTx} />
        </View>
      ))}
    </View>
  )
})

/* ------------------------------- Screen --------------------------------- */

export default function TransactionsScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick } = useApp()
  const { hidden } = usePrivacy()
  const { filters, query, setFilters, resetFilters, search, setSearch, activeCount } = useFilters()
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [input, setInput] = useState(search)

  // Debounce the local input before pushing it to the shared context
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input), 250)
    return () => clearTimeout(timer)
  }, [input, setSearch])

  const clearSearch = useCallback(() => {
    setInput('')
    setSearch('')
  }, [setSearch])

  // Only the account part of the filters changes; the v1 mirror fields are
  // left out so the v2 fields are the ones that count.
  const setAccountFilter = useCallback(
    (accountsSet) =>
      setFilters((f) => ({
        accounts: accountsSet,
        categories: f.categories,
        type: f.type,
        period: f.period,
        month: f.month,
        range: f.range,
      })),
    [setFilters]
  )

  // Account filter pushed from Home
  useEffect(() => {
    if (route.params?.filterStamp) {
      const id = route.params.accountId
      setAccountFilter({ include: id ? [id] : [], exclude: [] })
    }
  }, [route.params?.filterStamp, route.params?.accountId, setAccountFilter])

  const { loading } = useFocusData(() => {
    setRows(listTransactions(query))
    setAccounts(listAccounts())
    setBalances(
      dayBalances({
        from: query.date_from || undefined,
        to: query.date_to || undefined,
        accountIds: query.accounts_exclude ? undefined : query.account_ids,
        excludeAccountIds: query.accounts_exclude ? query.account_ids : undefined,
      })
    )
  }, [query, tick])

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const balByDay = useMemo(() => new Map(balances.map((b) => [b.day, b])), [balances])

  // Accounts the balances describe; solo = exactly one of them is filtered
  const filteredAccounts = filters.accounts.include.length > 0 || filters.accounts.exclude.length > 0
  const selected = useMemo(() => {
    const { include, exclude } = filters.accounts
    if (include.length) return accounts.filter((a) => include.includes(a.id))
    if (exclude.length) return accounts.filter((a) => !exclude.includes(a.id))
    return accounts
  }, [accounts, filters.accounts])
  const solo = filteredAccounts && selected.length === 1 ? selected[0] : null
  const canSplit = !solo && selected.length > 1

  const q = normalize(search.trim())
  const subset = !!(query.type || query.transfers_only || query.category_ids.length)
  const showBalances = !q && !subset

  const entries = useMemo(() => {
    let list = buildEntries(rows, !solo)
    if (q) {
      const hit = (x) =>
        x &&
        (normalize(x.description).includes(q) ||
          normalize(x.category_name).includes(q) ||
          normalize(x.account_name).includes(q))
      list = list.filter((e) => hit(e.tx) || hit(e.pair))
    }
    return list
  }, [rows, solo, q])

  const days = useMemo(() => {
    const map = new Map()
    for (const e of entries) {
      const day = String(e.tx.date).slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(e)
    }
    return [...map.entries()].map(([day, list]) => {
      const bal = balByDay.get(day) || null
      let withSub = list
      if (solo && showBalances && bal) {
        // Balance after each row: the day's closing minus the newer rows
        let running = bal.close
        withSub = list.map((e) => {
          const after = running
          running -= signed(e.tx)
          return { ...e, sub: t('tx.balanceAfter', { amount: hidden ? MASK : fmt(after) }) }
        })
      }
      return { day, entries: withSub, bal }
    })
  }, [entries, balByDay, solo, showBalances, hidden, t])

  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])
  const openFilter = useCallback(() => navigation.navigate('Filter'), [navigation])
  const openForecast = useCallback(() => navigation.navigate('Forecast'), [navigation])
  const addTx = useCallback(
    () => navigation.navigate('TransactionForm', { defaultAccountId: solo ? solo.id : undefined }),
    [navigation, solo]
  )

  const pickAccount = useCallback(
    (id) => {
      const { include } = filters.accounts
      const next = include.includes(id) ? include.filter((x) => x !== id) : [...include, id]
      setAccountFilter({ include: next, exclude: [] })
    },
    [filters.accounts, setAccountFilter]
  )
  const pickAll = useCallback(() => setAccountFilter({ include: [], exclude: [] }), [setAccountFilter])

  const keyExtractor = useCallback((d) => d.day, [])
  const renderDay = useCallback(
    ({ item }) => (
      <DayCard
        day={item.day}
        entries={item.entries}
        bal={item.bal}
        solo={solo}
        accountsById={accountsById}
        showBalances={showBalances}
        canSplit={canSplit}
        onPressTx={openTx}
      />
    ),
    [solo, accountsById, showBalances, canSplit, openTx]
  )

  // Nothing to show: a search / filter outcome offers the way out
  const emptyState = q ? (
    <EmptyState icon="search-outline" title={t('tx.noResult')} action={{ label: t('tx.clear'), onPress: clearSearch, variant: 'tonal' }} />
  ) : activeCount > 0 ? (
    <EmptyState icon="search-outline" title={t('tx.noResult')} action={{ label: t('tx.clear'), onPress: resetFilters, variant: 'tonal' }} />
  ) : (
    <EmptyState icon="swap-vertical-outline" title={t('tx.empty')} />
  )

  const hits = q && entries.length > 0
    ? (entries.length === 1 ? t('tx.resultOne') : t('tx.resultMany', { n: entries.length }))
    : null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.top}>
        <View style={styles.appbar}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{t('tx.title')}</Text>
          <Pressable onPress={openForecast} accessibilityRole="button" accessibilityLabel={t('forecast.title')} style={styles.iconBtn}>
            <Ionicons name="git-branch-outline" size={24} color={colors.ink} />
          </Pressable>
          <Pressable onPress={openFilter} accessibilityRole="button" accessibilityLabel={t('tx.filters')} style={styles.iconBtn}>
            <Ionicons name="options-outline" size={24} color={colors.ink} />
            {activeCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.bg }]}>
                <Text style={[styles.badgeText, { color: colors.primaryInk }]}>{activeCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search" size={20} color={colors.muted} />
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
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {accounts.length > 0 && !q ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            <Chip label={t('tx.allAccounts')} selected={!filteredAccounts} onPress={pickAll} />
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={filters.accounts.include.includes(a.id)}
                onPress={() => pickAccount(a.id)}
                leading={
                  <LogoTile
                    size={20}
                    operatorId={a.operator_id}
                    name={a.name}
                    color={a.color}
                    icon={a.type === 'PHYSICAL' ? 'cash-outline' : undefined}
                  />
                }
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : (
        <FlatList
          data={days}
          keyExtractor={keyExtractor}
          renderItem={renderDay}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.list, days.length === 0 && { flexGrow: 1 }]}
          ListHeaderComponent={hits ? <Text style={[styles.hits, { color: colors.muted }]}>{hits}</Text> : null}
          ListEmptyComponent={emptyState}
          initialNumToRender={6}
          windowSize={7}
        />
      )}

      <Fab onPress={addTx} accessibilityLabel={t('tx.add')} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  top: { paddingBottom: 8 },
  appbar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, height: 56 },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: 24 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    marginHorizontal: 16,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  list: { paddingBottom: 96 },
  hits: { fontFamily: fonts.regular, fontSize: 13, paddingHorizontal: 20, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, overflow: 'hidden' },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  dayTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 14,
  },
  stripLabel: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15 },
  more: {
    marginLeft: 'auto',
    height: 32,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moreText: { fontFamily: fonts.semibold, fontSize: 12 },
  per: { marginHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  pr: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 6 },
  th: { fontFamily: fonts.medium, fontSize: 11 },
  flex: { flex: 1, minWidth: 0 },
  num: { width: 64, alignItems: 'flex-end' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accName: { fontFamily: fonts.medium, fontSize: 13, flexShrink: 1 },
  unchanged: { fontFamily: fonts.medium, fontSize: 12 },
  still: { opacity: 0.55 },
  totRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2, paddingTop: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
})
