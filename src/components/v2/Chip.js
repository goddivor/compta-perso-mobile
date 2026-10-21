// Filter / suggestion chip (Material 3): 32 dp, radius 8. Selected = yellow
// tint with a check; `leading` (a LogoTile, CategoryIcon…) shows otherwise.
import { Pressable, Text, View, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'

export function Chip({ label, selected = false, onPress, leading, style }) {
  const { colors } = useTheme()
  const lead = selected ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : leading
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        chipStyles.chip,
        { paddingLeft: lead ? 8 : 12 },
        selected
          ? { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }
          : { backgroundColor: pressed ? colors.surface2 : 'transparent', borderColor: colors.line },
        style,
      ]}
    >
      {lead ? <View>{lead}</View> : null}
      <Text numberOfLines={1} style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 13, color: selected ? colors.ink : colors.content }}>
        {label}
      </Text>
    </Pressable>
  )
}

// Shared chip box (also used by TriChip)
export const chipStyles = StyleSheet.create({
  chip: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 12, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
})
