// Cloud sync sub-screen (from Settings). One-tap setup: the API URL and
// token are fetched from the server with a build-time key and NEVER shown.
// Not configured: explanatory text + a single "fetch configuration" button.
// Configured: "configuration fetched" card (date only), status check, then
// push / pull (confirmation before replacing local data), plus discreet
// "refresh configuration" and "reset" actions.
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import {
  getSyncConfig,
  fetchRemoteConfig,
  resetSyncConfig,
  isConfigured,
  syncPush,
  syncPull,
  syncStatus,
} from '../sync/api'
import { fmtDateTime } from '../utils/format'
import { useRefresh } from '../context/AppContext'
import { useT } from '../i18n'
import { Card, Button } from '../components/ui'

// Clean message for a SyncError (never crashes, never shows raw values)
function errorMessage(t, e) {
  switch (e?.code) {
    case 'offline': return t('sync.errOffline')
    case 'unauthorized': return t('sync.errUnauthorized')
    case 'server': return t('sync.errServer', { status: e.status || '?' })
    case 'not_configured': return t('sync.errNotConfigured')
    default: return e?.message || t('common.error')
  }
}

export default function SyncScreen() {
  const { colors } = useTheme()
  const t = useT()
  const refresh = useRefresh()
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    getSyncConfig().then(setCfg)
  }, [])

  const configured = isConfigured(cfg)

  const run = (name, fn) => async () => {
    setSyncError('')
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      setSyncError(errorMessage(t, e))
    } finally {
      setBusy('')
    }
  }

  const doFetchConfig = run('config', async () => {
    const next = await fetchRemoteConfig()
    setCfg(next)
    Alert.alert(t('sync.alertTitle'), t('sync.configSaved'))
  })

  const doRefreshConfig = run('config', async () => {
    setCfg(await fetchRemoteConfig())
  })

  const loadStatus = run('status', async () => {
    setStatus(await syncStatus())
  })

  const doPush = run('push', async () => {
    await syncPush()
    setCfg(await getSyncConfig())
    setStatus(await syncStatus().catch(() => null))
    Alert.alert(t('sync.alertTitle'), t('sync.pushed'))
  })

  const doPull = () => {
    Alert.alert(t('sync.pullTitle'), t('sync.pullMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sync.pullConfirm'),
        style: 'destructive',
        onPress: run('pull', async () => {
          await syncPull()
          setCfg(await getSyncConfig())
          refresh()
          Alert.alert(t('sync.alertTitle'), t('sync.pulled'))
        }),
      },
    ])
  }

  const doReset = () => {
    Alert.alert(t('sync.resetTitle'), t('sync.resetMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sync.reset'),
        style: 'destructive',
        onPress: async () => {
          await resetSyncConfig()
          setCfg(await getSyncConfig())
          setStatus(null)
          setSyncError('')
        },
      },
    ])
  }

  const statusCounts = status?.counts
    ? Object.entries(status.counts).map(([k, v]) => `${k} : ${v}`).join(' · ')
    : null

  if (!cfg) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']} />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {!configured ? (
          /* ------------------------- Not configured ------------------------- */
          <Card style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="cloud-outline" size={22} color={colors.muted} />
              <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.content }}>
                {t('sync.notConfiguredText')}
              </Text>
            </View>
            <Button
              title={t('sync.fetchConfig')}
              icon="cloud-download-outline"
              onPress={doFetchConfig}
              loading={busy === 'config'}
              disabled={!!busy}
            />
          </Card>
        ) : (
          /* --------------------------- Configured --------------------------- */
          <>
            <Card style={{ padding: 16, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>
                  {t('sync.configFetched')}
                </Text>
              </View>
              {cfg.config_fetched_at ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted, marginLeft: 28 }}>
                  {t('sync.configFetchedAt', { date: fmtDateTime(cfg.config_fetched_at) })}
                </Text>
              ) : null}
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Button
                title={t('sync.checkStatus')}
                icon="pulse-outline"
                variant="secondary"
                onPress={loadStatus}
                loading={busy === 'status'}
                disabled={!!busy}
              />
              <Button
                title={t('sync.push')}
                icon="cloud-upload-outline"
                onPress={doPush}
                loading={busy === 'push'}
                disabled={!!busy}
              />
              <Button
                title={t('sync.pull')}
                icon="cloud-download-outline"
                variant="secondary"
                onPress={doPull}
                loading={busy === 'pull'}
                disabled={!!busy}
              />

              <View style={{ gap: 3 }}>
                {status ? (
                  <>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.content }}>
                      {t('sync.lastCloudPush', { date: fmtDateTime(status.pushed_at) })}
                      {status.device ? ` (${status.device})` : ''}
                    </Text>
                    {statusCounts ? (
                      <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>{statusCounts}</Text>
                    ) : null}
                  </>
                ) : null}
                {cfg.last_push ? (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
                    {t('sync.lastPushFromPhone', { date: fmtDateTime(cfg.last_push) })}
                  </Text>
                ) : null}
                {cfg.last_pull ? (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
                    {t('sync.lastPull', { date: fmtDateTime(cfg.last_pull) })}
                  </Text>
                ) : null}
              </View>
            </Card>

            {/* Discreet configuration actions */}
            <View style={styles.linkRow}>
              <Pressable onPress={doRefreshConfig} disabled={!!busy} hitSlop={6}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted }}>
                  {t('sync.refreshConfig')}
                </Text>
              </Pressable>
              <Text style={{ color: colors.faint }}>·</Text>
              <Pressable onPress={doReset} disabled={!!busy} hitSlop={6}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.danger }}>
                  {t('sync.reset')}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {syncError ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.danger }}>{syncError}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  errorBox: {
    borderRadius: radius.md,
    padding: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 2,
  },
})
