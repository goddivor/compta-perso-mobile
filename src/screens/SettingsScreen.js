// Settings hub, WhatsApp style: grouped rounded cards of rows, each row
// with a round colored icon, a title/subtitle and a chevron, opening a
// dedicated sub-screen (accounts, categories, cloud sync, theme).
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listAccounts, listCategories } from '../db/database'
import { getSyncConfig } from '../sync/api'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { SettingsRow, RowSeparator } from '../components/SettingsRow'

const MODE_LABELS = { system: 'Système', light: 'Clair', dark: 'Sombre' }

// Solid icon colors (WhatsApp style: colored circle + white pictogram),
// identical in light and dark
const ICON_COLORS = {
  accounts: '#3B82F6',
  categories: '#8B5CF6',
  sync: '#16A34A',
  theme: '#F59E0B',
}

function SectionCard({ title, children }) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>{children}</View>
    </View>
  )
}

export default function SettingsScreen({ navigation }) {
  const { colors, mode } = useTheme()
  const tick = useTick()
  const isFocused = useIsFocused()
  const [counts, setCounts] = useState({ accounts: 0, categories: 0 })
  const [syncCfg, setSyncCfg] = useState(null)

  useFocusData(() => {
    setCounts({ accounts: listAccounts().length, categories: listCategories().length })
  }, [tick])

  useEffect(() => {
    if (isFocused) getSyncConfig().then(setSyncCfg)
  }, [isFocused])

  const syncSubtitle = syncCfg
    ? syncCfg.api_url && syncCfg.token
      ? syncCfg.api_url.replace(/^https?:\/\//, '')
      : 'Non configurée'
    : '…'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 18 }}>
        <View style={styles.header}>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>Réglages</Text>
        </View>

        <SectionCard title="Données">
          <SettingsRow
            icon="wallet-outline"
            iconBg={ICON_COLORS.accounts}
            title="Comptes"
            subtitle={`${counts.accounts} compte${counts.accounts > 1 ? 's' : ''}`}
            onPress={() => navigation.navigate('AccountsList')}
          />
          <RowSeparator />
          <SettingsRow
            icon="pricetags-outline"
            iconBg={ICON_COLORS.categories}
            title="Catégories"
            subtitle={`${counts.categories} catégorie${counts.categories > 1 ? 's' : ''}`}
            onPress={() => navigation.navigate('Categories')}
          />
        </SectionCard>

        <SectionCard title="Application">
          <SettingsRow
            icon="cloud-outline"
            iconBg={ICON_COLORS.sync}
            title="Synchronisation cloud"
            subtitle={syncSubtitle}
            onPress={() => navigation.navigate('Sync')}
          />
          <RowSeparator />
          <SettingsRow
            icon="contrast-outline"
            iconBg={ICON_COLORS.theme}
            title="Thème"
            subtitle={MODE_LABELS[mode] || 'Système'}
            onPress={() => navigation.navigate('ThemeSettings')}
          />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
})
