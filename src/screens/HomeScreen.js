// Home: global balance highlight, horizontally scrollable account cards,
// latest transactions. Tapping an account opens the Transactions tab filtered.
// Perf: data loads after the transition (useFocusData), lists are FlatLists
// with memoized rows and stable callbacks.
import { memo, useCallback, useState } from 'react'
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowCard } from '../theme/tokens'
import { getSummary, listTransactions } from '../db/database'
import { fmt } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { Card, SectionTitle, EmptyState, Dot } from '../components/ui'
import { TransactionRow } from '../components/TransactionRow'

const AccountCard = memo(function AccountCard({ account, onPress }) {
  const { colors } = useTheme()
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
            {account.provider || (account.type === 'ELECTRONIC' ? 'Électronique' : 'Espèces')}
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
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>Compta Perso</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {/* Global balance — brand yellow hero card */}
      <View style={[styles.hero, shadowCard, { backgroundColor: colors.primary }]}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.primaryInk, opacity: 0.72 }}>
          Solde global
        </Text>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 32, color: colors.primaryInk }}>
          {fmt(summary.total)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="phone-portrait-outline" size={13} color={colors.primaryInk} />
            <Text style={[styles.heroSub, { color: colors.primaryInk }]}>{fmt(summary.total_electronic)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="cash-outline" size={13} color={colors.primaryInk} />
            <Text style={[styles.heroSub, { color: colors.primaryInk }]}>{fmt(summary.total_physical)}</Text>
          </View>
        </View>
      </View>

      {/* Accounts — horizontal list */}
      <SectionTitle style={{ marginHorizontal: 20, marginTop: 22, marginBottom: 10 }}>Comptes</SectionTitle>
      {summary.accounts.length === 0 ? (
        <Card style={{ marginHorizontal: 20, paddingVertical: 4 }}>
          <EmptyState icon="wallet-outline" text={'Aucun compte.\nAjoute ton premier compte dans Réglages.'} />
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
        <SectionTitle>Dernières transactions</SectionTitle>
        <Pressable onPress={() => navigation.navigate('TransactionsTab')} hitSlop={8}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.link }}>Tout voir</Text>
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
            <EmptyState text="Aucune transaction pour le moment." />
          </Card>
        }
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
      />
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
  heroSub: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    opacity: 0.8,
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
