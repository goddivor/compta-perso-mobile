// "À propos" sub-screen (from Settings): app identity, manual update check
// against GitHub Releases, latest release notes and external links.
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { useT } from '../i18n'
import { Button } from '../components/ui'
import { checkForUpdate, getCurrentVersion } from '../updates/updater'

const WEBSITE_URL = 'https://goddivor.github.io/compta-perso/'
const GITHUB_URL = 'https://github.com/goddivor/compta-perso-mobile'

// Rough markdown → plain text for the release notes (headings, emphasis,
// links, list bullets).
function markdownToText(md) {
  return String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^\s*[-*+]\s+/gm, '•  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function AboutScreen() {
  const { colors } = useTheme()
  const t = useT()
  const version = getCurrentVersion()

  // Manual check: idle | checking | done (result) | error
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)

  // Release notes, loaded once on mount (null = loading, '' = none)
  const [notes, setNotes] = useState(null)

  useEffect(() => {
    let alive = true
    checkForUpdate().then((info) => {
      if (alive) setNotes(info.latest ? markdownToText(info.notes) : '')
    })
    return () => { alive = false }
  }, [])

  const runCheck = async () => {
    setChecking(true)
    const info = await checkForUpdate()
    setChecking(false)
    setResult(info)
    if (info.latest) setNotes(markdownToText(info.notes))
  }

  const openLink = (url) => Linking.openURL(url).catch(() => {})

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }}>
        {/* App identity */}
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Text style={{ fontFamily: fonts.extrabold, fontSize: 26, color: colors.primaryInk }}>CP</Text>
          </View>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink }}>Compta Perso</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>
            {t('about.version', { v: version })}
          </Text>
        </View>

        {/* Manual update check */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>{t('about.updates')}</Text>
          {result ? (
            result.latest == null ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>
                {t('about.checkFailed')}
              </Text>
            ) : result.available ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="arrow-up-circle" size={20} color={colors.tabActive} />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flex: 1 }}>
                    {t('about.versionAvailable', { v: result.latest })}
                  </Text>
                </View>
                <Button
                  title={t('about.download')}
                  icon="download-outline"
                  onPress={() => openLink(result.apkUrl || result.pageUrl)}
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.ink }}>
                  {t('about.upToDate')}
                </Text>
              </View>
            )
          ) : null}
          <Button
            title={t('about.check')}
            variant="secondary"
            icon="refresh-outline"
            loading={checking}
            onPress={runCheck}
          />
        </View>

        {/* Latest release notes */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>{t('about.whatsNew')}</Text>
          {notes === null ? (
            <ActivityIndicator size="small" color={colors.primary600} style={{ alignSelf: 'flex-start' }} />
          ) : notes === '' ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>
              {t('about.noNotes')}
            </Text>
          ) : (
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: colors.content }}>
              {notes}
            </Text>
          )}
        </View>

        {/* External links */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingTop: 6 }}>
          <Pressable
            onPress={() => openLink(WEBSITE_URL)}
            style={({ pressed }) => [
              styles.linkIcon,
              { backgroundColor: pressed ? colors.line : colors.surface, borderColor: colors.line },
            ]}
          >
            <Ionicons name="globe-outline" size={22} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => openLink(GITHUB_URL)}
            style={({ pressed }) => [
              styles.linkIcon,
              { backgroundColor: pressed ? colors.line : colors.surface, borderColor: colors.line },
            ]}
          >
            <Ionicons name="logo-github" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  logo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  linkIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
