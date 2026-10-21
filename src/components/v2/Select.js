// Select field: a 56 dp field showing the chosen option, opening a menu
// anchored under it (above it when there is no room below). Used for the
// category of a transaction and any short list.
// options: [{ value, label, leading?: ReactNode }]
import { useRef, useState } from 'react'
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, shadowOverlay } from '../../theme/tokens'
import { useT } from '../../i18n'

const MENU_MAX = 344
const ROW = 42

export function Select({ label, value, options = [], onChange, placeholder, placeholderLeading, disabled = false, style }) {
  const { colors } = useTheme()
  const t = useT()
  const { height: winH } = useWindowDimensions()
  const ref = useRef(null)
  const [anchor, setAnchor] = useState(null) // { x, y, w, h } while open
  const current = options.find((o) => String(o.value) === String(value))

  const open = () => {
    if (disabled || !ref.current) return
    ref.current.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }))
  }
  const close = () => setAnchor(null)
  const pick = (v) => { close(); onChange?.(v) }

  const menuH = Math.min(MENU_MAX, options.length * ROW + 12)
  const below = anchor && anchor.y + anchor.h + 4 + menuH <= winH - 16
  const menuPos = anchor && (below ? { top: anchor.y + anchor.h + 4 } : { top: Math.max(16, anchor.y - 4 - menuH) })

  return (
    <View style={style}>
      {label ? <Text style={[styles.label, { color: colors.muted }]}>{label}</Text> : null}
      <Pressable
        ref={ref}
        onPress={open}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.field,
          { backgroundColor: colors.surface, borderColor: anchor ? colors.primary600 : colors.line, borderWidth: anchor ? 2 : 1, paddingHorizontal: anchor ? 15 : 16, opacity: disabled ? 0.45 : 1 },
        ]}
      >
        {current?.leading ?? placeholderLeading ?? null}
        <Text numberOfLines={1} style={[styles.value, { color: current ? colors.ink : colors.faint }]}>
          {current ? current.label : placeholder ?? t('common.select')}
        </Text>
        <Ionicons name={anchor ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
      </Pressable>

      <Modal visible={!!anchor} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('common.close')} />
        {anchor ? (
          <View style={[styles.menu, shadowOverlay, { left: anchor.x, width: anchor.w, maxHeight: MENU_MAX, backgroundColor: colors.surface2 }, menuPos]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {options.map((o) => {
                const on = String(o.value) === String(value)
                return (
                  <Pressable
                    key={String(o.value)}
                    onPress={() => pick(o.value)}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.row, { backgroundColor: on ? colors.primarySoft : pressed ? colors.line : 'transparent' }]}
                  >
                    {o.leading ?? null}
                    <Text numberOfLines={1} style={[styles.rowText, { color: colors.ink, fontFamily: on ? fonts.semibold : fonts.regular }]}>{o.label}</Text>
                    {on ? <Ionicons name="checkmark" size={18} color={colors.ink} /> : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: 13, marginLeft: 4, marginBottom: 6 },
  field: { minHeight: 56, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { flex: 1, fontFamily: fonts.medium, fontSize: 16 },
  menu: { position: 'absolute', borderRadius: 16, paddingVertical: 6, overflow: 'hidden' },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  rowText: { flex: 1, fontSize: 15 },
})
