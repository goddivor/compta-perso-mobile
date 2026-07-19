// Home: global balance highlight, horizontally scrollable account cards,
// latest transactions. Tapping an account opens the Transactions tab filtered.
// Perf: data loads after the transition (useFocusData), lists are FlatLists
// with memoized rows and stable callbacks.
import { memo, useCallback, useState } from 'react'
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowCard, shadowOverlay } from '../theme/tokens'
import { getSummary, listTransactions } from '../db/database'
import { fmt, fmtNumber } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useI18n } from '../i18n'
import { Card, SectionTitle, EmptyState, Dot } from '../components/ui'
import { TransactionRow } from '../components/TransactionRow'

const AccountCard = memo(function AccountCard({ account, onPress }) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const handlePress = useCallback(() => onPress(account.id), [onPress, account.id])
  return (
    <Pressable onPress={handlePress}>
      {({ pressed }) => (
        <Card style={[styles.accountCard, pressed && { backgroundColor: colors.surface2 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Dot color={account.color} />
            <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flex: 1 }}>
              {account.name}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
            {account.provider || (account.type === 'ELECTRONIC' ? t('common.electronic') : t('common.cash'))}
          </Text>
          <Text
            style={{
              fontFamily: fonts.bold,
              fontSize: 17,
              marginTop: 8,
              color: account.current_balance < 0 ? colors.danger : colors.ink,
            }}
          >
            {fmt(account.current_balance)}
          </Text>
        </Card>
      )}
    </Pressable>
  )
})

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const { tick, refresh } = useApp()
  const [summary, setSummary] = useState({ total: 0, total_electronic: 0, total_physical: 0, accounts: [] })
  const [latest, setLatest] = useState([])

  const { loading } = useFocusData(() => {
    setSummary(getSummary())
    setLatest(listTransactions().slice(0, 10))
  }, [tick])

  const openAccount = useCallback(
    (accountId) => navigation.navigate('TransactionsTab', { accountId, filterStamp: Date.now() }),
    [navigation]
  )
  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])
  const openForm = useCallback(() => navigation.navigate('TransactionForm'), [navigation])
  const renderAccount = useCallback(
    ({ item }) => <AccountCard account={item} onPress={openAccount} />,
    [openAccount]
  )
  const keyExtractor = useCallback((item) => String(item.id), [])

  const renderLatest = useCallback(
    ({ item, index }) => (
      <View
        style={[
          styles.latestWrap,
          { backgroundColor: colors.surface, borderColor: colors.line },
          index === 0 && styles.latestFirst,
          index === latest.length - 1 && styles.latestLast,
        ]}
      >
        {index > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
        <TransactionRow tx={item} showDate onPress={openTx} />
      </View>
    ),
    [colors, latest.length, openTx]
  )

  const header = (
    <>
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('home.title')}</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {/* Global balance — brand yellow hero card */}
      <View style={[styles.hero, shadowCard, { backgroundColor: colors.primary }]}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.primaryInk, opacity: 0.72 }}>
          {t('home.globalBalance')}
        </Text>
        <View style={styles.heroAmountRow}>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 42, color: colors.primaryInk }}>
            {fmtNumber(summary.total)}
          </Text>
          <Text style={[styles.heroCurrency, { color: colors.primaryInk }]}>FCFA</Text>
        </View>
      </View>

      {/* Accounts — horizontal list */}
      <SectionTitle style={{ marginHorizontal: 20, marginTop: 22, marginBottom: 10 }}>{t('home.accounts')}</SectionTitle>
      {summary.accounts.length === 0 ? (
        <Card style={{ marginHorizontal: 20, paddingVertical: 4 }}>
          <EmptyState icon="wallet-outline" text={t('home.noAccounts')} />
        </Card>
      ) : (
        <FlatList
          horizontal
          data={summary.accounts}
          keyExtractor={keyExtractor}
          renderItem={renderAccount}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        />
      )}

      <View style={styles.latestHeader}>
        <SectionTitle>{t('home.latest')}</SectionTitle>
        <Pressable
          onPress={() => navigation.navigate('TransactionsTab')}
          hitSlop={8}
          style={({ pressed }) => [styles.moreBtn, { backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.ink} />
        </Pressable>
      </View>
    </>
  )

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FlatList
        data={latest}
        keyExtractor={keyExtractor}
        renderItem={renderLatest}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Card style={{ marginHorizontal: 20 }}>
            <EmptyState text={t('home.noTransactions')} />
          </Card>
        }
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
      />

      {/* Floating add button */}
      <Pressable
        onPress={openForm}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  hero: {
    marginHorizontal: 20,
    borderRadius: radius.lg,
    padding: 20,
    gap: 2,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  heroCurrency: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    opacity: 0.6,
    paddingBottom: 8,
  },
  accountCard: {
    width: 170,
    padding: 14,
    gap: 2,
  },
  latestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 10,
  },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestWrap: {
    marginHorizontal: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  latestFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
  },
  latestLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: 1,
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
