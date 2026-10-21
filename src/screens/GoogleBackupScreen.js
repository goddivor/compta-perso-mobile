// Google backup sub-screen (v2). Optional backup of the local data to the
// user's OWN Google Drive (private appDataFolder space). Signed out: a
// centred EmptyState with one button. Signed in: account, last backups,
// backup / restore, automatic frequency (radio list), sign out. Restore and
// sign out go through a ConfirmDialog naming what is replaced or kept.
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { useRefresh } from '../context/AppContext'
import { useI18n } from '../i18n'
import { EmptyState, ConfirmDialog } from '../components/v2'
import { SettingsRow, RadioRow, RowSeparator, SectionCard, shortDateTime, longDateTime } from '../components/SettingsRow'
import {
  getStoredAccount,
  signIn,
  signOut,
  findBackup,
  backupNow,
  restoreFromDrive,
  getLastBackupAt,
  getBackupFrequency,
  setBackupFrequency,
  FREQUENCIES,
} from '../backup/googleDrive'

// A backup refused before anything is replaced: the data layer's plain
// Error('Invalid snapshot: ...'), or an unreadable Drive file during restore
const isInvalidSnapshot = (e) => /^invalid snapshot/i.test(String(e?.message || ''))

// Translated message for any error (never crashes, never shows a raw message)
function errorMessage(t, e, action) {
  if (isInvalidSnapshot(e)) return t('backup.errInvalidBackup')
  if (action === 'restore' && e?.code === 'server' && !e.status) return t('backup.errInvalidBackup')
  switch (e?.code) {
    case 'not_configured': return t('backup.errNotConfigured')
    case 'play_services': return t('backup.errPlayServices')
    case 'offline': return t('backup.errOffline')
    case 'signin_required': return t('backup.errSignin')
    case 'server': return e.status ? t('backup.errServer', { status: e.status }) : t('backup.errDrive')
    case 'no_backup': return t('backup.errNoBackup')
    default: return t('backup.errGeneric')
  }
}

// "24,6 Ko" (decimal comma follows the app language)
function fmtSize(bytes, locale) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = locale === 'en' ? ['B', 'KB', 'MB'] : ['o', 'Ko', 'Mo']
  if (n < 1024) return `${n} ${unit[0]}`
  const fmt = (v) => v.toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  if (n < 1024 * 1024) return `${fmt(n / 1024)} ${unit[1]}`
  return `${fmt(n / (1024 * 1024))} ${unit[2]}`
}

