// Round country flag from the registry (square SVG), with a hairline ring.
// Blank disc while loading or offline.
import { memo } from 'react'
import { View, StyleSheet } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { useTheme } from '../../theme/tokens'
import { useSvg } from '../../registry'

export const Flag = memo(function Flag({ iso2, size = 20, style }) {
  const { colors } = useTheme()
  const { data: xml } = useSvg(iso2 ? `svg/flags/1x1/${String(iso2).toLowerCase()}.svg` : null)
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2 }, style]}>
      {xml ? <SvgXml xml={xml} width={size} height={size} fallback={null} onError={(e) => console.warn('flag render failed', iso2, e?.message)} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 1, borderColor: colors.line }]} />
    </View>
  )
})

const styles = StyleSheet.create({
  disc: { overflow: 'hidden' },
})
