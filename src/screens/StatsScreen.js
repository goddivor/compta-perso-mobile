// Stats tab (v2): account chips with logos and a segmented period on top,
// then three panels. Balance = one ink line (a balance is not a debit),
// scoped by the chips; expenses by category = a horizontal ranking (bar
// colour = the category's share of all expenses, see shareTone; the category
// icon carries the identity; a tap filters Transactions on it); income vs
// expenses by month = grouped bars (green / red).
// Account chips only scope the balance: the ranking and the monthly bars
// always cover every account. Empty panels are left out; with no account the
// whole screen is one centred empty state.
import { useCallback, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LineChart, BarChart } from 'react-native-gifted-charts'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listAccounts, getBalanceHistory, getExpensesByCategory, getMonthlyFlow } from '../db/database'
import { fmtNumber, fmtCompact, getFormatLocale, today, shiftDay, monthShortLabel } from '../utils/format'
import { useTick } from '../context/AppContext'
import { useFilters, emptyFilters } from '../context/FiltersContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Amount, CategoryIcon, EmptyState } from '../components/v2'
import { AccountChips } from '../graph/AccountChips'
import { PeriodSeg } from '../graph/PeriodSeg'

const MAX_POINTS = 60 // chart points; longer windows are sampled by day

function windowFrom(period) {
  const now = today()
  if (period === '7d') return shiftDay(now, -6)
  if (period === '30d') return shiftDay(now, -29)
  if (period === 'month') return now.slice(0, 8) + '01'
  return null
}

// Compact amounts for chart axes (12k, 1,5M…): fmtCompact, country's decimal mark
const compact = fmtCompact

// Floor of the balance axis: 0 while the plotted balance never goes negative
// (a balance axis below zero reads as a debt that never happened); otherwise
// the lowest value rounded down to the order of magnitude of the spread.
export function axisBase(values) {
  const min = Math.min(...values)
  if (min >= 0) return 0
  const max = Math.max(...values)
  const span = max - min || Math.abs(min)
  const unit = Math.pow(10, Math.floor(Math.log10(span)))
  return Math.floor(min / unit) * unit
}

// Owner's rule for the category bars, on the share shown next to the name
// (rounded %): under 50 % green, 50 % to 75 % yellow, above 75 % red.
export function shareTone(pct) {
  if (pct < 50) return 'success'
  if (pct <= 75) return 'primary'
  return 'danger'
}

function axisDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(getFormatLocale(), { day: 'numeric', month: 'short' })
}

