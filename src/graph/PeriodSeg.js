// Segmented period button shared by Stats and Report (7 j / 30 j / Mois / Tout):
// 40 dp pill, hairline separators, the selected segment gets the soft yellow
// tint and a check. `options` = [{ value, label }].
import { memo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'

export const PeriodSeg = memo(function PeriodSeg({ options, value, onChange }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.wrap, { borderColor: colors.line }]}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              styles.seg,
              i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line },
              on && { backgroundColor: colors.primarySoft },
            ]}
          >
            {on ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
            <Text style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 13, color: on ? colors.ink : colors.content }}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', height: 40, marginHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, overflow: 'hidden' },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
})
