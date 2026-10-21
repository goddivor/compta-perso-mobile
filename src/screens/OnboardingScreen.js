// Onboarding (stub): opened over the tabs on launch while the profile has
// no currency. Route params: { withAccountStep } (true when no account
// exists: 3 steps, else 2). The onboarding unit replaces this file; when
// done it calls setProfile() then navigation.reset to 'Tabs'.
import { View, Text } from 'react-native'
import { useTheme, fonts } from '../theme/tokens'
import { useT } from '../i18n'

export default function OnboardingScreen() {
  const { colors } = useTheme()
  const t = useT()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.ink }}>{t('onboarding.title')}</Text>
    </View>
  )
}
