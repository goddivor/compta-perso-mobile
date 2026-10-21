// Category avatar: its Ionicons icon (or initial when it has none) in the
// category colour on a tint of it, in a circle. transfer = the blue swap
// avatar used for transfers.
import { memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { withAlpha } from '../../utils/color'

const hasIcon = (name) => !!name && Object.prototype.hasOwnProperty.call(Ionicons.glyphMap || {}, name)

export const CategoryIcon = memo(function CategoryIcon({ icon, name, color, size = 40, transfer = false, style }) {
  const { colors } = useTheme()
  const c = transfer ? colors.link : color || colors.muted
  const glyph = transfer ? 'swap-horizontal' : hasIcon(icon) ? icon : null
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: withAlpha(c, 0.16) }]} />
      {glyph ? (
        <Ionicons name={glyph} size={Math.round(size * 0.5)} color={c} />
      ) : (
        <Text style={{ fontFamily: fonts.bold, fontSize: Math.round(size * 0.4), color: c, includeFontPadding: false }}>
          {String(name || '?').trim().charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
