// Cloud sync sub-screen (v2). The API URL and token are fetched with a
// build-time key and NEVER shown. Not configured: a centred EmptyState with
// one button. Configured: readiness, the cloud state (device, local dates,
// translated counts) and the actions. Every replace action (send, pull,
// reset) goes through a ConfirmDialog with one line naming what is replaced.
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native'
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
import { useRefresh } from '../context/AppContext'
import { useT } from '../i18n'
import { EmptyState, ConfirmDialog } from '../components/v2'
import { SettingsRow, RowSeparator, SectionCard, shortDateTime, longDateTime } from '../components/SettingsRow'

// Counts shown on the cloud state, in this order (raw table keys are never printed)
const COUNT_KEYS = [
  ['accounts', 'sync.countAccounts'],
  ['categories', 'sync.countCategories'],
  ['transactions', 'sync.countTransactions'],
  ['forecast_sessions', 'sync.countSimulations'],
]

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

function InfoLine({ label, value }) {
  const { colors } = useTheme()
  return (
    <View style={styles.infoLine}>
      <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.ink, textAlign: 'right' }}>{value}</Text>
    </View>
  )
}

export default function SyncScreen() {
  const { colors } = useTheme()
  const t = useT()
  const refresh = useRefresh()
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirm, setConfirm] = useState(null) // 'push' | 'pull' | 'reset'

  const configured = isConfigured(cfg)

  useEffect(() => {
    getSyncConfig().then(setCfg)
  }, [])

  // Cloud state, read once when the screen opens on a configured sync
  // (read-only; a failure here stays silent, "Vérifier l’état" shows it)
  useEffect(() => {
    if (configured) syncStatus().then(setStatus).catch(() => {})
  }, [configured])

  const run = useCallback(
    (name, fn) => async () => {
      setSyncError('')
      setBusy(name)
      try {
        await fn()
      } catch (e) {
        setSyncError(errorMessage(t, e))
      } finally {
        setBusy('')
      }
    },
    [t]
  )

  const doFetchConfig = run('config', async () => {
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

  const doPull = run('pull', async () => {
    await syncPull()
    setCfg(await getSyncConfig())
    refresh()
    Alert.alert(t('sync.alertTitle'), t('sync.pulled'))
  })

  const doReset = run('reset', async () => {
    await resetSyncConfig()
    setCfg(await getSyncConfig())
    setStatus(null)
  })

  const onConfirm = () => {
    const action = confirm
    setConfirm(null)
    if (action === 'push') doPush()
    else if (action === 'pull') doPull()
    else if (action === 'reset') doReset()
  }

  const dialog = {
    push: {
      title: t('sync.pushTitle'),
      body: t('sync.pushMsg'),
      confirmLabel: t('sync.pushConfirm'),
      icon: 'cloud-upload-outline',
      tone: 'primary',
    },
    pull: {
      title: t('sync.pullTitle'),
      body: status?.pushed_at ? t('sync.pullMsg', { date: shortDateTime(status.pushed_at) }) : t('sync.pullMsgNoDate'),
      confirmLabel: t('sync.pullConfirm'),
      icon: 'cloud-download-outline',
      tone: 'danger',
    },
    reset: {
      title: t('sync.resetTitle'),
      body: t('sync.resetMsg'),
      confirmLabel: t('sync.resetConfirm'),
      icon: 'refresh-outline',
      tone: 'danger',
    },
  }[confirm]

  if (!cfg) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']} />

  if (!configured) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('sync.notConfigured')}
          action={{ label: t('sync.fetchConfig'), onPress: busy ? undefined : doFetchConfig, icon: 'cloud-download-outline' }}
        />
        {syncError ? <ErrorBox text={syncError} /> : null}
      </SafeAreaView>
    )
  }

  const disabled = !!busy

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40, gap: 18 }}>
        <SectionCard>
          <SettingsRow
            leading={
              <View style={[styles.okTile, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="checkmark" size={22} color={colors.success} />
              </View>
            }
            title={t('sync.ready')}
            subtitle={longDateTime(cfg.config_fetched_at)}
          />
        </SectionCard>

        {status ? (
          <SectionCard title={t('sync.cloudState')}>
            <View style={{ padding: 16, gap: 10 }}>
              {status.device ? <InfoLine label={t('sync.device')} value={status.device} /> : null}
              {cfg.last_push ? <InfoLine label={t('sync.lastPush')} value={longDateTime(cfg.last_push)} /> : null}
              {cfg.last_pull ? <InfoLine label={t('sync.lastPull')} value={longDateTime(cfg.last_pull)} /> : null}
              {status.counts ? (
                <View style={styles.counts}>
                  {COUNT_KEYS.map(([key, label]) => (
                    <View key={key} style={[styles.count, { backgroundColor: colors.surface2 }]}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>{Number(status.counts[key]) || 0}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted }}>{t(label)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        <SectionCard title={t('sync.actions')}>
          <SettingsRow
            icon="cloud-upload-outline"
            title={t('sync.push')}
            onPress={() => setConfirm('push')}
            loading={busy === 'push'}
            disabled={disabled}
            chevron={false}
          />
          <RowSeparator />
          <SettingsRow
            icon="cloud-download-outline"
            title={t('sync.pull')}
            onPress={() => setConfirm('pull')}
            loading={busy === 'pull'}
            disabled={disabled}
            chevron={false}
          />
          <RowSeparator />
          <SettingsRow
            icon="pulse-outline"
            title={t('sync.checkStatus')}
            onPress={loadStatus}
            loading={busy === 'status'}
            disabled={disabled}
            chevron={false}
          />
          <RowSeparator />
          <SettingsRow
            icon="refresh-outline"
            title={t('sync.refreshConfig')}
            onPress={doFetchConfig}
            loading={busy === 'config'}
            disabled={disabled}
            chevron={false}
          />
          <RowSeparator />
          <SettingsRow
            icon="trash-outline"
            tone="danger"
            title={t('sync.reset')}
            onPress={() => setConfirm('reset')}
            loading={busy === 'reset'}
            disabled={disabled}
            chevron={false}
          />
        </SectionCard>

        {syncError ? <ErrorBox text={syncError} /> : null}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirm}
        title={dialog?.title}
        body={dialog?.body}
        icon={dialog?.icon}
        tone={dialog?.tone}
        confirmLabel={dialog?.confirmLabel}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </SafeAreaView>
  )
}

function ErrorBox({ text }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.danger }}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  okTile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  count: { flexBasis: '48%', flexGrow: 1, borderRadius: radius.xl, paddingVertical: 12, paddingHorizontal: 14, gap: 1 },
  errorBox: { marginHorizontal: 16, borderRadius: radius.lg, padding: 12 },
})
