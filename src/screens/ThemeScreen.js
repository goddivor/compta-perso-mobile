// Theme sub-screen (from Settings): System / Light / Dark as a radio list.
// The choice overrides the phone scheme and is persisted (AsyncStorage).
// Only "System" carries a sub-title.
import { Fragment } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../theme/tokens'
import { useT } from '../i18n'
import { RadioRow, RowSeparator, SectionCard } from '../components/SettingsRow'

export default function ThemeScreen() {
  const { colors, mode, setMode } = useTheme()
  const t = useT()

  const MODES = [
    { value: 'system', icon: 'phone-portrait-outline', sub: t('theme.systemSub') },
    { value: 'light', icon: 'sunny-outline' },
    { value: 'dark', icon: 'moon-outline' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <SectionCard title={t('theme.heading')}>
          {MODES.map((m, i) => (
            <Fragment key={m.value}>
              {i > 0 ? <RowSeparator /> : null}
              <RadioRow
                icon={m.icon}
                title={t(`theme.${m.value}`)}
                subtitle={m.sub}
                selected={mode === m.value}
                onPress={() => setMode(m.value)}
              />
            </Fragment>
          ))}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  )
}
