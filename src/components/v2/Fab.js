// Floating action button (Material 3): a bare "+" on the primary yellow,
// 56 dp, radius 16, bottom-right of its screen. The only way to add.
import { Pressable, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, shadowFab } from '../../theme/tokens'
import { useT } from '../../i18n'

export function Fab({ onPress, icon = 'add', accessibilityLabel, style }) {
  const { colors } = useTheme()
  const t = useT()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t('common.add')}
      hitSlop={4}
      style={({ pressed }) => [styles.fab, shadowFab, { backgroundColor: pressed ? colors.primary600 : colors.primary }, style]}
    >
      <Ionicons name={icon} size={26} color={colors.primaryInk} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
