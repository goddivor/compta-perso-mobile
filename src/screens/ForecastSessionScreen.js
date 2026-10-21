// Forecast session detail: the scenario header (name, description), the
// simulated net, the projected balances per touched account (real balance ->
// projected balance), the simulated transactions and the closing actions.
// Confirming turns every simulated transaction into a real one; deleting
// discards the session. A confirmed session is read-only (its transactions
// have left the session). Deleting happens only here, behind a dialog.
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import {
  listAccounts,
  getForecastSession,
  updateForecastSession,
  validateForecastSession,
  deleteForecastSession,
} from '../db/database'
import { fmt, fmtNumber } from '../utils/format'
import { shortDate } from '../utils/dates'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Button } from '../components/ui'
import { EmptyState, ConfirmDialog, TransactionRow, LogoTile, Amount } from '../components/v2'
import ForecastSessionSheet from '../components/ForecastSessionSheet'

const signed = (tx) => (tx.type === 'CREDIT' ? tx.amount : -tx.amount)

export default function ForecastSessionScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const sessionId = route.params?.id ?? null
  const [session, setSession] = useState(null)
  const [txs, setTxs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dialog, setDialog] = useState(null) // 'confirm' | 'delete' | null

  const { loading } = useFocusData(() => {
    const { session: s, transactions } = getForecastSession(sessionId)
    setSession(s)
    setTxs(transactions)
    setAccounts(listAccounts())
  }, [sessionId, tick])

  const isConfirmed = !!session?.validated_at
  const canEdit = !!session && !isConfirmed

  // Pencil in the app bar, only while the session is editable
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit
        ? () => (
            <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('forecast.editSession')}>
              <Ionicons name="pencil-outline" size={22} color={colors.ink} />
            </Pressable>
          )
        : undefined,
    })
  }, [navigation, canEdit, colors.ink, t])

  const net = useMemo(() => txs.reduce((sum, tx) => sum + signed(tx), 0), [txs])

  // A transfer is two rows: show it as one (debit leg + its credit leg)
  const rows = useMemo(() => {
    const byId = new Map(txs.map((tx) => [tx.id, tx]))
    const out = []
    for (const tx of txs) {
      const other = tx.transfer_pair_id ? byId.get(tx.transfer_pair_id) : null
      if (other && tx.type === 'CREDIT') continue
      out.push({ tx, pair: other || undefined })
    }
    return out
  }, [txs])

  // Projected balance = real balance + simulated net, for the accounts the
  // simulation actually touches (accounts order follows listAccounts()).
  const projections = useMemo(() => {
    const deltas = new Map()
    for (const tx of txs) deltas.set(tx.account_id, (deltas.get(tx.account_id) || 0) + signed(tx))
    return accounts
      .filter((a) => deltas.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        operatorId: a.operator_id,
        physical: a.type === 'PHYSICAL',
        current: a.current_balance,
        delta: deltas.get(a.id),
        projected: a.current_balance + deltas.get(a.id),
      }))
  }, [accounts, txs])

  const openTx = useCallback(
    (tx) => navigation.navigate('TransactionForm', { id: tx.id, sessionId }),
    [navigation, sessionId]
  )

  const addTx = useCallback(
    () => navigation.navigate('TransactionForm', { sessionId }),
    [navigation, sessionId]
  )

  const saveSession = useCallback(
    ({ name, description }) => {
      updateForecastSession({ id: sessionId, name, description })
      setSheetOpen(false)
      refresh()
    },
    [refresh, sessionId]
  )

  const confirmSession = useCallback(() => {
    setDialog(null)
    validateForecastSession(sessionId)
    refresh()
    navigation.goBack()
  }, [navigation, refresh, sessionId])

  const deleteSession = useCallback(() => {
    setDialog(null)
    deleteForecastSession(sessionId)
    refresh()
    navigation.goBack()
  }, [navigation, refresh, sessionId])

  const viewTransactions = useCallback(
    () => navigation.navigate('Tabs', { screen: 'TransactionsTab' }),
    [navigation]
  )

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]} edges={['bottom']}>
        <ActivityIndicator size="small" color={colors.primary600} />
      </SafeAreaView>
    )
  }

  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <EmptyState icon="layers-outline" title={t('forecast.notFound')} />
      </SafeAreaView>
    )
  }

  const created = shortDate(session.created_at)
  const confirmLines = projections
    .map((p) => t('forecast.validateLine', { name: p.name, from: fmtNumber(p.current), to: fmt(p.projected) }))
    .join('\n')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* Scenario header */}
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.ink }]}>{session.name}</Text>
          {session.description ? (
            <Text style={[styles.desc, { color: colors.content }]}>{session.description}</Text>
          ) : null}
          <Text style={[styles.created, { color: colors.muted }]}>
            {isConfirmed
              ? t('forecast.createdConfirmedOn', { date: created, confirmed: shortDate(session.validated_at) })
              : t('forecast.createdOn', { date: created })}
          </Text>
        </View>

        {isConfirmed ? (
          <>
            <View style={[styles.banner, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={[styles.bannerText, { color: colors.ink }]}>{t('forecast.confirmed')}</Text>
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>{t('forecast.opsSection')}</Text>
            <Button
              title={t('forecast.viewTransactions')}
              variant="secondary"
              icon="swap-vertical"
              onPress={viewTransactions}
              style={styles.fullBtn}
            />
          </>
        ) : (
          <>
            {/* Simulated net */}
            <View style={[styles.sum, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sumLabel, { color: colors.muted }]}>{t('forecast.net')}</Text>
                <Amount
                  value={Math.abs(net)}
                  type={net > 0 ? 'CREDIT' : net < 0 ? 'DEBIT' : undefined}
                  size={26}
                  weight="bold"
                  style={{ marginTop: 2 }}
                />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.count, { color: colors.ink }]}>{rows.length}</Text>
                <Text style={[styles.sumLabel, { color: colors.content }]}>
                  {t(rows.length === 1 ? 'forecast.opOne' : 'forecast.opMany')}
                </Text>
              </View>
            </View>

            {/* Projected balances per touched account */}
            {projections.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.muted }]}>{t('forecast.projected')}</Text>
                <View style={[styles.list, { backgroundColor: colors.surface }]}>
                  {projections.map((p) => (
                    <View key={p.id} style={styles.projRow}>
                      <LogoTile
                        size={32}
                        operatorId={p.operatorId}
                        name={p.name}
                        color={p.color}
                        icon={p.physical ? 'cash-outline' : undefined}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[styles.projName, { color: colors.ink }]}>{p.name}</Text>
                        <Text numberOfLines={1} style={[styles.projSub, { color: colors.muted }]}>
                          {t('forecast.currentBalance', { amount: fmt(p.current) })}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Amount value={p.projected} weight="bold" color={p.projected < 0 ? colors.danger : undefined} />
                        {p.delta !== 0 ? (
                          <Amount
                            value={Math.abs(p.delta)}
                            type={p.delta > 0 ? 'CREDIT' : 'DEBIT'}
                            size={12}
                            currency={false}
                            style={{ marginTop: 2 }}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Simulated transactions */}
            <Text style={[styles.section, { color: colors.muted }]}>{t('forecast.txSection')}</Text>
            {rows.length > 0 ? (
              <View style={[styles.list, { backgroundColor: colors.surface }]}>
                {rows.map((r) => (
                  <TransactionRow key={r.tx.id} tx={r.tx} pair={r.pair} showDate onPress={openTx} />
                ))}
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actions}>
              <Button title={t('forecast.addTx')} variant="secondary" icon="add" onPress={addTx} />
              <Button
                title={t('forecast.validate')}
                icon="checkmark"
                onPress={() => setDialog('confirm')}
                disabled={txs.length === 0}
              />
              <Button title={t('forecast.delete')} variant="danger" icon="trash-outline" onPress={() => setDialog('delete')} />
            </View>
          </>
        )}

        {isConfirmed ? (
          <Button
            title={t('forecast.delete')}
            variant="danger"
            icon="trash-outline"
            onPress={() => setDialog('delete')}
            style={styles.fullBtn}
          />
        ) : null}
      </ScrollView>

      <ForecastSessionSheet
        visible={sheetOpen}
        session={session}
        onClose={() => setSheetOpen(false)}
        onSubmit={saveSession}
      />

      <ConfirmDialog
        visible={dialog === 'confirm'}
        tone="primary"
        icon="checkmark"
        title={t('forecast.validateTitle')}
        body={confirmLines}
        confirmLabel={t('forecast.validateConfirm')}
        onConfirm={confirmSession}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'delete'}
        tone="danger"
        title={t('forecast.deleteTitle')}
        body={session.name}
        confirmLabel={t('common.delete')}
        onConfirm={deleteSession}
        onCancel={() => setDialog(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: 0 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  desc: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 4 },
  created: { fontFamily: fonts.regular, fontSize: 12, marginTop: 8 },
  sum: {
    marginTop: 16,
    padding: 16,
    borderRadius: radius.xxl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sumLabel: { fontFamily: fonts.medium, fontSize: 13 },
  count: { fontFamily: fonts.bold, fontSize: 20 },
  section: { fontFamily: fonts.semibold, fontSize: 14, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  list: { borderRadius: radius.xxl, paddingVertical: 4, overflow: 'hidden' },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  projName: { fontFamily: fonts.medium, fontSize: 15 },
  projSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  actions: { gap: 10, marginTop: 20 },
  banner: { marginTop: 16, padding: 16, borderRadius: radius.xxl, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerText: { fontFamily: fonts.semibold, fontSize: 15 },
  fullBtn: { marginTop: 4 },
})
