// Home-made calendar date picker, presented as a bottom sheet modal.
// No external dependency: plain JS Date + theme tokens (light/dark aware).
// API: <DatePickerSheet visible date onClose onSelect />
//  - `date` (string 'YYYY-MM-DD') is the currently selected day
//  - `onSelect(day)` receives the confirmed day as 'YYYY-MM-DD'
//  - `onClose()` is called on backdrop tap / hardware back
import { useEffect, useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, radius, fonts, shadowOverlay } from '../theme/tokens'
import { Button } from './ui'

const pad = (x) => String(x).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

// Week starts on Monday (fr-FR)
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function parseISO(s) {
  const d = new Date(String(s || '').slice(0, 10) + 'T00:00:00')
  return isNaN(d.getTime()) ? new Date() : d
}

// Build the cells of the month grid: leading blanks (Monday-first) + days
function monthCells(year, month) {
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function DatePickerSheet({ visible, date, onClose, onSelect }) {
  const { colors } = useTheme()
  const [pending, setPending] = useState(date)
  const [view, setView] = useState(() => {
    const d = parseISO(date)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

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

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })

  const cells = monthCells(view.year, view.month)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, shadowOverlay, { backgroundColor: colors.surface, borderColor: colors.line }]}
          onPress={() => {}}
        >
          {/* Header: month navigation */}
          <View style={styles.header}>
            <Pressable
              onPress={() => goMonth(-1)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: pressed ? colors.surface2 : 'transparent', borderColor: colors.line },
              ]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, textTransform: 'capitalize' }}>
              {monthLabel}
            </Text>
            <Pressable
              onPress={() => goMonth(1)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: pressed ? colors.surface2 : 'transparent', borderColor: colors.line },
              ]}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
          </View>

          {/* Weekday headers (Monday first) */}
          <View style={styles.grid}>
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={styles.cell}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.muted }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day == null) return <View key={i} style={styles.cell} />
              const iso = toISO(view.year, view.month, day)
              const selected = iso === pending
              const isToday = iso === todayISO
              return (
                <View key={i} style={styles.cell}>
                  <Pressable
                    onPress={() => setPending(iso)}
                    style={({ pressed }) => [
                      styles.day,
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

          <Button title="Valider" onPress={() => onSelect(pending)} style={{ marginTop: 14 }} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
