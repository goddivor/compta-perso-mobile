// Home (v2): app bar with the hide-amounts eye, yellow balance card (total,
// profile flag + currency name, currency sign watermark), horizontally
// scrollable account cards ending with an "Ajouter" tile, latest
// transactions (a transfer is ONE row). Adding is the bare Fab.
// Perf: data loads after the transition (useFocusData), memoized rows.
import { memo, useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { getSummary, listTransactions } from '../db/database'
import { useApp } from '../context/AppContext'
import { usePrivacy } from '../context/PrivacyContext'
import { useFocusData } from '../hooks/useFocusData'
import { useProfile } from '../hooks/useProfile'
import { useI18n } from '../i18n'
import { useCurrency } from '../registry'
import { capitalizeFirst } from '../utils/format'
import { Fab, EmptyState, LogoTile, Amount, Flag, CurrencySign, TransactionRow } from '../components/v2'

const LATEST_COUNT = 10

// Newest first; the two legs of a transfer become one entry { tx, pair }
function buildLatest(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const seen = new Set()
  const out = []
  for (const tx of rows) {
    if (seen.has(tx.id)) continue
    seen.add(tx.id)
    let pair = null
    if (tx.transfer_pair_id) {
      pair = byId.get(tx.transfer_pair_id) || null
      if (pair) seen.add(pair.id)
    }
    out.push({ tx, pair })
    if (out.length === LATEST_COUNT) break
  }
  return out
}

// `lang` keys the Amount: Amount is memoized on its value, so it would keep
// the previous language's number format (47,500 → 47 500) until remounted
const AccountCard = memo(function AccountCard({ account, onPress, lang }) {
  const { colors } = useTheme()
  const handlePress = useCallback(() => onPress(account.id), [onPress, account.id])
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.acc, { backgroundColor: pressed ? colors.surface2 : colors.surface }]}
    >
      <LogoTile
        size={48}
        operatorId={account.operator_id}
        name={account.name}
        color={account.color}
        icon={account.type === 'PHYSICAL' ? 'cash-outline' : undefined}
      />
      <Text numberOfLines={2} style={[styles.accName, { color: colors.ink }]}>{account.name}</Text>
      <Amount key={lang} value={account.current_balance} size={17} weight="bold" />
    </Pressable>
  )
})

