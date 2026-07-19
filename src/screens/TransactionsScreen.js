// Full transaction list grouped by day, with a search bar (debounced,
// matches description / category / account, accent-insensitive) and a
// filter button opening the full-screen Filter screen (shared context).
// The filter button also supports a quick account filter: long press
// (~300 ms) opens a fan of yellow bubbles (one per account + a clear one);
// slide the finger onto a bubble and release to apply the account filter.
// Floating "+" button, tap to edit and long press to delete (confirmation
// alert). Deleting one side of a transfer removes the pair.
// Perf: deferred loading after transitions, SectionList with memoized rows
// and stable callbacks.
import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  SectionList,
  Pressable,
  Alert,
  ActivityIndicator,
  Animated,
  PanResponder,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { listTransactions, deleteTransaction, listAccounts, getAccountTxCounts } from '../db/database'
import { fmtDay } from '../utils/format'
import { useApp } from '../context/AppContext'
import { useFilters } from '../context/FiltersContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { EmptyState } from '../components/ui'
import { TransactionRow } from '../components/TransactionRow'

// Case- and accent-insensitive normalization for search matching
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/* --------------------- Quick account filter (fan) ----------------------- */

const BUBBLE = 48
const LONG_PRESS_MS = 300
const HIT_RADIUS = 34
const deg = (a) => (a * Math.PI) / 180

// Precomputed arc positions around/left of the filter button. Two rings so
// up to 7 bubbles (clear + 6 accounts) never overlap.
function fanOffsets(count) {
  const ring1Max = 4
  const out = []
  const place = (n, r, a0, a1, base) => {
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (n - 1)
      out[base + i] = { x: Math.cos(deg(a)) * r, y: Math.sin(deg(a)) * r }
    }
  }
  const n1 = Math.min(count, ring1Max)
  place(n1, 92, 95, 200, 0)
  if (count > ring1Max) place(count - ring1Max, 152, 110, 190, ring1Max)
  return out
}

