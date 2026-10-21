// Three-state filter chip for accounts and categories. Each tap cycles
// neutral → included (yellow, ✓) → excluded (red, ⊖) → neutral; the parent
// owns the state (FiltersContext cycleAccount / cycleCategory).
import { Pressable, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useT } from '../../i18n'
import { chipStyles } from './Chip'

// state: 'neutral' | 'include' | 'exclude'; leading shows in the neutral state
export function TriChip({ label, state = 'neutral', onPress, leading, style }) {
  const { colors } = useTheme()
  const t = useT()
  const look = {
    neutral: { bg: 'transparent', border: colors.line, fg: colors.content, font: fonts.medium, lead: leading },
    include: { bg: colors.primarySoft, border: colors.primarySoft, fg: colors.ink, font: fonts.semibold, lead: <Ionicons name="checkmark" size={16} color={colors.ink} /> },
    exclude: { bg: colors.dangerSoft, border: colors.dangerSoft, fg: colors.danger, font: fonts.semibold, lead: <Ionicons name="remove-circle" size={16} color={colors.danger} /> },
  }[state] || {}
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={state === 'neutral' ? label : `${label}, ${t(state === 'include' ? 'common.included' : 'common.excluded')}`}
      style={({ pressed }) => [
        chipStyles.chip,
        { paddingLeft: look.lead ? 8 : 12, borderColor: look.border, backgroundColor: state === 'neutral' && pressed ? colors.surface2 : look.bg },
        style,
      ]}
    >
      {look.lead ? <View>{look.lead}</View> : null}
      <Text numberOfLines={1} style={{ fontFamily: look.font, fontSize: 13, color: look.fg }}>{label}</Text>
    </Pressable>
  )
}