function SectionHeader({ title, link, onLink }) {
  const { colors } = useTheme()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      {link ? (
        <Pressable onPress={onLink} hitSlop={8} style={styles.sectionLink}>
          <Text style={[styles.sectionLinkText, { color: colors.content }]}>{link}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.content} />
        </Pressable>
      ) : null}
    </View>
  )
}

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme()
  const { t, lang } = useI18n()
  const { tick, refresh } = useApp()
  const { hidden, toggleHidden } = usePrivacy()
  const profile = useProfile()
  const { data: currency } = useCurrency(profile.currency || null)
  const [summary, setSummary] = useState({ total: 0, accounts: [] })
  const [latest, setLatest] = useState([])

  const { loading } = useFocusData(() => {
    setSummary(getSummary())
    setLatest(buildLatest(listTransactions()))
  }, [tick])

  const currencyName = useMemo(() => {
    const n = currency?.name
    if (!n) return profile.currency || ''
    return capitalizeFirst(typeof n === 'string' ? n : n[lang] || n.en || profile.currency || '')
  }, [currency, lang, profile.currency])

  const openAccount = useCallback(
    (accountId) => navigation.navigate('TransactionsTab', { accountId, filterStamp: Date.now() }),
    [navigation]
  )
  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])
  const openForm = useCallback(() => navigation.navigate('TransactionForm'), [navigation])
  const openAccounts = useCallback(() => navigation.navigate('AccountsList'), [navigation])
  const addAccount = useCallback(() => navigation.navigate('AccountForm'), [navigation])
  // "Tout voir" clears any account filter set earlier from an account card
  const openAllTx = useCallback(
    () => navigation.navigate('TransactionsTab', { accountId: null, filterStamp: Date.now() }),
    [navigation]
  )

  const renderAccount = useCallback(
    ({ item }) => <AccountCard account={item} onPress={openAccount} lang={lang} />,
    [openAccount, lang]
  )
  const accountKey = useCallback((item) => String(item.id), [])
  const latestKey = useCallback((item) => String(item.tx.id), [])

  const renderLatest = useCallback(
    ({ item, index }) => (
      <View
        style={[
          styles.latestWrap,
          { backgroundColor: colors.surface },
          index === 0 && styles.latestFirst,
          index === latest.length - 1 && styles.latestLast,
        ]}
      >
        {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
        <TransactionRow tx={item.tx} pair={item.pair} showDate onPress={openTx} />
      </View>
    ),
    [colors, latest.length, openTx]
  )

  const hasAccounts = summary.accounts.length > 0

  const appBar = (
    <View style={styles.appbar}>
      <Text numberOfLines={1} style={[styles.appbarTitle, { color: colors.ink }]}>{t('home.title')}</Text>
      <Pressable
        onPress={toggleHidden}
        accessibilityRole="button"
        accessibilityLabel={hidden ? t('home.showAmounts') : t('home.hideAmounts')}
        style={styles.iconBtn}
      >
        <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.ink} />
      </Pressable>
    </View>
  )

  const balanceCard = (
    <View style={[styles.bal, { backgroundColor: colors.primary }]}>
      <View pointerEvents="none" style={styles.emblem}>
        <CurrencySign code={profile.currency} size={232} color={colors.primaryInk} />
      </View>
      <View style={styles.balTop}>
        <Text style={[styles.balLabel, { color: colors.primaryInk }]}>{t('home.globalBalance')}</Text>
        <View style={styles.cur}>
          <View style={[StyleSheet.absoluteFill, styles.curBg, { backgroundColor: colors.primaryInk }]} />
          <Flag iso2={profile.country_iso2} size={20} />
          <Text numberOfLines={1} style={[styles.curText, { color: colors.primaryInk }]}>{currencyName}</Text>
        </View>
      </View>
      <Amount key={lang} value={summary.total} size={42} weight="bold" color={colors.primaryInk} style={styles.balAmount} />
    </View>
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

  if (!hasAccounts) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {appBar}
        {balanceCard}
        <SectionHeader title={t('home.accounts')} />
        <EmptyState
          icon="wallet-outline"
          title={t('home.noAccounts')}
          action={{ label: t('home.addAccount'), icon: 'add', onPress: addAccount }}
        />
      </SafeAreaView>
    )
  }

  const header = (
    <>
      {appBar}
      {balanceCard}
      <SectionHeader title={t('home.accounts')} link={t('home.manage')} onLink={openAccounts} />
      <FlatList
        horizontal
        data={summary.accounts}
        keyExtractor={accountKey}
        renderItem={renderAccount}
        extraData={lang}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.accsContent}
        // The footer wrapper is a column View: make it a row so the tile
        // stretches to the account cards' height like a regular cell does
        ListFooterComponentStyle={styles.accAddCell}
        ListFooterComponent={
          <Pressable onPress={addAccount} accessibilityRole="button" style={[styles.acc, styles.accAdd, { borderColor: colors.line }]}>
            <Ionicons name="add" size={26} color={colors.content} />
            <Text style={[styles.accAddText, { color: colors.content }]}>{t('common.add')}</Text>
          </Pressable>
        }
      />
      <SectionHeader title={t('home.latest')} link={t('home.seeAll')} onLink={openAllTx} />
    </>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FlatList
        data={latest}
        keyExtractor={latestKey}
        renderItem={renderLatest}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('home.noTransactions')} />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
      />
      <Fab onPress={openForm} accessibilityLabel={t('common.add')} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  appbar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 },
  appbarTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.2 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bal: { marginHorizontal: 16, marginTop: 4, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 16, borderRadius: radius.xxl, overflow: 'hidden' },
  emblem: { position: 'absolute', right: -34, top: -6, opacity: 0.1 },
  balTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balLabel: { fontFamily: fonts.medium, fontSize: 14, opacity: 0.72 },
  cur: { marginLeft: 'auto', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 4, paddingRight: 10 },
  curBg: { borderRadius: 14, opacity: 0.08 },
  curText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 12 },
  balAmount: { marginTop: 6, letterSpacing: -1.2 },
  section: { height: 40, marginTop: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionLinkText: { fontFamily: fonts.semibold, fontSize: 13 },
  accsContent: { paddingHorizontal: 16, gap: 10 },
  acc: { width: 148, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', gap: 8 },
  accName: { fontFamily: fonts.semibold, fontSize: 14, textAlign: 'center' },
  // Same footprint as an account card (the owner's v2.0.0 review)
  accAddCell: { flexDirection: 'row' },
  accAdd: { justifyContent: 'center', borderWidth: 1.5, gap: 4 },
  accAddText: { fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center' },
  latestWrap: { marginHorizontal: 16, overflow: 'hidden' },
  latestFirst: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  latestLast: { borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  divider: { height: 1, marginLeft: 68 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
