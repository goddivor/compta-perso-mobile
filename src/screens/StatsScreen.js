// Stats tab: classic charts built with react-native-gifted-charts.
// Three cards: balance history (smoothed area line, per account), expenses
// by category (donut + legend, filterable period) and monthly income vs
// expenses (grouped bars). All colors come from the theme tokens.
import { useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LineChart, PieChart, BarChart } from 'react-native-gifted-charts'
import { useTheme, fonts } from '../theme/tokens'
import { listAccounts, getBalanceHistory, getExpensesByCategory, getMonthlyFlow } from '../db/database'
import { fmt, today, shiftDay, monthShortLabel } from '../utils/format'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Card, Segmented, SectionTitle, EmptyState, Dot } from '../components/ui'
import { FilterChip } from '../components/FilterChip'

function periodFrom(period) {
  const t = today()
  if (period === '7d') return shiftDay(t, -6)
  if (period === '30d') return shiftDay(t, -29)
  return undefined
}

// Compact FCFA amounts for chart axes (12k, 1,5M…)
function compact(n) {
  const abs = Math.abs(n)
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M'
  if (abs >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(Math.round(n))
}

function dayLabel(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function StatsScreen() {
  const { colors } = useTheme()
  const t = useT()
  const tick = useTick()
  const PERIODS = [
    { label: t('period.7d'), value: '7d' },
    { label: t('period.30d'), value: '30d' },
    { label: t('period.all'), value: '' },
  ]
  const { width: winW } = useWindowDimensions()
  // screen padding 20×2 + card padding 16×2
  const chartW = winW - 40 - 32

  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState(null)
  const [history, setHistory] = useState([])
  const [expenses, setExpenses] = useState([])
  const [monthly, setMonthly] = useState([])
  const [period, setPeriod] = useState('30d')

  const { loading } = useFocusData(() => {
    const accs = listAccounts()
    setAccounts(accs)
    const accId = accountId ?? accs[0]?.id ?? null
    if (accountId == null && accId != null) setAccountId(accId)
    setHistory(accId != null ? getBalanceHistory(accId) : [])
    setExpenses(getExpensesByCategory({ date_from: periodFrom(period) }))
    setMonthly(getMonthlyFlow())
  }, [accountId, period, tick])

  const account = accounts.find((a) => String(a.id) === String(accountId))
  const accountColor = account?.color || colors.link

  /* ----------------------- Balance history (line) ----------------------- */
  const lineData = useMemo(() => {
    const n = history.length
    if (!n) return []
    // ~4 readable, evenly spaced date labels
    const step = Math.max(1, Math.ceil(n / 4))
    return history.map((p, i) => ({
      value: p.balance,
      label: i % step === 0 || i === n - 1 ? dayLabel(p.date) : undefined,
    }))
  }, [history])

  /* ---------------------- Expenses by category (pie) --------------------- */
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.total, 0), [expenses])
  const pieData = useMemo(
    () => expenses.map((e) => ({ value: e.total, color: e.color })),
    [expenses]
  )

  /* ------------------------ Monthly flow (bars) -------------------------- */
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
    yAxisTextStyle: { color: colors.faint, fontSize: 9, fontFamily: fonts.regular },
    xAxisLabelTextStyle: { color: colors.muted, fontSize: 9, fontFamily: fonts.regular },
    yAxisColor: colors.line,
    xAxisColor: colors.line,
    rulesColor: colors.line,
    formatYLabel: (l) => compact(Number(l)),
    noOfSections: 4,
    yAxisLabelWidth: 34,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('stats.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 16 }}>
          {/* ------------------- Balance history ------------------- */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <SectionTitle style={{ fontSize: 16 }}>{t('stats.balanceHistory')}</SectionTitle>
              <FilterChip
                label={account?.name || t('stats.account')}
                active={!!account}
                value={accountId ?? ''}
                onChange={(v) => setAccountId(v)}
                options={accounts.map((a) => ({ label: a.name, value: a.id, color: a.color }))}
              />
            </View>
            {lineData.length < 2 ? (
              <EmptyState icon="trending-up-outline" text={t('stats.notEnoughData')} />
            ) : (
              <LineChart
                data={lineData}
                width={chartW - 40}
                height={180}
                adjustToWidth
                curved
                thickness={2.5}
                color={accountColor}
                areaChart
                startFillColor={accountColor}
                endFillColor={accountColor}
                startOpacity={0.25}
                endOpacity={0.02}
                hideDataPoints={lineData.length > 12}
                dataPointsColor={accountColor}
                dataPointsRadius={3}
                initialSpacing={8}
                endSpacing={8}
                {...axisStyle}
              />
            )}
            {account ? (
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>
                {t('stats.currentBalance')}<Text style={{ fontFamily: fonts.bold, color: colors.ink }}>{fmt(account.current_balance)}</Text>
              </Text>
            ) : null}
          </Card>

          {/* ---------------- Expenses by category ----------------- */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <SectionTitle style={{ fontSize: 16 }}>{t('stats.expensesByCategory')}</SectionTitle>
            </View>
            <Segmented segments={PERIODS} value={period} onChange={setPeriod} />
            {pieData.length === 0 ? (
              <EmptyState icon="pie-chart-outline" text={t('stats.noExpenses')} />
            ) : (
              <>
                <View style={{ alignItems: 'center', marginVertical: 6 }}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={92}
                    innerRadius={60}
                    innerCircleColor={colors.surface}
                    strokeWidth={2}
                    strokeColor={colors.surface}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.muted }}>{t('stats.total')}</Text>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.ink }}>
                          {fmt(totalExpenses)}
                        </Text>
                      </View>
                    )}
                  />
                </View>
                <View style={{ gap: 8 }}>
                  {expenses.map((e, i) => (
                    <View key={`${e.name}-${i}`} style={styles.legendRow}>
                      <Dot color={e.color} size={9} />
                      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: colors.ink }} numberOfLines={1}>
                        {e.name}
                      </Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                        {totalExpenses > 0 ? Math.round((e.total / totalExpenses) * 100) : 0}%
                      </Text>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.content, minWidth: 90, textAlign: 'right' }}>
                        {fmt(e.total)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>

          {/* ------------------ Monthly income/expenses ------------------ */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <SectionTitle style={{ fontSize: 16 }}>{t('stats.monthlyFlow')}</SectionTitle>
            </View>
            {shownMonths.length === 0 ? (
              <EmptyState icon="bar-chart-outline" text={t('stats.noTransactions')} />
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 4 }}>
                  <View style={styles.legendRow}>
                    <Dot color={colors.success} size={9} />
                    <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.muted }}>{t('stats.income')}</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <Dot color={colors.danger} size={9} />
                    <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.muted }}>{t('stats.expenses')}</Text>
                  </View>
                </View>
                <BarChart
                  data={barData}
                  width={chartW - 40}
                  height={170}
                  barWidth={barW}
                  spacing={barW * 1.2}
                  initialSpacing={10}
                  barBorderTopLeftRadius={3}
                  barBorderTopRightRadius={3}
                  disableScroll={false}
                  {...axisStyle}
                />
              </>
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  card: { padding: 16, gap: 12 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
