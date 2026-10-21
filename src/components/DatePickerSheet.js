// Home-made calendar date picker, presented as a bottom sheet modal.
// No external dependency: plain JS Date + theme tokens (light/dark aware).
// API: <DatePickerSheet visible date onClose onSelect />
//  - `date` (string 'YYYY-MM-DD') is the currently selected day
//  - `onSelect(day)` receives the confirmed day as 'YYYY-MM-DD'
//  - `onClose()` is called on backdrop tap / hardware back
// Grid: rows of exactly 7 cells, each an INTEGER width measured with
// onLayout (a percentage width rounds up and wraps to 6 per row).
import { useEffect, useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, radius, fonts } from '../theme/tokens'
import { weekdayInitials } from '../utils/format'
import { useI18n } from '../i18n'

const PAD = 20 // horizontal padding of the sheet
const pad = (x) => String(x).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function parseISO(s) {
  const d = new Date(String(s || '').slice(0, 10) + 'T00:00:00')
  return isNaN(d.getTime()) ? new Date() : d
}

// Month grid as rows of 7 (Monday first): null = blank, number = day
function monthRows(year, month) {
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const rows = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

export default function DatePickerSheet({ visible, date, onClose, onSelect }) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const { width: winW } = useWindowDimensions()
  const [pending, setPending] = useState(date)
  const [view, setView] = useState(() => {
    const d = parseISO(date)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  // Width of the grid area, measured; the window width is the first guess
  const [gridW, setGridW] = useState(Math.floor(winW - PAD * 2))
  const cellW = Math.max(1, Math.floor(gridW / 7))
  const dayD = Math.min(40, cellW - 2)

  // Re-sync the sheet with the incoming value every time it opens
  useEffect(() => {
    if (!visible) return
    const d = parseISO(date)
    setPending(toISO(d.getFullYear(), d.getMonth(), d.getDate()))
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }, [visible, date])

  const goMonth = (delta) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const now = new Date()
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate())

  const monthLabel = cap(new Date(view.year, view.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }))
  const headLabel = cap(parseISO(pending).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }))
  const rows = monthRows(view.year, view.month)

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.grab, { backgroundColor: colors.line }]} />
          <Text style={[styles.eyebrow, { color: colors.muted }]}>{t('form.date')}</Text>
          <Text style={[styles.head, { color: colors.ink }]}>{headLabel}</Text>

          {/* Month navigation */}
          <View style={styles.monthRow}>
            <Text style={[styles.month, { color: colors.ink }]}>{monthLabel}</Text>
            <View style={styles.nav}>
              <Pressable
                onPress={() => goMonth(-1)}
                hitSlop={6}
                accessibilityRole="button"
                style={({ pressed }) => [styles.navBtn, { backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Pressable
                onPress={() => goMonth(1)}
                hitSlop={6}
                accessibilityRole="button"
                style={({ pressed }) => [styles.navBtn, { backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
              >
                <Ionicons name="chevron-forward" size={22} color={colors.ink} />
              </Pressable>
            </View>
          </View>

          {/* Grid: 7 integer-width columns */}
          <View onLayout={(e) => setGridW(Math.floor(e.nativeEvent.layout.width))}>
            <View style={[styles.row, { width: cellW * 7 }]}>
              {weekdayInitials().map((w, i) => (
                <View key={i} style={[styles.cell, { width: cellW }]}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>{w}</Text>
                </View>
              ))}
            </View>
            {rows.map((row, r) => (
              <View key={r} style={[styles.row, { width: cellW * 7 }]}>
                {row.map((day, i) => {
                  if (day == null) return <View key={i} style={[styles.cell, { width: cellW }]} />
                  const iso = toISO(view.year, view.month, day)
                  const selected = iso === pending
                  const isToday = iso === todayISO
                  return (
                    <View key={i} style={[styles.cell, { width: cellW }]}>
                      <Pressable
                        onPress={() => setPending(iso)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          { width: dayD, height: dayD, borderRadius: dayD / 2, alignItems: 'center', justifyContent: 'center' },
                          selected
                            ? { backgroundColor: colors.primary }
                            : isToday
                              ? { borderWidth: 1, borderColor: colors.faint }
                              : pressed
                                ? { backgroundColor: colors.surface2 }
                                : null,
                        ]}
                      >
                        <Text
                          style={{
                            fontFamily: selected ? fonts.semibold : fonts.regular,
                            fontSize: 14,
                            color: selected ? colors.primaryInk : colors.ink,
                          }}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            ))}
          </View>

          <View style={styles.acts}>
            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.act, pressed && { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.actText, { color: colors.ink }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable onPress={() => onSelect(pending)} accessibilityRole="button" style={({ pressed }) => [styles.act, { backgroundColor: pressed ? colors.primary600 : colors.primary }]}>
              <Text style={[styles.actText, { color: colors.primaryInk }]}>{t('form.dateOk')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: PAD,
    paddingTop: 10,
    paddingBottom: 24,
  },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 16 },
  eyebrow: { fontFamily: fonts.medium, fontSize: 13 },
  head: { fontFamily: fonts.semibold, fontSize: 24, marginTop: 2, marginBottom: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  month: { fontFamily: fonts.semibold, fontSize: 15 },
  nav: { flexDirection: 'row', gap: 4 },
  navBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignSelf: 'center' },
  cell: { height: 42, alignItems: 'center', justifyContent: 'center' },
  acts: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  act: { height: 44, minWidth: 64, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actText: { fontFamily: fonts.semibold, fontSize: 14 },
})
