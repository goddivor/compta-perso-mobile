// Language sub-screen (from Settings): pick System / Français / English.
// The choice is applied immediately and persisted (AsyncStorage).
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { useI18n } from '../i18n'

export default function LanguageScreen() {
  const { colors } = useTheme()
  const { language, setLanguage, t } = useI18n()

  const OPTIONS = [
    { value: 'system', label: t('language.system'), sublabel: t('language.systemSub'), icon: 'phone-portrait-outline' },
    { value: 'fr', label: t('language.fr'), sublabel: 'Français', icon: 'globe-outline' },
    { value: 'en', label: t('language.en'), sublabel: 'English', icon: 'globe-outline' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <View style={{ padding: 20 }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {OPTIONS.map((o, i) => {
            const selected = language === o.value
            return (
              <View key={o.value}>
                {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 62 }} /> : null}
                <Pressable
                  onPress={() => setLanguage(o.value)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: selected ? colors.primary : colors.surface2 }]}>
                    <Ionicons name={o.icon} size={17} color={selected ? colors.primaryInk : colors.content} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 14.5, color: colors.ink }}>
                      {o.label}
                    </Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted }}>{o.sublabel}</Text>
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