export default function TransactionsScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const { filters, setFilters, search, setSearch, activeCount } = useFilters()
  const [txs, setTxs] = useState([])
  const [input, setInput] = useState(search)
  const [fanAccounts, setFanAccounts] = useState([])
  const [fan, setFan] = useState(null) // { bubbles: [...] } | null
  const [hovered, setHovered] = useState(null)

  // Debounce the local input before pushing it to the shared context
  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 250)
    return () => clearTimeout(t)
  }, [input, setSearch])

  const clearSearch = useCallback(() => {
    setInput('')
    setSearch('')
  }, [setSearch])

  // Account filter pushed from the Home screen
  useEffect(() => {
    if (route.params?.filterStamp) {
      setFilters((f) => ({ ...f, account_id: route.params.accountId || null }))
    }
  }, [route.params?.filterStamp])

  const { loading } = useFocusData(() => {
    setTxs(
      listTransactions({
        account_id: filters.account_id || undefined,
        type: filters.type || undefined,
        category_id: filters.category_id || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      })
    )
    // Fan bubbles: at most 6 accounts, most used first
    const counts = new Map(getAccountTxCounts().map((r) => [r.account_id, r.n]))
    setFanAccounts(
      listAccounts()
        .sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))
        .slice(0, 6)
    )
  }, [filters, tick])

  const visibleTxs = useMemo(() => {
    const q = normalize(search.trim())
    if (!q) return txs
    return txs.filter(
      (tx) =>
        normalize(tx.description).includes(q) ||
        normalize(tx.category_name).includes(q) ||
        normalize(tx.account_name).includes(q)
    )
  }, [txs, search])

  const sections = useMemo(() => {
    const map = new Map()
    for (const tx of visibleTxs) {
      const day = String(tx.date).slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(tx)
    }
    return [...map.entries()].map(([day, data]) => ({ day, data }))
  }, [visibleTxs])

  const openTx = useCallback((tx) => navigation.navigate('TransactionForm', { id: tx.id }), [navigation])
  const openFilter = useCallback(() => navigation.navigate('Filter'), [navigation])

  /* ------------------ Quick account filter (long press) ------------------ */

  const btnRef = useRef(null)
  const rootRef = useRef(null)
  const rootOffsetRef = useRef({ x: 0, y: 0 })
  const fanAccountsRef = useRef(fanAccounts)
  fanAccountsRef.current = fanAccounts
  const fanStateRef = useRef({ timer: null, active: false, bubbles: [], startAt: 0, moved: false, p0: null })
  const fanAnim = useRef(new Animated.Value(0)).current

  const measureRoot = useCallback(() => {
    if (rootRef.current) {
      rootRef.current.measureInWindow((x, y) => {
        rootOffsetRef.current = { x, y }
      })
    }
  }, [])

  const hideFan = useCallback(() => {
    fanStateRef.current.active = false
    fanStateRef.current.bubbles = []
    fanAnim.setValue(0)
    setFan(null)
    setHovered(null)
  }, [fanAnim])

  const showFan = useCallback(() => {
    if (!btnRef.current) return
    btnRef.current.measureInWindow((bx, by, bw, bh) => {
      const cx = bx + bw / 2
      const cy = by + bh / 2
      const accs = fanAccountsRef.current
      // First bubble clears the account filter, then accounts by usage
      const defs = [
        { key: 'clear', isClear: true, accountId: null },
        ...accs.map((a) => ({
          key: `a${a.id}`,
          isClear: false,
          accountId: a.id,
          letter: (a.name || '?').trim().charAt(0).toUpperCase(),
          color: a.color,
        })),
      ]
      const offsets = fanOffsets(defs.length)
      const bubbles = defs.map((d, i) => ({
        ...d,
        // window coords for the finger hit-test
        wx: cx + offsets[i].x,
        wy: cy + offsets[i].y,
        // root-relative coords for rendering
        x: cx + offsets[i].x - rootOffsetRef.current.x,
        y: cy + offsets[i].y - rootOffsetRef.current.y,
      }))
      fanStateRef.current.active = true
      fanStateRef.current.bubbles = bubbles
      setFan({ bubbles })
      Animated.timing(fanAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start()
    })
  }, [fanAnim])

  const filtersRef = useRef(setFilters)
  filtersRef.current = setFilters

  const fanPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const s = fanStateRef.current
          s.startAt = Date.now()
          s.moved = false
          s.p0 = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY }
          measureRoot()
          clearTimeout(s.timer)
          s.timer = setTimeout(showFan, LONG_PRESS_MS)
        },
        onPanResponderMove: (evt) => {
          const s = fanStateRef.current
          const { pageX, pageY } = evt.nativeEvent
          if (!s.active) {
            // Finger drifting before the long press fires: cancel the timer
            if (s.p0 && Math.hypot(pageX - s.p0.x, pageY - s.p0.y) > 12) {
              clearTimeout(s.timer)
              s.timer = null
            }
            return
          }
          let hit = null
          for (const b of s.bubbles) {
            if (Math.hypot(pageX - b.wx, pageY - b.wy) <= HIT_RADIUS) {
              hit = b.key
              break
            }
          }
          setHovered(hit)
        },
        onPanResponderRelease: (evt) => {
          const s = fanStateRef.current
          clearTimeout(s.timer)
          s.timer = null
          if (s.active) {
            const { pageX, pageY } = evt.nativeEvent
            const hit = s.bubbles.find((b) => Math.hypot(pageX - b.wx, pageY - b.wy) <= HIT_RADIUS)
            if (hit) filtersRef.current((f) => ({ ...f, account_id: hit.accountId }))
            hideFan() // release elsewhere: cancel, everything disappears
          } else if (Date.now() - s.startAt < LONG_PRESS_MS) {
            openFilter() // short tap: current behavior (Filter screen)
          }
        },
        onPanResponderTerminate: () => {
          const s = fanStateRef.current
          clearTimeout(s.timer)
          s.timer = null
          hideFan()
        },
      }),
    [measureRoot, showFan, hideFan, openFilter]
  )

  const confirmDelete = useCallback(
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

  const keyExtractor = useCallback((tx) => String(tx.id), [])
  const renderSectionHeader = useCallback(
    ({ section }) => <Text style={[styles.dayHeader, { color: colors.muted }]}>{fmtDay(section.day)}</Text>,
    [colors.muted]
  )
  const renderItem = useCallback(
    ({ item, index, section }) => (
      <View
        style={[
          styles.rowWrap,
          { backgroundColor: colors.surface, borderColor: colors.line },
          index === 0 && { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1 },
          index === section.data.length - 1 && {
            borderBottomLeftRadius: radius.lg,
            borderBottomRightRadius: radius.lg,
            borderBottomWidth: 1,
          },
        ]}
      >
        {index > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
        <TransactionRow tx={item} onPress={openTx} onLongPress={confirmDelete} />
      </View>
    ),
    [colors, openTx, confirmDelete]
  )

  return (
    <SafeAreaView
      ref={rootRef}
      onLayout={measureRoot}
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('tx.title')}</Text>
      </View>

      {/* Search bar + filter button */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search" size={19} color={colors.muted} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('tx.searchPlaceholder')}
            placeholderTextColor={colors.faint}
            style={[styles.searchInput, { color: colors.ink }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {input.length > 0 ? (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {/* Tap: Filter screen. Long press (~300 ms) + slide: quick account fan */}
        <View
          ref={btnRef}
          collapsable={false}
          {...fanPan.panHandlers}
          style={[styles.filterBtn, { backgroundColor: fan ? colors.primary600 : colors.primary }]}
        >
          <Ionicons name="options" size={22} color={colors.primaryInk} />
          {activeCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.ink, borderColor: colors.bg }]}>
              <Text style={[styles.badgeText, { color: colors.bg }]}>{activeCount}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary600} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingBottom: 110 }}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState text={t('tx.emptyFiltered')} />}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
        />
      )}

      {/* Floating add button */}
      <Pressable
        onPress={() => navigation.navigate('TransactionForm', { defaultAccountId: filters.account_id || undefined })}
        style={({ pressed }) => [
          styles.fab,
          shadowOverlay,
          { backgroundColor: pressed ? colors.primary600 : colors.primary },
        ]}
      >
        <Ionicons name="add" size={30} color={colors.primaryInk} />
      </Pressable>

      {/* Quick account filter fan (rendered above the list while the finger
          is down; the ongoing gesture is handled by the button responder) */}
      {fan ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {fan.bubbles.map((b) => {
            const isHovered = hovered === b.key
            return (
              <Animated.View
                key={b.key}
                accessibilityLabel={b.isClear ? t('tx.quickFilterClear') : undefined}
                style={[
                  styles.fanBubble,
                  shadowOverlay,
                  {
                    left: b.x - BUBBLE / 2,
                    top: b.y - BUBBLE / 2,
                    backgroundColor: colors.primary,
                    borderColor: colors.ink,
                    borderWidth: isHovered ? 2 : 0,
                    opacity: fanAnim,
                    transform: [
                      { scale: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, isHovered ? 1.15 : 1] }) },
                    ],
                  },
                ]}
              >
                {b.isClear ? (
                  <Ionicons name="close" size={22} color={colors.primaryInk} />
                ) : (
                  <>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: colors.primaryInk }}>
                      {b.letter}
                    </Text>
                    {/* Account color dot to tell bubbles apart */}
                    <View style={[styles.fanDot, { backgroundColor: b.color, borderColor: colors.primary }]} />
                  </>
                )}
              </Animated.View>
            )
          })}
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 24,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 13,
  },
  dayHeader: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 6,
  },
  rowWrap: {
    marginHorizontal: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
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
  fanBubble: {
    position: 'absolute',
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
  },
})
