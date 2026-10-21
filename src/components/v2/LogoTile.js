// Account / operator tile. With a registry operator: its SVG logo on the
// white tile, centred at 78 %, or filling the tile when the logo is drawn
// on its own coloured block (owner's rule). Without one (cash, custom
// account, logo not yet loaded or offline): a monogram or icon in the
// account colour on a tint of it. Radius = 28 % of the size.
import { memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SvgXml } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useLogo } from '../../registry'
import { withAlpha } from '../../utils/color'

export const LogoTile = memo(function LogoTile({ operatorId, name, color, icon, size = 40, style }) {
  const { colors } = useTheme()
  const { data: logo } = useLogo(operatorId || null)
  const r = Math.round(size * 0.28)
  const box = { width: size, height: size, borderRadius: r }

  const mono = (
    <View style={[styles.tile, box, { backgroundColor: colors.surface }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(color || colors.muted, 0.18) }]} />
      {icon ? (
        <Ionicons name={icon} size={Math.round(size * 0.55)} color={color || colors.muted} />
      ) : (
        <Text style={{ fontFamily: fonts.bold, fontSize: Math.max(8, Math.round(size * 0.42)), color: color || colors.muted, includeFontPadding: false }}>
          {String(name || '?').trim().charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  )
  if (!logo?.xml) return mono

  const { mode, bg } = logo.layout
  const tileBg = logo.background === 'dark' ? colors.logoTileDark : mode === 'band' && bg ? bg : colors.logoTile
  const inner = mode === 'center' ? Math.round(size * 0.78) : size
  return (
    <View style={[styles.tile, box, { backgroundColor: tileBg }, style]}>
      <SvgXml
        xml={logo.xml}
        width={inner}
        height={inner}
        preserveAspectRatio={mode === 'fill' ? 'xMidYMid slice' : 'xMidYMid meet'}
        fallback={null}
        onError={(e) => console.warn('logo render failed', operatorId, e?.message)}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 1, borderColor: colors.logoTileEdge }]} />
    </View>
  )
})

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
