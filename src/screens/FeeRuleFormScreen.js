// Fee rule form (stub). Route params: { accountId, ruleId? } (ruleId absent
// = new rule). The fee rules unit replaces this file.
import { View, Text } from 'react-native'
import { useTheme, fonts } from '../theme/tokens'
import { useT } from '../i18n'

export default function FeeRuleFormScreen() {
  const { colors } = useTheme()
  const t = useT()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: colors.ink }}>{t('nav.feeRule')}</Text>
    </View>
  )
}
