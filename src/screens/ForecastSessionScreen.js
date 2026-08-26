// Forecast session detail: the scenario header (name/description, editable),
// the projected balances per account (real balance -> projected balance),
// the simulated transactions and the two closing actions.
// Validating turns every simulated transaction into a real one; deleting
// discards them. A validated session is read-only (its transactions have
// left the session, so the list is empty by design).
import { useCallback, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import {
  listAccounts,
  getForecastSession,
  updateForecastSession,
  validateForecastSession,
  deleteForecastSession,
  deleteTransaction,
} from '../db/database'
import { fmt, fmtDate } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Card, Button, EmptyState, Dot } from '../components/ui'
import { TransactionRow } from '../components/TransactionRow'
import ForecastSessionSheet from '../components/ForecastSessionSheet'

export default function ForecastSessionScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const sessionId = route.params?.id ?? null
  const [session, setSession] = useState(null)
  const [txs, setTxs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)

  const { loading } = useFocusData(() => {
    const { session: s, transactions } = getForecastSession(sessionId)
    setSession(s)
    setTxs(transactions)
    setAccounts(listAccounts())
  }, [sessionId, tick])

  const isValidated = !!session?.validated_at

  const net = useMemo(
    () => txs.reduce((sum, tx) => sum + (tx.type === 'CREDIT' ? tx.amount : -tx.amount), 0),
    [txs]
  )

  // Projected balance = real balance + simulated net, for the accounts the
  // simulation actually touches (accounts order follows listAccounts()).
  const projections = useMemo(() => {
    const deltas = new Map()
    for (const tx of txs) {
      const d = deltas.get(tx.account_id) || 0
      deltas.set(tx.account_id, d + (tx.type === 'CREDIT' ? tx.amount : -tx.amount))
    }
    return accounts
      .filter((a) => deltas.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        current: a.current_balance,
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

  const confirmDeleteTx = useCallback(
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

  const saveSession = useCallback(
    ({ name, description }) => {
      updateForecastSession({ id: sessionId, name, description })
      setSheetOpen(false)
      refresh()
    },
    [refresh, sessionId]
  )

  const confirmValidate = useCallback(() => {
    Alert.alert(
      t('forecast.validateTitle'),
      t('forecast.validateMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('forecast.validateConfirm'),
          onPress: () => { validateForecastSession(sessionId); refresh(); navigation.goBack() },
        },
      ]
    )
  }, [navigation, refresh, sessionId, t])

  const confirmDeleteSession = useCallback(() => {
    Alert.alert(
      t('forecast.deleteTitle', { name: session?.name || '' }),
      t('forecast.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => { deleteForecastSession(sessionId); refresh(); navigation.goBack() },
        },
      ]
    )
  }, [navigation, refresh, session, sessionId, t])

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
        <EmptyState icon="git-branch-outline" text={t('forecast.notFound')} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* Scenario header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>{session.name}</Text>
            {session.description ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.content }}>
                {session.description}
              </Text>
            ) : null}
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
              {t('forecast.createdOn', { date: fmtDate(session.created_at) })}
            </Text>
          </View>
          {!isValidated ? (
            <Pressable
              onPress={() => setSheetOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
            >
              <Ionicons name="create-outline" size={19} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Read-only banner for an already validated session */}
        {isValidated ? (
          <Card style={{ padding: 14, gap: 6, backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.success }}>
                {t('forecast.validatedOn', { date: fmtDate(session.validated_at) })}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>
              {t('forecast.validatedBanner')}
            </Text>
          </Card>
        ) : null}

        {/* Simulated balance */}
        {!isValidated ? (
          <Card style={styles.summary}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.muted }}>
                {t('forecast.net')}
              </Text>
              <Text style={{ fontFamily: fonts.extrabold, fontSize: 22, color: net >= 0 ? colors.success : colors.danger }}>
                {net >= 0 ? '+' : '-'}{fmt(Math.abs(net))}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.muted }}>
                {t('forecast.txCountLabel')}
              </Text>
              <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.ink }}>{txs.length}</Text>
            </View>
          </Card>
        ) : null}

        {/* Projected balances per account */}
        {projections.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('forecast.projected')}</Text>
            <Card style={{ paddingVertical: 6 }}>
              {projections.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 14 }} /> : null}
                  <View style={styles.projRow}>
                    <Dot color={p.color || colors.faint} size={9} />
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink }}
                    >
                      {p.name}
                    </Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.faint }}>
                      {fmt(p.current)}
                    </Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.faint} />
                    <Text
                      style={{
                        fontFamily: fonts.bold,
                        fontSize: 13,
                        color: p.projected < 0 ? colors.danger : colors.ink,
                      }}
                    >
                      {fmt(p.projected)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Simulated transactions */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t('forecast.txSection')}</Text>
          {txs.length === 0 ? (
            <Card style={{ paddingVertical: 6 }}>
              <EmptyState
                icon="receipt-outline"
                text={isValidated ? t('forecast.noTxValidated') : t('forecast.noTx')}
              />
            </Card>
          ) : (
            <Card style={{ paddingVertical: 2 }}>
              {txs.map((tx, i) => (
                <View key={tx.id}>
                  {i > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
                  <TransactionRow
                    tx={tx}
                    showDate
                    onPress={isValidated ? undefined : openTx}
                    onLongPress={isValidated ? undefined : confirmDeleteTx}
                  />
                </View>
              ))}
            </Card>
          )}
          {!isValidated && txs.length > 0 ? (
            <Text style={[styles.hint, { color: colors.faint }]}>{t('forecast.txHint')}</Text>
          ) : null}
        </View>

        {/* Actions */}
        {!isValidated ? (
          <View style={{ gap: 10, marginTop: 4 }}>
            <Button title={t('forecast.addTx')} variant="secondary" icon="add" onPress={addTx} />
            <Button
              title={t('forecast.validate')}
              icon="checkmark-circle-outline"
              onPress={confirmValidate}
              disabled={txs.length === 0}
            />
            <Button
              title={t('forecast.delete')}
              variant="danger"
              icon="trash-outline"
              onPress={confirmDeleteSession}
            />
          </View>
        ) : (
          <Button
            title={t('forecast.delete')}
            variant="danger"
            icon="trash-outline"
            onPress={confirmDeleteSession}
            style={{ marginTop: 4 }}
          />
        )}
      </ScrollView>

      <ForecastSessionSheet
        visible={sheetOpen}
        session={session}
        onClose={() => setSheetOpen(false)}
        onSubmit={saveSession}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 18, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  projRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
})
