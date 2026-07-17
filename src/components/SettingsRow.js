// WhatsApp-style settings row: round colored icon on the left, title
// (+ optional subtitle), chevron on the right. Used inside rounded Cards
// with thin separators between rows.
import { memo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'

export const SettingsRow = memo(function SettingsRow({
  icon,
  iconBg,
  title,
  subtitle,
  onPress,
  onLongPress,
  right,
  chevron = true,
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
    </Pressable>
  )
})

export function RowSeparator() {
  const { colors } = useTheme()
  // Thin separator aligned after the round icon
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 62 }} />
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
