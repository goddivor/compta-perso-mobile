// Report tab (v2): account chips with logos, segmented period, a fixed summary
// (in / out / net) and one card per day with movements. Each card shows the
// day's net, its opening → closing balance and the day's in / out; a toggle
// opens the per-account table (opening, closing, variation, straight from
// dayBalances(), never recomputed) and the day's transactions. A header
// toggle switches to the chronological graph (PhysicsGraphView), which takes
// the same account chips and a recenter button in the app bar.
import { memo, useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { dayBalances, getDailyReport, listAccounts, listTransactions, transferPairsByDay } from '../db/database'
import { getFormatLocale, today, shiftDay } from '../utils/format'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Amount, EmptyState, LogoTile, TransactionRow } from '../components/v2'
import { AccountChips } from '../graph/AccountChips'
import { PeriodSeg } from '../graph/PeriodSeg'
import PhysicsGraphView from '../graph/PhysicsGraphView'

function windowFrom(period) {
  const now = today()
  if (period === '7d') return shiftDay(now, -6)
  if (period === '30d') return shiftDay(now, -29)
  if (period === 'month') return now.slice(0, 8) + '01'
  return undefined
}

// "Lundi 19 octobre" (the year only when it is not the current one)
function dayTitle(day) {
  const d = new Date(day + 'T00:00:00')
  if (isNaN(d.getTime())) return day
  const opts = { weekday: 'long', day: 'numeric', month: 'long' }
  if (day.slice(0, 4) !== today().slice(0, 4)) opts.year = 'numeric'
  const label = d.toLocaleDateString(getFormatLocale(), opts)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// A flow amount: debit red, credit green; zero stays quiet
function Flow({ value, type, size = 13, weight = 'semibold', currency = true }) {
  const { colors } = useTheme()
  if (!value) return <Amount value={0} size={size} weight={weight} currency={currency} color={colors.muted} />
  return <Amount value={Math.abs(value)} type={type} size={size} weight={weight} currency={currency} />
}

// A signed change: negative = debit, positive = credit
function Delta({ value, ...rest }) {
  return <Flow value={value} type={value < 0 ? 'DEBIT' : 'CREDIT'} {...rest} />
}

function Summary({ inn, out }) {
  const { colors } = useTheme()
  const t = useT()
  const cell = (label, node) => (
    <View style={styles.sumCell}>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{label}</Text>
      {node}
    </View>
  )
  const sep = <View style={[styles.sumSep, { backgroundColor: colors.line }]} />
  return (
    <View style={[styles.sum, { backgroundColor: colors.surface }]}>
      {cell(t('report.in'), <Flow value={inn} type="CREDIT" size={14} />)}
      {sep}
      {cell(t('report.out'), <Flow value={out} type="DEBIT" size={14} />)}
      {sep}
      {cell(t('report.net'), <Delta value={inn - out} size={14} />)}
    </View>
  )
}

/* ------------------------------ Day detail ------------------------------- */

const AccountTable = memo(function AccountTable({ item, accountsById }) {
  const { colors } = useTheme()
  const t = useT()
  const head = { fontFamily: fonts.medium, fontSize: 11, color: colors.muted }
  const tot = item.accounts.reduce((s, l) => s + l.net, 0)
  return (
    <View style={[styles.table, { borderTopColor: colors.line }]}>
      <View style={styles.tr}>
        <Text style={[head, styles.tName]}>{t('report.account')}</Text>
        <Text style={[head, styles.tHead]}>{t('report.open')}</Text>
        <Text style={[head, styles.tHead]}>{t('report.close')}</Text>
        <Text style={[head, styles.tHead]}>{t('report.variation')}</Text>
      </View>
      {item.accounts.map((l) => {
        const a = accountsById.get(l.account_id)
        return (
          <View key={l.account_id} style={[styles.tr, l.net === 0 && { opacity: 0.55 }]}>
            <View style={[styles.tName, styles.tNameRow]}>
              <LogoTile size={24} operatorId={a?.operator_id} name={a?.name} color={a?.color} icon={a?.type === 'PHYSICAL' ? 'cash-outline' : undefined} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.ink }}>{a?.name}</Text>
            </View>
            <View style={styles.tNum}><Amount value={l.open} size={12} weight="regular" currency={false} color={colors.content} /></View>
            <View style={styles.tNum}><Amount value={l.close} size={12} currency={false} /></View>
            <View style={styles.tNum}>
              {l.net === 0 ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{t('report.unchanged')}</Text>
              ) : (
                <Delta value={l.net} size={12} currency={false} />
              )}
            </View>
          </View>
        )
      })}
      <View style={[styles.tr, styles.tTotal, { borderTopColor: colors.line }]}>
        <Text style={[styles.tName, { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink }]}>{t('report.total')}</Text>
        <View style={styles.tNum}><Amount value={item.open} size={12} weight="regular" currency={false} color={colors.content} /></View>
        <View style={styles.tNum}><Amount value={item.close} size={12} currency={false} /></View>
        <View style={styles.tNum}><Delta value={tot} size={12} currency={false} /></View>
      </View>
    </View>
  )
})

