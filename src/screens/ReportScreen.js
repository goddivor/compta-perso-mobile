// Daily report: summary band (total in / total out / net) and per-day list.
import { useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme, fonts } from '../theme/tokens'
import { getDailyReport, listAccounts } from '../db/database'
import { fmt, fmtDay, today, shiftDay } from '../utils/format'
import { useApp } from '../context/AppContext'
import { Card, Segmented, Select, Field, EmptyState } from '../components/ui'

const PERIODS = [
  { label: '7 j', value: '7d' },
  { label: '30 j', value: '30d' },
  { label: 'Mois', value: 'month' },
  { label: 'Tout', value: '' },
]

function periodRange(period) {
  const t = today()
  if (period === '7d') return { date_from: shiftDay(t, -6) }
  if (period === '30d') return { date_from: shiftDay(t, -29) }
  if (period === 'month') return { date_from: t.slice(0, 8) + '01' }
  return {}
}

export default function ReportScreen() {
  const { colors } = useTheme()
  const { tick } = useApp()
  const [period, setPeriod] = useState('30d')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState([])
  const [rows, setRows] = useState([])

  const load = useCallback(() => {
    setAccounts(listAccounts())
    setRows(getDailyReport({ account_id: accountId || undefined, ...periodRange(period) }))
  }, [period, accountId])

  useFocusEffect(useCallback(() => { load() }, [load, tick]))

  const totals = useMemo(() => {
    let credit = 0, debit = 0
    for (const r of rows) { credit += r.total_credit; debit += r.total_debit }
    return { credit, debit, net: credit - debit }
  }, [rows])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>Rapport</Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <Segmented segments={PERIODS} value={period} onChange={setPeriod} />
        <Field label="Compte">
          <Select
            value={accountId}
            onChange={setAccountId}
            placeholder="Tous les comptes"
            options={[
              { label: 'Tous les comptes', value: '' },
              ...accounts.map((a) => ({ label: a.name, value: a.id, color: a.color })),
            ]}
          />
        </Field>

        {/* Summary band */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Card style={[styles.stat, { backgroundColor: colors.successSoft, borderColor: colors.successSoft }]}>
            <Text style={[styles.statLabel, { color: colors.success }]}>Entré</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>{fmt(totals.credit)}</Text>
          </Card>
          <Card style={[styles.stat, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }]}>
            <Text style={[styles.statLabel, { color: colors.danger }]}>Sorti</Text>
            <Text style={[styles.statValue, { color: colors.danger }]}>{fmt(totals.debit)}</Text>
          </Card>
          <Card style={styles.stat}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Net</Text>
            <Text style={[styles.statValue, { color: totals.net < 0 ? colors.danger : colors.ink }]}>
              {(totals.net > 0 ? '+' : '') + fmt(totals.net)}
            </Text>
          </Card>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.day}
        contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 30 }}
        ListEmptyComponent={<EmptyState text="Aucune transaction sur la période." />}
        renderItem={({ item }) => (
          <Card style={styles.dayCard}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.ink }}>{fmtDay(item.day)}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                {item.tx_count} transaction{item.tx_count > 1 ? 's' : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.success }}>+{fmt(item.total_credit)}</Text>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.danger }}>-{fmt(item.total_debit)}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: item.net < 0 ? colors.danger : colors.success }}>
              {(item.net > 0 ? '+' : '') + fmt(item.net)}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  stat: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  statLabel: { fontFamily: fonts.medium, fontSize: 11 },
  statValue: { fontFamily: fonts.bold, fontSize: 13 },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
})
