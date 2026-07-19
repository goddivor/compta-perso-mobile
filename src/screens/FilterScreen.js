// Full-screen transactions filter ("Filtrer l'historique").
// Works on a local DRAFT initialized from the shared FiltersContext:
// nothing is applied until the bottom CTA is pressed. Offers quick ranges,
// previous-month cards, a home-made inline range calendar (pure JS Date),
// and single-choice chips for account / type / category.
import { useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { Button, Dot } from '../components/ui'
import { useFilters, emptyFilters } from '../context/FiltersContext'
import { listAccounts, listCategories } from '../db/database'
import { monthName, weekdayInitials } from '../utils/format'
import { useT } from '../i18n'

/* ----------------------------- Date helpers ----------------------------- */

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/* ------------------------------ Small chip ------------------------------ */

function Chip({ label, active, onPress, dotColor }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.line,
        },
      ]}
    >
      {dotColor ? <Dot color={dotColor} size={9} /> : null}
      <Text
        numberOfLines={1}
        style={{
          fontFamily: active ? fonts.semibold : fonts.medium,
          fontSize: 13,
          color: active ? colors.primaryInk : colors.content,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function SectionLabel({ children }) {
  const { colors } = useTheme()
  return (
    <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink }}>{children}</Text>
  )
}

/* --------------------------- Range calendar ----------------------------- */
// Home-made monthly calendar with range selection (no external package).
// First tap = range start; second tap = range end; a tap before the start
// restarts the range from that day.

