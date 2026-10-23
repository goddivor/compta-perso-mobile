// An amount, always through fmtParts() (same text as fmt() / fmtSigned()).
// type 'DEBIT' → red with "−", 'CREDIT' → green with "+", none → a balance
// in ink (a negative balance gets "−"). The sign leads the whole amount; the
// currency symbol is quieter and sits on the side the profile country's
// amount format gives it, with the format's own spacing ("₦2,000",
// "2 000 FCFA"). Re-rendered when the format changes (CurrencyContext).
// Respects the "hide amounts" switch (PrivacyContext).
import { memo } from 'react'
import { Text } from 'react-native'
import { useTheme, fonts } from '../../theme/tokens'
import { fmtParts } from '../../utils/format'
import { usePrivacy } from '../../context/PrivacyContext'
import { useAmountFormat } from '../../context/CurrencyContext'

const MASK = '••••'

export const Amount = memo(function Amount({ value, type, size = 15, weight = 'semibold', currency = true, color, style, numberOfLines = 1 }) {
  const { colors } = useTheme()
  const { hidden } = usePrivacy()
  useAmountFormat() // re-render on a format change
  const { sign, before, number, after } = fmtParts(value, type)
  const tone = color ?? (type === 'DEBIT' ? colors.danger : type === 'CREDIT' ? colors.success : colors.ink)
  const signed = type === 'DEBIT' || type === 'CREDIT'
  const curStyle = { fontFamily: fonts.medium, fontSize: Math.round(size * 0.72), color: signed || color ? tone : colors.muted, opacity: signed ? 0.8 : 1, letterSpacing: 0 }
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: fonts[weight] || fonts.semibold, fontSize: size, color: tone, letterSpacing: -0.15 }, style]}>
      {hidden ? null : sign}
      {currency && before ? <Text style={curStyle}>{before}</Text> : null}
      {hidden ? MASK : number}
      {currency && after ? <Text style={curStyle}>{after}</Text> : null}
    </Text>
  )
})
