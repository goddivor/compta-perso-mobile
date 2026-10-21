// Settings hub (v2): Profil / Données / Préférences / À propos. Monochrome
// icons on neutral tiles; sub-titles are data only (count, date, address,
// version). The country row is fixed: flag, country, currency, no action.
import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useTheme, fonts } from '../theme/tokens'
import { listAccounts, listCategories } from '../db/database'
import { getSyncConfig, isConfigured } from '../sync/api'
import { getStoredAccount } from '../backup/googleDrive'
import { useTick } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useProfile } from '../hooks/useProfile'
import { useCountry, useCurrency } from '../registry'
import { useI18n } from '../i18n'
import { Flag } from '../components/v2'
import { SettingsRow, RowSeparator, SectionCard, shortDateTime } from '../components/SettingsRow'
import { getCurrentVersion } from '../updates/updater'

export default function SettingsScreen({ navigation }) {
  const { colors, mode } = useTheme()
  const { t, language } = useI18n()
  const tick = useTick()
  const isFocused = useIsFocused()
  const profile = useProfile()
  const { data: country } = useCountry(profile.country_iso2)
  const { data: currency } = useCurrency(profile.currency)
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

  const lang = language === 'en' ? 'en' : 'fr'
  const countryName = country ? country.name[lang] || country.name.en : profile.country_iso2
  const currencyName = currency ? currency.name[lang] || currency.name.en : profile.currency
  const syncSubtitle = syncCfg && isConfigured(syncCfg) ? shortDateTime(syncCfg.last_push) : ''

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 18 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 2 }}>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 26, color: colors.ink }}>{t('settings.title')}</Text>
        </View>

        {profile.country_iso2 ? (
          <SectionCard title={t('settings.sectionProfile')}>
            <SettingsRow
              leading={<Flag iso2={profile.country_iso2} size={40} />}
              title={countryName}
              subtitle={currencyName}
            />
          </SectionCard>
        ) : null}

        <SectionCard title={t('settings.sectionData')}>
          <SettingsRow
            icon="wallet-outline"
            title={t('settings.accounts')}
            subtitle={t(counts.accounts > 1 ? 'settings.accountsMany' : 'settings.accountsOne', { n: counts.accounts })}
            onPress={() => navigation.navigate('AccountsList')}
          />
          <RowSeparator />
          <SettingsRow
            icon="pricetags-outline"
            title={t('settings.categories')}
            subtitle={t(counts.categories > 1 ? 'settings.categoriesMany' : 'settings.categoriesOne', { n: counts.categories })}
            onPress={() => navigation.navigate('Categories')}
          />
          <RowSeparator />
          <SettingsRow
            icon="cloud-outline"
            title={t('settings.sync')}
            subtitle={syncSubtitle}
            onPress={() => navigation.navigate('Sync')}
          />
          <RowSeparator />
          <SettingsRow
            icon="logo-google"
            title={t('settings.googleBackup')}
            subtitle={googleAccount?.email || ''}
            onPress={() => navigation.navigate('GoogleBackup')}
          />
        </SectionCard>

        <SectionCard title={t('settings.sectionPreferences')}>
          <SettingsRow
            icon="contrast-outline"
            title={t('settings.theme')}
            subtitle={t(`theme.${mode}`)}
            onPress={() => navigation.navigate('ThemeSettings')}
          />
          <RowSeparator />
          <SettingsRow
            icon="globe-outline"
            title={t('settings.language')}
            subtitle={t(`language.${language}`)}
            onPress={() => navigation.navigate('LanguageSettings')}
          />
        </SectionCard>

        <SectionCard title={t('settings.about')}>
          <SettingsRow
            icon="information-circle-outline"
            title={t('settings.appName')}
            subtitle={t('settings.version', { v: getCurrentVersion() })}
            onPress={() => navigation.navigate('About')}
          />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  )
}
