// Currency sign from the registry (XOF: the BCEAO sawfish emblem). One
// colour (`color`, default ink) or, with colored, the issuer's colours when
// the registry has them. Falls back to the sign text ('F CFA', '₦').
import { memo } from 'react'
import { Text } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { useTheme, fonts } from '../../theme/tokens'
import { useCurrency, useSvg } from '../../registry'

export const CurrencySign = memo(function CurrencySign({ code, size = 24, color, colored = false, style }) {
  const { colors } = useTheme()
  const { data: cur } = useCurrency(code || null)
  const path = cur ? (colored && cur.sign?.svgColor) || cur.sign?.svg : null
  const { data: xml } = useSvg(path || null)
  const tint = color ?? colors.ink
  if (xml) {
    return <SvgXml xml={xml} width={size} height={size} color={tint} style={style} fallback={null} onError={(e) => console.warn('currency sign render failed', code, e?.message)} />
  }
  const text = cur?.sign?.text ?? code ?? ''
  return <Text style={[{ fontFamily: fonts.bold, fontSize: Math.round(size * 0.5), color: tint }, style]}>{text}</Text>
})
