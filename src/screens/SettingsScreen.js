// Settings hub, WhatsApp style: grouped rounded cards of rows, each row
// with a round colored icon, a title/subtitle and a chevron, opening a
// dedicated sub-screen (accounts, categories, cloud sync, theme).
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listAccounts, listCategories } from '../db/database'
import { getSyncConfig, isConfigured } from '../sync/api'
import { getStoredAccount } from '../backup/googleDrive'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useI18n } from '../i18n'
import { SettingsRow, RowSeparator } from '../components/SettingsRow'
import { getCurrentVersion } from '../updates/updater'

// Solid icon colors (WhatsApp style: colored circle + white pictogram),
// identical in light and dark
const ICON_COLORS = {
  accounts: '#3B82F6',
  categories: '#8B5CF6',
  sync: '#16A34A',
  googleBackup: '#EA4335',
  theme: '#F59E0B',
  language: '#0EA5E9',
  about: '#64748B',
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
  const { t, language } = useI18n()
  const tick = useTick()
  const isFocused = useIsFocused()
  const [counts, setCounts] = useState({ accounts: 0, categories: 0 })
  const [syncCfg, setSyncCfg] = useState(null)
  const [googleAccount, setGoogleAccount] = useState(null)

  useFocusData(() => {
    setCounts({ accounts: listAccounts().length, categories: listCategories().length })
  }, [tick])

  useEffect(() => {
    if (isFocused) {
      getSyncConfig().then(setSyncCfg)
      getStoredAccount().then(setGoogleAccount)
    }
  }, [isFocused])

  const syncSubtitle = syncCfg
    ? isConfigured(syncCfg)
      ? t('settings.syncConfigured')
      : t('settings.syncNotConfigured')
    : '…'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 18 }}>
        <View style={styles.header}>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>{t('settings.title')}</Text>
        </View>

        <SectionCard title={t('settings.sectionData')}>
          <SettingsRow
            icon="wallet-outline"
            iconBg={ICON_COLORS.accounts}
            title={t('settings.accounts')}
            subtitle={t(counts.accounts > 1 ? 'settings.accountsMany' : 'settings.accountsOne', { n: counts.accounts })}
            onPress={() => navigation.navigate('AccountsList')}
          />
          <RowSeparator />
          <SettingsRow
            icon="pricetags-outline"
            iconBg={ICON_COLORS.categories}
            title={t('settings.categories')}
            subtitle={t(counts.categories > 1 ? 'settings.categoriesMany' : 'settings.categoriesOne', { n: counts.categories })}
            onPress={() => navigation.navigate('Categories')}
          />
        </SectionCard>

        <SectionCard title={t('settings.sectionApp')}>
          <SettingsRow
            icon="cloud-outline"
            iconBg={ICON_COLORS.sync}
            title={t('settings.sync')}
            subtitle={syncSubtitle}
            onPress={() => navigation.navigate('Sync')}
          />
          <RowSeparator />
          <SettingsRow
            icon="logo-google"
            iconBg={ICON_COLORS.googleBackup}
            title={t('settings.googleBackup')}
            subtitle={
              googleAccount?.email
                ? t('settings.googleConnected', { email: googleAccount.email })
                : t('settings.googleNotConfigured')
            }
            onPress={() => navigation.navigate('GoogleBackup')}
          />
          <RowSeparator />
          <SettingsRow
            icon="contrast-outline"
            iconBg={ICON_COLORS.theme}
            title={t('settings.theme')}
            subtitle={t(`theme.${mode}`) || t('theme.system')}
            onPress={() => navigation.navigate('ThemeSettings')}
          />
          <RowSeparator />
          <SettingsRow
            icon="globe-outline"
            iconBg={ICON_COLORS.language}
            title={t('settings.language')}
            subtitle={t(`language.${language}`)}
            onPress={() => navigation.navigate('LanguageSettings')}
          />
          <RowSeparator />
          <SettingsRow
            icon="information-circle-outline"
            iconBg={ICON_COLORS.about}
            title={t('settings.about')}
            subtitle={t('settings.version', { v: getCurrentVersion() })}
            onPress={() => navigation.navigate('About')}
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
