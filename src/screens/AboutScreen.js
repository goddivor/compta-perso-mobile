// "À propos" sub-screen (v2): identity, update status + check against GitHub
// Releases, the latest release notes (sub-titles and grey bullets) and links.
import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Linking, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { useT } from '../i18n'
import UpdateModal from '../components/UpdateModal'
import { SettingsRow, RowSeparator, SectionCard } from '../components/SettingsRow'
import {
  checkForUpdate,
  getCachedRelease,
  releaseInfoFromCache,
  getCurrentVersion,
} from '../updates/updater'

const WEBSITE_URL = 'https://goddivor.github.io/compta-perso/'
const GITHUB_URL = 'https://github.com/goddivor/compta-perso-mobile'

// Markdown release notes -> [{ kind: 'title' | 'bullet' | 'text', text }]
function parseNotes(md) {
  const clean = (s) =>
    s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|`)/g, '').trim()
  return String(md || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const l = line.trim()
      if (!l) return null
      if (/^#{1,6}\s*/.test(l)) return { kind: 'title', text: clean(l.replace(/^#{1,6}\s*/, '')) }
      if (/^[-*+]\s+/.test(l)) return { kind: 'bullet', text: clean(l.replace(/^[-*+]\s+/, '')) }
      return { kind: 'text', text: clean(l) }
    })
    .filter((n) => n && n.text)
}

export default function AboutScreen() {
  const { colors } = useTheme()
  const t = useT()
  const version = getCurrentVersion()

  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)
  // Raw release notes (null = loading, '' = none)
  const [notes, setNotes] = useState(null)
  const [showUpdate, setShowUpdate] = useState(false)

  // Release notes come from the persisted cache first (instant, no network);
  // we fetch only when there is no cache yet.
  useEffect(() => {
    let alive = true
    getCachedRelease().then((cache) => {
      if (!alive) return
      if (cache) {
        setNotes(cache.notes || '')
        setResult(releaseInfoFromCache(cache))
      } else {
        checkForUpdate().then((info) => {
          if (alive) setNotes(info.latest ? info.notes || '' : '')
        })
      }
    })
    return () => { alive = false }
  }, [])

  const runCheck = async () => {
    setChecking(true)
    const info = await checkForUpdate()
    setChecking(false)
    setResult(info)
    if (info.latest) setNotes(info.notes || '')
  }

  const openLink = (url) => Linking.openURL(url).catch(() => {})
  const items = useMemo(() => parseNotes(notes), [notes])

  const statusRow = !result ? null : result.latest == null ? (
    <SettingsRow
      icon="cloud-offline-outline"
      title={t('about.checkFailed')}
      chevron={false}
    />
  ) : result.available ? (
    <SettingsRow
      leading={<StatusTile icon="arrow-up" bg={colors.primarySoft} fg={colors.ink} />}
      title={t('about.versionAvailable', { v: result.latest })}
      onPress={() => setShowUpdate(true)}
    />
  ) : (
    <SettingsRow
      leading={<StatusTile icon="checkmark" bg={colors.successSoft} fg={colors.success} />}
      title={t('about.upToDate')}
      subtitle={t('about.installed', { v: version })}
      chevron={false}
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Text style={{ fontFamily: fonts.extrabold, fontSize: 26, color: colors.primaryInk }}>CP</Text>
          </View>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink }}>{t('settings.appName')}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>
            {t('about.version', { v: version })}
          </Text>
        </View>

        <SectionCard title={t('about.updates')}>
          {statusRow}
          {statusRow ? <RowSeparator /> : null}
          <SettingsRow
            icon="refresh-outline"
            title={t('about.check')}
            onPress={runCheck}
            loading={checking}
            chevron={false}
          />
        </SectionCard>

        <SectionCard title={t('about.whatsNew')}>
          <View style={{ padding: 16, gap: 8 }}>
            {notes === null ? (
              <ActivityIndicator size="small" color={colors.muted} style={{ alignSelf: 'flex-start' }} />
            ) : items.length === 0 ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted }}>{t('about.noNotes')}</Text>
            ) : (
              items.map((n, i) =>
                n.kind === 'title' ? (
                  <Text
                    key={i}
                    style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink, marginTop: i > 0 ? 8 : 0 }}
                  >
                    {n.text}
                  </Text>
                ) : n.kind === 'bullet' ? (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <View style={[styles.dot, { backgroundColor: colors.faint }]} />
                    <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 21, color: colors.content }}>
                      {n.text}
                    </Text>
                  </View>
                ) : (
                  <Text key={i} style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 21, color: colors.content }}>
                    {n.text}
                  </Text>
                )
              )
            )}
          </View>
        </SectionCard>

        <SectionCard title={t('about.links')}>
          <SettingsRow icon="globe-outline" title={t('about.website')} onPress={() => openLink(WEBSITE_URL)} />
          <RowSeparator />
          <SettingsRow icon="logo-github" title={t('about.source')} onPress={() => openLink(GITHUB_URL)} />
        </SectionCard>
      </ScrollView>

      <UpdateModal
        visible={showUpdate}
        info={result}
        onLater={() => setShowUpdate(false)}
        onClose={() => setShowUpdate(false)}
      />
    </SafeAreaView>
  )
}

function StatusTile({ icon, bg, fg }) {
  return (
    <View style={[styles.statusTile, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={22} color={fg} />
    </View>
  )
}

const styles = StyleSheet.create({
  logo: { width: 68, height: 68, borderRadius: radius.xl + 4, alignItems: 'center', justifyContent: 'center' },
  statusTile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
})
