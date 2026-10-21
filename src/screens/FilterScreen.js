// Filters (v2). Edits the shared FiltersContext live; "Rechercher" only goes back.
// Sections: period, months (current first), specific period (range calendar),
// accounts and categories (tri-state chips), type. Period, month and range clear
// each other (the context setters do it).
import { useMemo, useState, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { Chip, TriChip, LogoTile, CategoryIcon } from '../components/v2'
import { useFilters } from '../context/FiltersContext'
import { listAccounts, listCategories } from '../db/database'
import { monthName, weekdayInitials, today } from '../utils/format'
import { recentMonths, monthKey } from '../utils/dates'
import { PERIODS, triState } from '../utils/filters'
import { useT } from '../i18n'

const PERIOD_KEYS = { today: 'filter.today', '7d': 'filter.last7', '30d': 'filter.last30' }
const TYPES = [
  { value: null, key: 'filter.typeAll' },
  { value: 'DEBIT', key: 'filter.typeDebit' },
  { value: 'CREDIT', key: 'filter.typeCredit' },
  { value: 'TRANSFER', key: 'filter.typeTransfer' },
]

const pad = (n) => String(n).padStart(2, '0')

/* ------------------------------- Pieces --------------------------------- */

function Section({ title, legend, children }) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sectionHead}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{title}</Text>
        {legend ? <Legend /> : null}
      </View>
      {children}
    </View>
  )
}

// Mini chips reminding the two touches of a tri-state chip
function Legend() {
  const { colors } = useTheme()
  const t = useT()
  const mini = (bg, fg, icon, label) => (
    <View style={[styles.mini, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={13} color={fg} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: fg }}>{label}</Text>
    </View>
  )
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {mini(colors.primarySoft, colors.ink, 'checkmark', t('filter.legendInclude'))}
      {mini(colors.dangerSoft, colors.danger, 'remove-circle', t('filter.legendExclude'))}
    </View>
  )
}

function MonthCard({ ym, active, onPress }) {
  const { colors } = useTheme()
  const [y, m] = ym.split('-').map(Number)
  const fg = active ? colors.primaryInk : colors.ink
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.mcard, { backgroundColor: active ? colors.primary : colors.surface }]}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: fg }}>{monthName(m - 1)}</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: active ? colors.primaryInk : colors.muted }}>{y}</Text>
    </Pressable>
  )
}

/* --------------------------- Range calendar ----------------------------- */
// Pure-JS monthly grid; cells have integer widths measured with onLayout.
// First tap = one-day range (anchor); second tap = the other end (sorted);
// a tap with no anchor restarts. The range is therefore always complete.