export default function GoogleBackupScreen() {
  const { colors } = useTheme()
  const { t, language } = useI18n()
  const refresh = useRefresh()

  const [account, setAccount] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [lastBackupAt, setLastBackupAt] = useState(null)
  const [driveFile, setDriveFile] = useState(undefined) // undefined = loading
  const [frequency, setFrequency] = useState('manual')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // 'restore' | 'signout'

  const loadDriveFile = useCallback(() => {
    setDriveFile(undefined)
    findBackup()
      .then(setDriveFile)
      .catch(() => setDriveFile(null))
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([getStoredAccount(), getLastBackupAt(), getBackupFrequency()]).then(
      ([acc, last, freq]) => {
        if (!alive) return
        setAccount(acc)
        setLastBackupAt(last)
        setFrequency(freq)
        setLoaded(true)
        if (acc) loadDriveFile()
      }
    )
    return () => { alive = false }
  }, [loadDriveFile])

  const run = (name, fn) => async () => {
    setError('')
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      if (e?.code !== 'cancelled') setError(errorMessage(t, e, name))
    } finally {
      setBusy('')
    }
  }

  const doSignIn = run('signin', async () => {
    const acc = await signIn()
    setAccount(acc)
    loadDriveFile()
  })

  const doSignOut = async () => {
    await signOut()
    setAccount(null)
    setDriveFile(undefined)
    setError('')
  }

  const doBackup = run('backup', async () => {
    const meta = await backupNow()
    setLastBackupAt(meta.created_at)
    loadDriveFile()
    Alert.alert(t('backup.alertTitle'), t('backup.saved'))
  })

  // The data layer validates the payload before deleting anything
  const doRestore = run('restore', async () => {
    await restoreFromDrive()
    refresh()
    Alert.alert(t('backup.alertTitle'), t('backup.restored'))
  })

  const onConfirm = () => {
    const action = confirm
    setConfirm(null)
    if (action === 'restore') doRestore()
    else if (action === 'signout') doSignOut()
  }

  const changeFrequency = (freq) => {
    setFrequency(freq)
    setBackupFrequency(freq)
  }

  if (!loaded) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']} />

  if (!account) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <EmptyState
          icon="logo-google"
          title={t('backup.signedOut')}
          action={{ label: t('backup.signIn'), onPress: busy ? undefined : doSignIn, icon: 'logo-google', busy: busy === 'signin' }}
        />
        {error ? <ErrorBox text={error} /> : null}
      </SafeAreaView>
    )
  }

  const driveSize = driveFile ? fmtSize(driveFile.size, language) : null
  const driveDate = driveFile ? longDateTime(driveFile.modifiedTime) : ''
  const disabled = !!busy

  const dialog = {
    restore: {
      title: t('backup.restoreTitle'),
      body: driveFile?.modifiedTime
        ? t('backup.restoreMsg', { date: shortDateTime(driveFile.modifiedTime) })
        : t('backup.restoreMsgNoDate'),
      confirmLabel: t('backup.restoreConfirm'),
      icon: 'cloud-download-outline',
    },
    signout: {
      title: t('backup.signOutTitle'),
      body: t('backup.signOutMsg'),
      confirmLabel: t('backup.signOut'),
      icon: 'log-out-outline',
    },
  }[confirm]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40, gap: 18 }}>
        <SectionCard>
          <SettingsRow
            icon="person-outline"
            title={account.name || account.email}
            subtitle={account.name ? account.email : ''}
            chevron={false}
            wrap
          />
        </SectionCard>

        <SectionCard title={t('backup.lastBackupTitle')}>
          <SettingsRow
            leading={
              <View style={[styles.okTile, { backgroundColor: lastBackupAt ? colors.successSoft : colors.surface2 }]}>
                <Ionicons
                  name={lastBackupAt ? 'checkmark' : 'remove'}
                  size={22}
                  color={lastBackupAt ? colors.success : colors.muted}
                />
              </View>
            }
            title={lastBackupAt ? t('backup.done') : t('backup.noBackupYet')}
            subtitle={lastBackupAt ? longDateTime(lastBackupAt) : ''}
          />
          {driveFile === undefined ? (
            <>
              <RowSeparator />
              <SettingsRow icon="logo-google" title={t('backup.onDrive')} subtitle="…" />
            </>
          ) : driveFile ? (
            <>
              <RowSeparator />
              <SettingsRow
                icon="logo-google"
                title={t('backup.onDrive')}
                subtitle={driveSize ? `${driveDate} · ${driveSize}` : driveDate}
              />
            </>
          ) : null}
        </SectionCard>

        <SectionCard>
          <SettingsRow
            icon="cloud-upload-outline"
            title={t('backup.backupNow')}
            onPress={doBackup}
            loading={busy === 'backup'}
            disabled={disabled}
            chevron={false}
          />
          <RowSeparator />
          <SettingsRow
            icon="cloud-download-outline"
            tone="danger"
            title={t('backup.restore')}
            onPress={() => setConfirm('restore')}
            loading={busy === 'restore'}
            disabled={disabled || !driveFile}
            chevron={false}
          />
        </SectionCard>

        <SectionCard title={t('backup.frequency')}>
          {FREQUENCIES.map((f, i) => (
            <View key={f}>
              {i > 0 ? <RowSeparator /> : null}
              <RadioRow
                icon={FREQ_ICONS[f]}
                title={t(`backup.freq_${f}`)}
                selected={frequency === f}
                onPress={() => changeFrequency(f)}
              />
            </View>
          ))}
        </SectionCard>

        <SectionCard>
          <SettingsRow
            icon="log-out-outline"
            tone="danger"
            title={t('backup.signOut')}
            onPress={() => setConfirm('signout')}
            disabled={disabled}
            chevron={false}
          />
        </SectionCard>

        {error ? <ErrorBox text={error} /> : null}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirm}
        title={dialog?.title}
        body={dialog?.body}
        icon={dialog?.icon}
        tone="danger"
        confirmLabel={dialog?.confirmLabel}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </SafeAreaView>
  )
}

const FREQ_ICONS = {
  manual: 'hand-left-outline',
  open: 'phone-portrait-outline',
  daily: 'today-outline',
  weekly: 'calendar-outline',
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
  errorBox: { marginHorizontal: 16, borderRadius: radius.lg, padding: 12 },
})
