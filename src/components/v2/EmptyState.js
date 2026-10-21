// Empty / no-result state: icon tile + one short title (+ optional action),
// centred in the free space of the screen and above the keyboard when it is
// open. Never in a card. In a FlatList, pass it as ListEmptyComponent and
// give the list contentContainerStyle={{ flexGrow: 1 }}.
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight'

// action: { label, onPress, icon?, variant?: 'primary' | 'tonal', busy? }
// busy: spinner in place of the icon, button disabled (no press)
export function EmptyState({ icon = 'file-tray-outline', title, action, style }) {
  const { colors } = useTheme()
  const kbd = useKeyboardHeight()
  const tonal = action?.variant === 'tonal'
  const busy = !!action?.busy
  const fg = tonal ? colors.ink : colors.primaryInk
  return (
    <View style={[styles.wrap, { paddingBottom: kbd }, style]}>
      <View style={[styles.ill, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={30} color={colors.muted} />
      </View>
      {title ? <Text style={[styles.title, { color: colors.ink }]}>{title}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: tonal ? colors.surface2 : pressed && !busy ? colors.primary600 : colors.primary },
            busy && styles.btnBusy,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={fg} />
          ) : action.icon ? (
            <Ionicons name={action.icon} size={20} color={fg} />
          ) : null}
          <Text style={[styles.btnText, { color: fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, minHeight: 200 },
  ill: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 16, textAlign: 'center' },
  btn: { marginTop: 16, height: 44, borderRadius: 22, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnBusy: { opacity: 0.7 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15 },
})