// The day's real transactions (a transfer is one row when both legs are in the selection)
const DayTransactions = memo(function DayTransactions({ day, ids, onOpenTx }) {
  const tick = useTick()
  const entries = useMemo(() => {
    const txs = listTransactions({ date_from: day, date_to: day, account_ids: ids })
    const byId = new Map(txs.map((x) => [x.id, x]))
    const seen = new Set()
    const out = []
    for (const tx of txs) {
      if (seen.has(tx.id)) continue
      const pair = tx.transfer_pair_id ? byId.get(tx.transfer_pair_id) : undefined
      if (pair) seen.add(pair.id)
      out.push({ tx, pair })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, ids, tick])
  return (
    <View style={{ marginHorizontal: -16, marginTop: 6 }}>
      {entries.map((e) => (
        <TransactionRow key={e.tx.id} tx={e.tx} pair={e.pair} onPress={onOpenTx} />
      ))}
    </View>
  )
})

const DayCard = memo(function DayCard({ item, accountsById, ids, expanded, onToggle, onOpenTx }) {
  const { colors } = useTheme()
  const t = useT()
  const multi = item.accounts.length > 1
  return (
    <View style={[styles.day, { backgroundColor: colors.surface }]}>
      <View style={styles.dh}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{dayTitle(item.day)}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
            {t(item.ops > 1 ? 'report.txMany' : 'report.txOne', { n: item.ops })}
          </Text>
        </View>
        <Delta value={item.inn - item.out} size={15} />
      </View>

      <View style={[styles.oc, { backgroundColor: colors.surface2 }]}>
        <View>
          <Text style={[styles.ocLabel, { color: colors.muted }]}>{t('report.open')}</Text>
          <Amount value={item.open} size={14} currency={false} />
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.faint} />
        <View>
          <Text style={[styles.ocLabel, { color: colors.muted }]}>{t('report.close')}</Text>
          <Amount value={item.close} size={14} currency={false} />
        </View>
        <Pressable
          onPress={() => onToggle(item.day)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.more, { borderColor: colors.line }, pressed && { backgroundColor: colors.surface }]}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.content }}>
            {expanded ? t('report.hide') : t(multi ? 'report.byAccount' : 'report.details')}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.content} />
        </Pressable>
      </View>

      <View style={styles.io}>
        <View style={styles.ioItem}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{t('report.in')}</Text>
          <Flow value={item.inn} type="CREDIT" size={12} />
        </View>
        <View style={styles.ioItem}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{t('report.out')}</Text>
          <Flow value={item.out} type="DEBIT" size={12} />
        </View>
      </View>

      {expanded ? (
        <>
          {multi ? <AccountTable item={item} accountsById={accountsById} /> : null}
          <DayTransactions day={item.day} ids={ids} onOpenTx={onOpenTx} />
        </>
      ) : null}
    </View>
  )
})

/* -------------------------------- Screen --------------------------------- */

