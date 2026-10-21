// Numeric/text input with a quiet unit on its right ("FCFA", "%"), shared by
// the account and fee rule forms. Same box as the v1 Input.
import { View, Text, TextInput, StyleSheet } from 'react-native'
import { useTheme, fonts, radius } from '../theme/tokens'

export function SuffixInput({ suffix, style, inputStyle, ...props }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, { color: colors.ink }, inputStyle]}
        {...props}
      />
      {suffix ? <Text style={[styles.suffix, { color: colors.faint }]}>{suffix}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, paddingVertical: 0, minHeight: 46 },
  suffix: { fontFamily: fonts.medium, fontSize: 13 },
})
