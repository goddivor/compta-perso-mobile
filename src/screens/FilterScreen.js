// Full-screen transactions filter ("Filtrer l'historique") — stub, being implemented.
import { View, Text } from 'react-native'
import { useTheme, fonts } from '../theme/tokens'

export default function FilterScreen() {
  const { colors } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ fontFamily: fonts.medium, color: colors.muted }}>Filtres…</Text>
    </View>
  )
}