function RangeCalendar({ dateFrom, dateTo, onPickDay }) {
  const { colors } = useTheme()
  const [cursor, setCursor] = useState(() => {
    const base = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const weeks = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // Monday-first offset: getDay() is 0=Sunday
    const offset = (new Date(year, month, 1).getDay() + 6) % 7
    const cells = Array(offset).fill(null)
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(`${year}-${pad(month + 1)}-${pad(day)}`)
    }
    while (cells.length % 7 !== 0) cells.push(null)
    const rows = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [cursor])

  const rangeEnd = dateTo || dateFrom
  const inRange = (iso) => !!dateFrom && iso >= dateFrom && iso <= rangeEnd
  const isEdge = (iso) => iso === dateFrom || iso === rangeEnd

  return (
    <View style={[styles.calendar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {/* Month navigation */}
      <View style={styles.calHeader}>
        <Pressable
          hitSlop={8}
          onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          style={[styles.calNav, { backgroundColor: colors.surface2 }]}
        >
          <Ionicons name="chevron-back" size={17} color={colors.ink} />
        </Pressable>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
          {monthName(cursor.getMonth())} {cursor.getFullYear()}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          style={[styles.calNav, { backgroundColor: colors.surface2 }]}
        >
          <Ionicons name="chevron-forward" size={17} color={colors.ink} />
        </Pressable>
      </View>

      {/* Weekday headers, Monday first */}
      <View style={styles.calRow}>
        {weekdayInitials().map((w, i) => (
          <View key={i} style={styles.calCell}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>{w}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((iso, ci) => {
            if (!iso) return <View key={ci} style={styles.calCell} />
            const selected = inRange(iso)
            const edge = isEdge(iso)
            return (
              <Pressable key={ci} onPress={() => onPickDay(iso)} style={styles.calCell}>
                <View
                  style={[
                    styles.calDay,
                    selected && { backgroundColor: colors.primary },
                    edge && { borderWidth: 2, borderColor: colors.primary600 },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: edge ? fonts.bold : selected ? fonts.semibold : fonts.regular,
                      fontSize: 13,
                      color: selected ? colors.primaryInk : colors.content,
                    }}
                  >
                    {Number(iso.slice(8, 10))}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

/* -------------------------------- Screen -------------------------------- */

export default function FilterScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const insets = useSafeAreaInsets()
  const { filters, setFilters } = useFilters()

  // Local draft — applied only when the CTA is pressed
  const [draft, setDraft] = useState({ ...emptyFilters, ...filters })
  const patch = (p) => setDraft((d) => ({ ...d, ...p }))

  const accounts = useMemo(() => listAccounts(), [])
  const categories = useMemo(() => listCategories(), [])

  /* Quick ranges ("À partir") */
  const quickRanges = useMemo(() => {
    const today = new Date()
    const iso = toISO(today)
    return [
      { key: 'today', label: t('filter.today'), from: iso, to: iso },
      { key: '7d', label: t('filter.last7'), from: toISO(addDays(today, -6)), to: iso },
      { key: '30d', label: t('filter.last30'), from: toISO(addDays(today, -29)), to: iso },
    ]
  }, [t])

  /* Previous months ("D'un mois précédent") */
  const monthCards = useMemo(() => {
    const now = new Date()
    const cards = []
    for (let i = 1; i <= 4; i++) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      cards.push({
        key: toISO(first),
        month: monthName(first.getMonth()),
        year: first.getFullYear(),
        from: toISO(first),
        to: toISO(last),
      })
    }
    return cards
  }, [t])

  const isPeriod = (from, to) => draft.date_from === from && draft.date_to === to
  const setPeriod = (from, to) =>
    patch(isPeriod(from, to) ? { date_from: null, date_to: null } : { date_from: from, date_to: to })

  /* Calendar range logic */
  const onPickDay = (iso) => {
    if (!draft.date_from || draft.date_to) {
      // No range started, or a complete range exists: start a new one
      patch({ date_from: iso, date_to: null })
    } else if (iso < draft.date_from) {
      // Earlier than the start: restart from this day
      patch({ date_from: iso, date_to: null })
    } else {
      patch({ date_to: iso })
    }
  }

  const toggle = (field, value) => patch({ [field]: draft[field] === value ? null : value })

  const apply = () => {
    setFilters({ ...draft })
    navigation.goBack()
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 26 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, lineHeight: 36 }}>
          {t('filter.title')}
        </Text>

        {/* Quick ranges */}
        <View style={{ gap: 12 }}>
          <SectionLabel>{t('filter.from')}</SectionLabel>
          <View style={styles.chipRow}>
            {quickRanges.map((r) => (
              <Chip
                key={r.key}
                label={r.label}
                active={isPeriod(r.from, r.to)}
                onPress={() => setPeriod(r.from, r.to)}
              />
            ))}
          </View>
        </View>

        {/* Previous months */}
        <View style={{ gap: 12 }}>
          <SectionLabel>{t('filter.previousMonth')}</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {monthCards.map((m) => {
              const active = isPeriod(m.from, m.to)
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setPeriod(m.from, m.to)}
                  style={[
                    styles.monthCard,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary600 : colors.line,
                    },
                  ]}
                >
                  <Ionicons
                    name={active ? 'calendar' : 'calendar-outline'}
                    size={20}
                    color={active ? colors.primaryInk : colors.muted}
                  />
                  <Text
                    style={{
                      fontFamily: active ? fonts.bold : fonts.semibold,
                      fontSize: 14,
                      color: active ? colors.primaryInk : colors.ink,
                    }}
                  >
                    {m.month}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.regular,
                      fontSize: 12,
                      color: active ? colors.primaryInk : colors.muted,
                    }}
                  >
                    {m.year}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        {/* Inline range calendar */}
        <View style={{ gap: 12 }}>
          <SectionLabel>{t('filter.exactPeriod')}</SectionLabel>
          <RangeCalendar dateFrom={draft.date_from} dateTo={draft.date_to} onPickDay={onPickDay} />
        </View>

        {/* Account */}
        <View style={{ gap: 12 }}>
          <SectionLabel>{t('filter.account')}</SectionLabel>
          <View style={styles.chipRow}>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                dotColor={a.color}
                active={draft.account_id === a.id}
                onPress={() => toggle('account_id', a.id)}
              />
            ))}
            {accounts.length === 0 ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>
                {t('filter.noAccount')}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Type */}
        <View style={{ gap: 12 }}>
          <SectionLabel>{t('filter.type')}</SectionLabel>
          <View style={styles.chipRow}>
            <Chip label={t('filter.debit')} active={draft.type === 'DEBIT'} onPress={() => toggle('type', 'DEBIT')} />
            <Chip label={t('filter.credit')} active={draft.type === 'CREDIT'} onPress={() => toggle('type', 'CREDIT')} />
          </View>
        </View>

        {/* Category */}
        <View style={{ gap: 12 }}>
          <SectionLabel>{t('filter.category')}</SectionLabel>
          <View style={styles.chipRow}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                dotColor={c.color}
                active={draft.category_id === c.id}
                onPress={() => toggle('category_id', c.id)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.line,
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}
      >
        <Pressable onPress={() => setDraft({ ...emptyFilters })} hitSlop={6} style={{ alignSelf: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.muted }}>
            {t('common.reset')}
          </Text>
        </Pressable>
        <Button
          title={t('filter.apply')}
          onPress={apply}
          style={{ borderRadius: 24, minHeight: 54 }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 38,
  },
  monthCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 104,
    paddingVertical: 14,
    borderRadius: radius.xl,
    borderWidth: 1.5,
  },
  calendar: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calNav: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calRow: {
    flexDirection: 'row',
  },
  calCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  calDay: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
})
