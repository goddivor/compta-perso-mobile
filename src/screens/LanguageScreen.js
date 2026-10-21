// Language sub-screen (from Settings): System / Français / English as a radio
// list, each language written in its own language. Applied immediately and
// persisted (AsyncStorage). No intro text.
import { Fragment } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../theme/tokens'
import { useI18n } from '../i18n'
import { RadioRow, RowSeparator, SectionCard } from '../components/SettingsRow'

export default function LanguageScreen() {
  const { colors } = useTheme()
  const { language, setLanguage, t } = useI18n()

  const OPTIONS = [
    { value: 'system', icon: 'phone-portrait-outline', sub: t('language.systemSub') },
    { value: 'fr', icon: 'language-outline' },
    { value: 'en', icon: 'language-outline' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <SectionCard title={t('language.heading')}>
          {OPTIONS.map((o, i) => (
            <Fragment key={o.value}>
              {i > 0 ? <RowSeparator /> : null}
              <RadioRow
                icon={o.icon}
                title={t(`language.${o.value}`)}
                subtitle={o.sub}
                selected={language === o.value}
                onPress={() => setLanguage(o.value)}
              />
            </Fragment>
          ))}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  )
}
