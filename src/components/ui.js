// Home-made UI kit styled with the Goodness tokens (no external UI lib).
import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, radius, fonts, shadowCard, shadowOverlay } from '../theme/tokens'

/* -------------------------------- Card --------------------------------- */

export function Card({ children, style }) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
        shadowCard,
        style,
      ]}
    >
      {children}
    </View>
  )
}

/* ------------------------------- Button -------------------------------- */

export function Button({ title, onPress, variant = 'primary', disabled, loading, style, icon }) {
  const { colors } = useTheme()
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryInk, border: colors.primary },
    secondary: { bg: colors.surface2, fg: colors.ink, border: colors.line },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant]

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed && variant === 'primary' ? colors.primary600 : palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {icon ? <Ionicons name={icon} size={17} color={palette.fg} /> : null}
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: palette.fg }}>{title}</Text>
        </View>
      )}
    </Pressable>
  )
}

/* ------------------------------- Fields -------------------------------- */

export function Field({ label, children, style }) {
  const { colors } = useTheme()
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }}>{label}</Text>
      {children}
    </View>
  )
}

export function Input({ style, multiline, ...props }) {
  const { colors } = useTheme()
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      multiline={multiline}
      style={[
        styles.input,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          color: colors.ink,
          height: multiline ? 84 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
          paddingTop: multiline ? 12 : 0,
        },
        style,
      ]}
      {...props}
    />
  )
}

/* --------------------------- Select (bottom sheet) ---------------------- */
// options: [{ label, value, color?, sublabel? }]
export function Select({ value, options, onChange, placeholder = '— Choisir —' }) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  const current = options.find((o) => String(o.value) === String(value))

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.input, styles.selectTrigger, { backgroundColor: colors.surface, borderColor: colors.line }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {current?.color ? <View style={[styles.dot, { backgroundColor: current.color }]} /> : null}
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.medium, fontSize: 14, color: current ? colors.ink : colors.faint, flex: 1 }}
          >
            {current ? current.label : placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              shadowOverlay,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}
            onPress={() => {}}
          >
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => {
                const selected = String(item.value) === String(value)
                return (
                  <Pressable
                    onPress={() => { onChange(item.value); setOpen(false) }}
                    style={({ pressed }) => [
                      styles.option,
                      { backgroundColor: selected ? colors.surface2 : pressed ? colors.surface2 : 'transparent' },
                    ]}
                  >
                    {item.color ? <View style={[styles.dot, { backgroundColor: item.color }]} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: selected ? fonts.semibold : fonts.regular, fontSize: 14, color: colors.ink }}>
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>{item.sublabel}</Text>
                      ) : null}
                    </View>
                    {selected ? <Ionicons name="checkmark" size={17} color={colors.ink} /> : null}
                  </Pressable>
                )
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

/* --------------------------- Segmented control -------------------------- */
// segments: [{ label, value }]
export function Segmented({ segments, value, onChange }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
      {segments.map((s) => {
        const active = s.value === value
        return (
          <Pressable
            key={String(s.value)}
            onPress={() => onChange(s.value)}
            style={[
              styles.segment,
              active && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={{
                fontFamily: active ? fonts.semibold : fonts.medium,
                fontSize: 13,
                color: active ? colors.primaryInk : colors.content,
              }}
            >
              {s.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ------------------------------ Small bits ------------------------------ */

export function Dot({ color, size = 10 }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
}

export function Badge({ label, color }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
      <Dot color={color || colors.faint} size={7} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.content }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export function EmptyState({ icon = 'file-tray-outline', text }) {
  const { colors } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
      <Ionicons name={icon} size={34} color={colors.faint} />
      <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  )
}

export function SectionTitle({ children, style }) {
  const { colors } = useTheme()
  return (
    <Text style={[{ fontFamily: fonts.bold, fontSize: 18, color: colors.ink }, style]}>{children}</Text>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: 10,
    paddingBottom: 26,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
