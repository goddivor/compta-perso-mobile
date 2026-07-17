// Theme sub-screen (from Settings): pick System / Light / Dark.
// The choice overrides the phone scheme and is persisted (AsyncStorage).
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'

const MODES = [
  { value: 'system', label: 'Système', sublabel: 'Suit le thème du téléphone', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Clair', sublabel: 'Toujours en mode clair', icon: 'sunny-outline' },
  { value: 'dark', label: 'Sombre', sublabel: 'Toujours en mode sombre', icon: 'moon-outline' },
]

export default function ThemeScreen() {
  const { colors, mode, setMode } = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <View style={{ padding: 20 }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {MODES.map((m, i) => {
            const selected = mode === m.value
            return (
              <View key={m.value}>
                {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 62 }} /> : null}
                <Pressable
                  onPress={() => setMode(m.value)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: selected ? colors.primary : colors.surface2 }]}>
                    <Ionicons name={m.icon} size={17} color={selected ? colors.primaryInk : colors.content} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 14.5, color: colors.ink }}>
                      {m.label}
                    </Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted }}>{m.sublabel}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.tabActive} /> : null}
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
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