export default function ReportScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const tick = useTick()
  const periods = useMemo(
    () => [
      { value: '7d', label: t('period.7d') },
      { value: '30d', label: t('period.30d') },
      { value: 'month', label: t('period.month') },
      { value: 'all', label: t('period.all') },
    ],
    [t]
  )
  const [mode, setMode] = useState('list') // 'list' | 'graph'
  const [period, setPeriod] = useState('30d')
  const [sel, setSel] = useState([]) // account ids, [] = all
  const [accounts, setAccounts] = useState([])
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null) // expanded day
  const [recenterKey, setRecenterKey] = useState(0)

  const from = windowFrom(period)

  const { loading } = useFocusData(() => {
    const accs = listAccounts()
    setAccounts(accs)
    const ids = sel.filter((id) => accs.some((a) => a.id === id))
    const days = dayBalances({ from, accountIds: ids })

    // In / out per day: every real row counts for its amount (both legs of a transfer)
    const flows = new Map()
    for (const accountId of ids.length ? ids : [undefined]) {
      for (const r of getDailyReport({ account_id: accountId, date_from: from })) {
        const f = flows.get(r.day) || { inn: 0, out: 0 }
        f.inn += r.total_credit
        f.out += r.total_debit
        flows.set(r.day, f)
      }
    }
    // A transfer whose two legs are both in the selection is ONE operation
    const pairs = new Map(transferPairsByDay({ from, accountIds: ids }).map((r) => [r.day, r.pairs]))
    setRows(
      days.map((d) => {
        const f = flows.get(d.day) || { inn: 0, out: 0 }
        return { ...d, inn: f.inn, out: f.out, ops: Math.max(1, d.count - (pairs.get(d.day) || 0)) }
      })
    )
  }, [period, sel, tick])

  const selected = useMemo(() => sel.filter((id) => accounts.some((a) => a.id === id)), [sel, accounts])
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const totals = useMemo(() => {
    let inn = 0, out = 0
    for (const r of rows) { inn += r.inn; out += r.out }
    return { inn, out }
  }, [rows])

  const toggleDay = useCallback((day) => setOpen((cur) => (cur === day ? null : day)), [])
  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])
  const keyExtractor = useCallback((r) => r.day, [])
  const renderItem = useCallback(
    ({ item }) => (
      <DayCard item={item} accountsById={accountsById} ids={selected} expanded={open === item.day} onToggle={toggleDay} onOpenTx={openTx} />
    ),
    [accountsById, selected, open, toggleDay, openTx]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.appbar}>
        <Text style={{ flex: 1, fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('report.title')}</Text>
        {mode === 'graph' ? (
          <Pressable
            onPress={() => setRecenterKey((k) => k + 1)}
            accessibilityRole="button"
            accessibilityLabel={t('graph.recenter')}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.surface2 }]}
          >
            <Ionicons name="locate-outline" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={[styles.toggle, { borderColor: colors.line }]}>
          {[
            { value: 'list', icon: 'list', label: t('report.viewList') },
            { value: 'graph', icon: 'git-network-outline', label: t('report.viewGraph') },
          ].map((seg, i) => {
            const on = mode === seg.value
            return (
              <Pressable
                key={seg.value}
                accessibilityRole="button"
                accessibilityLabel={seg.label}
                accessibilityState={{ selected: on }}
                onPress={() => setMode(seg.value)}
                style={[styles.toggleBtn, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }, on && { backgroundColor: colors.primarySoft }]}
              >
                <Ionicons name={seg.icon} size={18} color={on ? colors.ink : colors.content} />
              </Pressable>
            )
          })}
        </View>
      </View>

      <AccountChips accounts={accounts} selected={selected} onChange={setSel} allLabel={t('report.allAccounts')} multi={mode === 'graph'} />

      {mode === 'graph' ? (
        <PhysicsGraphView accountIds={selected} recenterKey={recenterKey} />
      ) : (
        <>
          <View style={{ height: 12 }} />
          <PeriodSeg options={periods} value={period} onChange={setPeriod} />
          <View style={{ height: 12 }} />
          <Summary inn={totals.inn} out={totals.out} />

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={colors.primary600} />
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              extraData={open}
              contentContainerStyle={rows.length ? styles.list : { flexGrow: 1 }}
              ListEmptyComponent={<EmptyState icon="document-text-outline" title={t('report.empty')} />}
            />
          )}
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  appbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', height: 36, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  toggleBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  sum: { marginHorizontal: 16, borderRadius: radius.xxl, paddingVertical: 12, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'stretch' },
  sumCell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  sumSep: { width: 1, marginVertical: 4 },
  list: { padding: 16, gap: 10, paddingBottom: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { borderRadius: radius.xxl, paddingVertical: 14, paddingHorizontal: 16 },
  dh: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  oc: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14 },
  ocLabel: { fontFamily: fonts.medium, fontSize: 11 },
  more: { marginLeft: 'auto', height: 30, paddingLeft: 10, paddingRight: 6, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  io: { flexDirection: 'row', gap: 16, marginTop: 8 },
  ioItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  table: { marginTop: 10, borderTopWidth: 1, paddingTop: 4 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7 },
  tName: { flex: 1.25 },
  tNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tNum: { flex: 1, alignItems: 'flex-end' },
  tHead: { flex: 1, textAlign: 'right' },
  tTotal: { borderTopWidth: 1, marginTop: 2, paddingTop: 8 },
})
