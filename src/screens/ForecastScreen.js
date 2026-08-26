// Forecast (simulations) list — stack screen reached from the orange
// floating button of the Transactions tab.
// A session is a "what if" scenario: its transactions live in the same
// table but carry a forecast_session_id, so they never touch the real
// balances until the session is validated.
// Cards: colored left bar (cycling palette like the desktop), name,
// description, creation date, transaction count and signed net.
// Tap opens the detail, long press deletes (confirmation), the FAB
// creates a session through a bottom sheet.
import { useCallback, useState } from 'react'
import { View, Text, FlatList, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowCard, shadowOverlay } from '../theme/tokens'
import { listForecastSessions, createForecastSession, deleteForecastSession } from '../db/database'
import { fmt, fmtDate } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { EmptyState } from '../components/ui'
import ForecastSessionSheet from '../components/ForecastSessionSheet'

// Same cycling palette as the desktop simulation list
const SIM_COLORS = ['#F59E0B', '#818CF8', '#34D399', '#F472B6', '#60A5FA', '#FB923C']
const simColor = (index) => SIM_COLORS[index % SIM_COLORS.length]

export default function ForecastScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const [sessions, setSessions] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)

  const { loading } = useFocusData(() => setSessions(listForecastSessions()), [tick])

  const openSession = useCallback(
    (s) => navigation.navigate('ForecastSession', { id: s.id }),
    [navigation]
  )

  const confirmDelete = useCallback(
    (s) => {
      Alert.alert(
        t('forecast.deleteTitle', { name: s.name }),
        t('forecast.deleteMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => { deleteForecastSession(s.id); refresh() },
          },
        ]
      )
    },
    [refresh, t]
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

  const keyExtractor = useCallback((s) => String(s.id), [])
  const renderItem = useCallback(
    ({ item: s, index }) => {
      const color = simColor(index)
      const positive = s.net >= 0
      return (
        <Pressable
          onPress={() => openSession(s)}
          onLongPress={() => confirmDelete(s)}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.card,
            shadowCard,
            {
              backgroundColor: pressed ? colors.surface2 : colors.surface,
              borderColor: colors.line,
              borderLeftColor: color,
            },
          ]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 }}
              >
                {s.name}
              </Text>
              {s.validated_at ? (
                <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                  <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: colors.success }}>
                    {t('forecast.validated')}
                  </Text>
                </View>
              ) : null}
            </View>

            {s.description ? (
              <Text numberOfLines={2} style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>
                {s.description}
              </Text>
            ) : null}

            {/* A validated session no longer owns any transaction (they became
                real ones), so its count and net would always read zero */}
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
              {s.validated_at
                ? `${fmtDate(s.created_at)} · ${t('forecast.validatedOn', { date: fmtDate(s.validated_at) })}`
                : `${fmtDate(s.created_at)} · ${t(s.tx_count === 1 ? 'forecast.txOne' : 'forecast.txMany', { n: s.tx_count })}`}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {s.validated_at ? null : (
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: positive ? colors.success : colors.danger }}>
                {positive ? '+' : '-'}{fmt(Math.abs(s.net))}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </View>
        </Pressable>
      )
    },
    [colors, confirmDelete, openSession, t]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 110, gap: 12 }}
          ListHeaderComponent={
            sessions.length > 0 ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginBottom: 2 }}>
                {t('forecast.intro')}
              </Text>
            ) : null
          }
          ListFooterComponent={
            sessions.length > 0 ? (
              <Text style={[styles.hint, { color: colors.faint }]}>{t('forecast.longPressHint')}</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingTop: 40, gap: 6 }}>
              <EmptyState icon="git-branch-outline" text={t('forecast.emptyTitle')} />
              <Text
                style={{
                  fontFamily: fonts.regular,
                  fontSize: 12,
                  color: colors.faint,
                  textAlign: 'center',
                  marginHorizontal: 20,
                }}
              >
                {t('forecast.emptyHint')}
              </Text>
            </View>
          }
        />
      )}

      <Pressable
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          shadowOverlay,
          { backgroundColor: pressed ? colors.primary600 : colors.primary },
        ]}
      >
        <Ionicons name="add" size={30} color={colors.primaryInk} />
      </Pressable>

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
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 20,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
