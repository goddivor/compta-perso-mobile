// Forecast (simulations) list — stack screen reached from the Transactions tab.
// A session is a "what if" scenario: its transactions live in the same
// table but carry a forecast_session_id, so they never touch the real
// balances until the session is confirmed.
// In progress first (name, description when set, pill, short date, net),
// then the confirmed ones. Tap opens the session (where it is deleted: no
// long press); the bare Fab creates one through a bottom sheet.
import { useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listForecastSessions, createForecastSession } from '../db/database'
import { shortDate } from '../utils/dates'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Fab, EmptyState, Amount } from '../components/v2'
import ForecastSessionSheet from '../components/ForecastSessionSheet'

export default function ForecastScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const [sessions, setSessions] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)

  const { loading } = useFocusData(() => setSessions(listForecastSessions()), [tick])

  // Flat rows: active sessions, then the "Confirmées" header and its sessions
  const rows = useMemo(() => {
    const active = sessions.filter((s) => !s.validated_at)
    const done = sessions
      .filter((s) => s.validated_at)
      .sort((a, b) => String(b.validated_at).localeCompare(String(a.validated_at)) || b.id - a.id)
    const out = active.map((s) => ({ key: 's' + s.id, kind: 'session', s }))
    if (done.length > 0) {
      out.push({ key: 'h-done', kind: 'header' })
      done.forEach((s) => out.push({ key: 's' + s.id, kind: 'session', s }))
    }
    return out
  }, [sessions])

  const openSession = useCallback(
    (s) => navigation.navigate('ForecastSession', { id: s.id }),
    [navigation]
  )

  const createSession = useCallback(
    ({ name, description }) => {
      const id = createForecastSession({ name, description })
      setSheetOpen(false)
      refresh()
      navigation.navigate('ForecastSession', { id })
    },
    [navigation, refresh]
  )

  const renderItem = useCallback(
    ({ item }) => {
      if (item.kind === 'header') {
        return <Text style={[styles.section, { color: colors.muted }]}>{t('forecast.confirmedSection')}</Text>
      }
      const s = item.s
      const done = !!s.validated_at
      return (
        <Pressable
          onPress={() => openSession(s)}
          style={({ pressed }) => [
            styles.card,
            done
              ? { borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.surface2 : 'transparent' }
              : { backgroundColor: pressed ? colors.surface2 : colors.surface },
          ]}
        >
          <View style={styles.main}>
            <Text numberOfLines={2} style={[styles.name, { color: done ? colors.content : colors.ink, fontFamily: done ? fonts.medium : fonts.semibold }]}>
              {s.name}
            </Text>
            {s.description ? (
              <Text numberOfLines={2} style={[styles.desc, { color: colors.content }]}>{s.description}</Text>
            ) : null}
            <View style={styles.meta}>
              <View style={[styles.pill, { backgroundColor: done ? colors.surface2 : colors.primarySoft }]}>
                <Ionicons name={done ? 'checkmark' : 'time-outline'} size={15} color={done ? colors.content : colors.ink} />
                <Text style={[styles.pillText, { color: done ? colors.content : colors.ink }]}>
                  {done ? t('forecast.confirmed') : t('forecast.inProgress')}
                </Text>
              </View>
              <Text style={[styles.date, { color: colors.muted }]}>{shortDate(done ? s.validated_at : s.created_at)}</Text>
            </View>
          </View>
          {/* A confirmed session no longer owns any transaction: no net */}
          {done ? null : (
            <Amount value={Math.abs(s.net)} type={s.net > 0 ? 'CREDIT' : s.net < 0 ? 'DEBIT' : undefined} size={16} weight="bold" />
          )}
        </Pressable>
      )
    },
    [colors, openSession, t]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96, gap: 10 }}
          ListEmptyComponent={<EmptyState icon="layers-outline" title={t('forecast.empty')} />}
        />
      )}

      <Fab onPress={() => setSheetOpen(true)} accessibilityLabel={t('forecast.newSession')} />

      <ForecastSessionSheet
        visible={sheetOpen}
        session={null}
        onClose={() => setSheetOpen(false)}
        onSubmit={createSession}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: radius.xxl,
  },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 21 },
  desc: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 12,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  date: { fontFamily: fonts.regular, fontSize: 12 },
  section: { fontFamily: fonts.semibold, fontSize: 14, marginTop: 6, marginLeft: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