// Balance of the given accounts, day by day from `from` (null = their first
// day) to today: [{ date, value }], sampled to MAX_POINTS. Each account's
// curve comes from getBalanceHistory (its balance after each active day); a
// day with no movement keeps the last balance.
function balanceSeries(accs, from) {
  const now = today()
  const curves = accs.map((a) => {
    const pts = getBalanceHistory(a.id).map((p) => ({ date: p.date || '0000-00-00', balance: p.balance }))
    // the opening point can be dated after a back-dated transaction
    if (pts.length > 1 && pts[0].date > pts[1].date) pts[0].date = pts[1].date
    return pts
  })
  const valueAt = (pts, day) => {
    let v = pts[0].balance
    for (const p of pts) {
      if (p.date <= day) v = p.balance
      else break
    }
    return v
  }
  let start = from
  if (!start) {
    start = curves.reduce((m, c) => (c.length && c[0].date < m ? c[0].date : m), now)
    if (start < '1970-01-01') start = now
  }
  if (start > now) start = now
  const span = Math.round((new Date(now + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000)
  const step = Math.max(1, Math.ceil(span / (MAX_POINTS - 1)))
  const days = []
  for (let i = 0; i < span; i += step) days.push(shiftDay(start, i))
  days.push(now)
  if (days.length < 2) days.unshift(shiftDay(now, -1))
  return days.map((date) => ({
    date,
    value: curves.reduce((s, pts) => (pts.length ? s + valueAt(pts, date) : s), 0),
  }))
}

function Panel({ children }) {
  const { colors } = useTheme()
  return <View style={[styles.panel, { backgroundColor: colors.surface }]}>{children}</View>
}

function PanelHead({ title, sub }) {
  const { colors } = useTheme()
  return (
    <View style={styles.head}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{title}</Text>
      {sub ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  )
}

export default function StatsScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const tick = useTick()
  const { setFilters } = useFilters()
  const { width: winW } = useWindowDimensions()
  // screen padding 16×2 + panel padding 16×2
  const chartW = winW - 64

  const periods = useMemo(
    () => [
      { value: '7d', label: t('period.7d') },
      { value: '30d', label: t('period.30d') },
      { value: 'month', label: t('period.month') },
      { value: 'all', label: t('period.all') },
    ],
    [t]
  )

  const [accounts, setAccounts] = useState([])
  const [sel, setSel] = useState(null) // account ids for the balance; null = not chosen yet (first account)
  const [period, setPeriod] = useState('30d')
  const [series, setSeries] = useState([])
  const [expenses, setExpenses] = useState([])
  const [monthly, setMonthly] = useState([])

  const from = windowFrom(period)

  const { loading } = useFocusData(() => {
    const accs = listAccounts()
    setAccounts(accs)
    let ids = (sel ?? []).filter((id) => accs.some((a) => a.id === id))
    if (sel === null && accs.length) {
      ids = [accs[0].id]
      setSel(ids)
    }
    const scope = ids.length ? accs.filter((a) => ids.includes(a.id)) : accs
    setSeries(accs.length ? balanceSeries(scope, from) : [])
    setExpenses(getExpensesByCategory({ date_from: from || undefined }).filter((e) => e.total > 0))
    setMonthly(getMonthlyFlow())
  }, [sel, period, tick])

  const selected = useMemo(() => (sel ?? []).filter((id) => accounts.some((a) => a.id === id)), [sel, accounts])
  const scopeAccounts = selected.length ? accounts.filter((a) => selected.includes(a.id)) : accounts
  const scopeName =
    selected.length === 0
      ? t('stats.allAccounts')
      : scopeAccounts.map((a) => a.name).join(', ')
  const periodLabel = periods.find((p) => p.value === period)?.label
  const currentBalance = scopeAccounts.reduce((s, a) => s + a.current_balance, 0)

  /* ----------------------------- Balance (line) --------------------------- */
  const line = useMemo(() => {
    const n = series.length
    if (n < 2) return null
    const base = axisBase(series.map((p) => p.value))
    const mid = Math.floor((n - 1) / 2)
    return {
      base,
      data: series.map((p, i) => ({
        value: p.value - base,
        label: i === 0 || i === mid || i === n - 1 ? axisDate(p.date) : '',
      })),
    }
  }, [series])

  /* ------------------------- Expenses by category -------------------------- */
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.total, 0), [expenses])
  const maxExpense = expenses.length ? expenses[0].total : 0

  // Row tap: Transactions filtered on that category (or on uncategorized), same window
  const goToCategory = useCallback(
    (categoryId) => {
      setFilters({ ...emptyFilters, category_ids: [categoryId == null ? 'none' : categoryId], date_from: from })
      navigation.navigate('TransactionsTab')
    },
    [setFilters, navigation, from]
  )

  /* --------------------------- Monthly flow (bars) ------------------------- */
  const shownMonths = useMemo(() => monthly.slice(-8), [monthly])
  const barData = useMemo(() => {
    const out = []
    for (const m of shownMonths) {
      out.push({
        value: m.income,
        frontColor: colors.success,
        spacing: 2,
        label: monthShortLabel(m.month),
        labelWidth: 44,
        labelTextStyle: { color: colors.muted, fontSize: 9, fontFamily: fonts.regular },
      })
      out.push({ value: m.expenses, frontColor: colors.danger })
    }
    return out
  }, [shownMonths, colors])
  const barW = Math.max(8, Math.min(18, Math.floor(chartW / (shownMonths.length * 3.4 || 1))))

  const axisStyle = {
    yAxisTextStyle: { color: colors.muted, fontSize: 9, fontFamily: fonts.regular },
    xAxisLabelTextStyle: { color: colors.muted, fontSize: 9, fontFamily: fonts.regular },
    yAxisColor: colors.line,
    xAxisColor: colors.line,
    rulesColor: colors.line,
    rulesType: 'dashed',
    noOfSections: 3,
    yAxisLabelWidth: 34,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.appbar}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('stats.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : accounts.length === 0 ? (
        <EmptyState icon="stats-chart-outline" title={t('stats.empty')} />
      ) : (
        <>
          <AccountChips accounts={accounts} selected={selected} onChange={setSel} allLabel={t('stats.all')} />
          <View style={{ height: 12 }} />
          <PeriodSeg options={periods} value={period} onChange={setPeriod} />
          <ScrollView style={styles.body} contentContainerStyle={styles.stack}>
            {/* ----------------------------- Balance ---------------------------- */}
            <Panel>
              <PanelHead title={t('stats.balance')} sub={t('stats.scope', { account: scopeName, period: periodLabel })} />
              <Amount value={currentBalance} size={22} weight="bold" style={{ marginBottom: 10 }} />
              {line ? (
                <LineChart
                  data={line.data}
                  width={chartW - 40}
                  height={140}
                  adjustToWidth
                  thickness={2.5}
                  color={colors.ink}
                  areaChart
                  startFillColor={colors.ink}
                  endFillColor={colors.ink}
                  startOpacity={0.12}
                  endOpacity={0.01}
                  hideDataPoints
                  initialSpacing={4}
                  endSpacing={4}
                  formatYLabel={(l) => compact(Number(l) + line.base)}
                  {...axisStyle}
                />
              ) : null}
            </Panel>

            {/* ------------------------- Expenses by category ------------------- */}
            {expenses.length > 0 ? (
              <Panel>
                <PanelHead title={t('stats.expensesByCategory')} />
                <Amount value={totalExpenses} size={22} weight="bold" color={colors.danger} style={{ marginBottom: 12 }} />
                <View style={{ gap: 4 }}>
                  {expenses.map((e) => {
                    const pct = Math.round((e.total / totalExpenses) * 100)
                    return (
                    <Pressable
                      key={e.category_id == null ? 'none' : e.category_id}
                      onPress={() => goToCategory(e.category_id)}
                      style={({ pressed }) => [styles.rank, pressed && { backgroundColor: colors.surface2 }]}
                    >
                      <CategoryIcon
                        size={32}
                        icon={e.category_id == null ? 'help-outline' : e.icon}
                        name={e.name}
                        color={e.category_id == null ? colors.muted : e.color}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rankTop}>
                          <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink }} numberOfLines={1}>
                            {e.category_id == null ? t('stats.noCategory') : e.name}
                            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                              {'  ' + t('stats.percent', { n: pct })}
                            </Text>
                          </Text>
                          <Amount value={e.total} size={13} color={colors.danger} />
                        </View>
                        <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
                          <View style={[styles.fill, { width: `${(e.total / maxExpense) * 100}%`, backgroundColor: colors[shareTone(pct)] }]} />
                        </View>
                      </View>
                    </Pressable>
                    )
                  })}
                </View>
              </Panel>
            ) : null}

            {/* ------------------------- Income / expenses ---------------------- */}
            {shownMonths.length > 0 ? (
              <Panel>
                <PanelHead title={t('stats.monthlyFlow')} />
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.sw, { backgroundColor: colors.success }]} />
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>{t('stats.income')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.sw, { backgroundColor: colors.danger }]} />
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>{t('stats.expenses')}</Text>
                  </View>
                </View>
                <BarChart
                  data={barData}
                  width={chartW - 40}
                  height={150}
                  barWidth={barW}
                  spacing={barW * 1.2}
                  initialSpacing={10}
                  barBorderTopLeftRadius={4}
                  barBorderTopRightRadius={4}
                  disableScroll={false}
                  formatYLabel={(l) => compact(Number(l))}
                  {...axisStyle}
                />
              </Panel>
            ) : null}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  appbar: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  // flex 1 = basis 0: the panels scroll inside the space left, and never make
  // Yoga shrink the chips row above (a ScrollView defaults to flexShrink 1)
  body: { flex: 1 },
  stack: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30, gap: 12 },
  panel: { borderRadius: radius.xxl, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  rank: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, paddingVertical: 6, paddingHorizontal: 6, marginHorizontal: -6 },
  rankTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sw: { width: 10, height: 10, borderRadius: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