function RangeCalendar({ range, month, onChange }) {
  const { colors } = useTheme()
  const t = useT()
  const [width, setWidth] = useState(0)
  const [anchor, setAnchor] = useState(null)
  const [cursor, setCursor] = useState(() => {
    const base = range?.from || (month ? `${month}-01` : today())
    return { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }
  })

  const cell = Math.floor(width / 7)
  const half = Math.floor(cell / 2)
  const todayIso = today()

  const cells = useMemo(() => {
    const dim = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const offset = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7 // Monday first
    const out = Array(offset).fill(null)
    for (let d = 1; d <= dim; d++) out.push(`${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`)
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [cursor])

  const shift = (n) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const pick = (iso) => {
    if (anchor) {
      const [from, to] = iso < anchor ? [iso, anchor] : [anchor, iso]
      onChange({ from, to })
      setAnchor(null)
    } else {
      onChange({ from: iso, to: iso })
      setAnchor(iso)
    }
  }

  const from = range?.from || null
  const to = range?.to || from
  const wd = weekdayInitials()

  return (
    <View style={[styles.cal, { backgroundColor: colors.surface }]}>
      <View style={styles.calHead}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
          {monthName(cursor.m)} {cursor.y}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Pressable onPress={() => shift(-1)} accessibilityLabel={t('filter.prevMonth')} style={styles.nav}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Pressable onPress={() => shift(1)} accessibilityLabel={t('filter.nextMonth')} style={styles.nav}>
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </View>
      <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ alignItems: 'center' }}>
        {cell > 0 ? (
          <View style={{ width: cell * 7, flexDirection: 'row', flexWrap: 'wrap' }}>
            {wd.map((w, i) => (
              <View key={`w${i}`} style={{ width: cell, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>{w}</Text>
              </View>
            ))}
            {cells.map((iso, i) => {
              if (!iso) return <View key={`e${i}`} style={{ width: cell, height: 42 }} />
              const inside = !!from && iso >= from && iso <= to
              const edge = inside && (iso === from || iso === to)
              const multi = from !== to
              return (
                <Pressable key={iso} onPress={() => pick(iso)} style={{ width: cell, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                  {inside && multi ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: iso === from ? half : 0,
                        right: iso === to ? cell - half : 0,
                        backgroundColor: colors.primarySoft,
                      }}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.day,
                      edge && { backgroundColor: colors.primary },
                      !edge && iso === todayIso && { borderWidth: 1.5, borderColor: colors.faint },
                    ]}
                  >
                    <Text style={{ fontFamily: edge ? fonts.semibold : fonts.regular, fontSize: 14, color: edge ? colors.primaryInk : colors.ink }}>
                      {Number(iso.slice(8, 10))}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/* -------------------------------- Screen -------------------------------- */

export default function FilterScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const insets = useSafeAreaInsets()
  const { filters, setPeriod, setMonth, setRange, setType, cycleAccount, cycleCategory, resetFilters } = useFilters()

  const accounts = useMemo(() => listAccounts(), [])
  const categories = useMemo(() => listCategories(), [])
  const months = useMemo(() => recentMonths(12), [])

  const toggleType = useCallback((v) => setType(filters.type === v ? null : v), [filters.type, setType])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 20 }} showsVerticalScrollIndicator={false}>
        <Section title={t('filter.period')}>
          <View style={styles.wrap}>
            {PERIODS.map((p) => (
              <Chip key={p} label={t(PERIOD_KEYS[p])} selected={filters.period === p} onPress={() => setPeriod(filters.period === p ? null : p)} />
            ))}
          </View>
        </Section>

        <Section title={t('filter.months')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {months.map((ym) => (
              <MonthCard key={ym} ym={ym} active={filters.month === ym} onPress={() => setMonth(filters.month === ym ? null : ym)} />
            ))}
          </ScrollView>
        </Section>

        <Section title={t('filter.exactPeriod')}>
          <RangeCalendar range={filters.range} month={filters.month || (filters.period ? monthKey() : null)} onChange={setRange} />
        </Section>

        <Section title={t('filter.accounts')} legend>
          <View style={styles.wrap}>
            {accounts.map((a) => (
              <TriChip
                key={a.id}
                label={a.name}
                state={triState(filters.accounts, a.id)}
                onPress={() => cycleAccount(a.id)}
                leading={
                  <LogoTile
                    operatorId={a.operator_id}
                    name={a.name}
                    color={a.color}
                    icon={a.type === 'PHYSICAL' ? 'cash-outline' : undefined}
                    size={20}
                  />
                }
              />
            ))}
          </View>
        </Section>

        <Section title={t('filter.type')}>
          <View style={[styles.seg, { borderColor: colors.line }]}>
            {TYPES.map((o, i) => {
              const on = filters.type === o.value
              return (
                <Pressable
                  key={o.key}
                  onPress={() => (o.value === null ? setType(null) : toggleType(o.value))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.segItem,
                    i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line },
                    on && { backgroundColor: colors.primarySoft },
                  ]}
                >
                  <Text numberOfLines={1} style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 13, color: on ? colors.ink : colors.content }}>
                    {t(o.key)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Section>

        <Section title={t('filter.categories')} legend>
          <View style={styles.wrap}>
            <TriChip label={t('filter.noCategory')} state={triState(filters.categories, 'none')} onPress={() => cycleCategory('none')} />
            {categories.map((c) => (
              <TriChip
                key={c.id}
                label={c.name}
                state={triState(filters.categories, c.id)}
                onPress={() => cycleCategory(c.id)}
                leading={<CategoryIcon icon={c.icon} name={c.name} color={c.color} size={20} />}
              />
            ))}
          </View>
        </Section>
      </ScrollView>

      <View style={[styles.foot, { backgroundColor: colors.surface, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable onPress={resetFilters} accessibilityRole="button" style={[styles.btn, { flex: 1 }]}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{t('common.reset')}</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.btn, { flex: 1.5, backgroundColor: pressed ? colors.primary600 : colors.primary }]}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primaryInk }}>{t('filter.apply')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  mini: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 6, paddingRight: 8, borderRadius: 6 },
  mcard: { minWidth: 104, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.xl, gap: 2 },
  cal: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12, borderRadius: 20 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, paddingLeft: 8, paddingRight: 4 },
  nav: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  seg: { height: 40, borderRadius: 20, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  btn: { height: 52, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
})
