// Empty / no-result state: icon tile + one short title (+ optional action),
// centred in the free space of the screen and above the keyboard when it is
// open. Never in a card. In a FlatList, pass it as ListEmptyComponent and
// give the list contentContainerStyle={{ flexGrow: 1 }}.
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight'

// action: { label, onPress, icon?, variant?: 'primary' | 'tonal' }
export function EmptyState({ icon = 'file-tray-outline', title, action, style }) {
  const { colors } = useTheme()
  const kbd = useKeyboardHeight()
  const tonal = action?.variant === 'tonal'
  return (
    <View style={[styles.wrap, { paddingBottom: kbd }, style]}>
      <View style={[styles.ill, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={30} color={colors.muted} />
      </View>
      {title ? <Text style={[styles.title, { color: colors.ink }]}>{title}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: tonal ? colors.surface2 : pressed ? colors.primary600 : colors.primary },
          ]}
        >
          {action.icon ? <Ionicons name={action.icon} size={20} color={tonal ? colors.ink : colors.primaryInk} /> : null}
          <Text style={[styles.btnText, { color: tonal ? colors.ink : colors.primaryInk }]}>{action.label}</Text>
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
  btnText: { fontFamily: fonts.semibold, fontSize: 15 },
})
