// An amount, always through fmtParts() (same figures as fmt()). type
// 'DEBIT' → red with "−", 'CREDIT' → green with "+", none → a balance in
// ink (a negative balance gets "−"). The currency is a quieter suffix.
// Respects the "hide amounts" switch (PrivacyContext).
import { memo } from 'react'
import { Text } from 'react-native'
import { useTheme, fonts } from '../../theme/tokens'
import { fmtParts } from '../../utils/format'
import { usePrivacy } from '../../context/PrivacyContext'

const MASK = '••••'

export const Amount = memo(function Amount({ value, type, size = 15, weight = 'semibold', currency = true, color, style, numberOfLines = 1 }) {
  const { colors } = useTheme()
  const { hidden } = usePrivacy()
  const { sign, number, currency: cur } = fmtParts(value, type)
  const tone = color ?? (type === 'DEBIT' ? colors.danger : type === 'CREDIT' ? colors.success : colors.ink)
  const signed = type === 'DEBIT' || type === 'CREDIT'
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: fonts[weight] || fonts.semibold, fontSize: size, color: tone, letterSpacing: -0.15 }, style]}>
      {hidden ? MASK : sign + number}
      {currency ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: Math.round(size * 0.72), color: signed || color ? tone : colors.muted, opacity: signed ? 0.8 : 1, letterSpacing: 0 }}>
          {' ' + cur}
        </Text>
      ) : null}
    </Text>
  )
})
