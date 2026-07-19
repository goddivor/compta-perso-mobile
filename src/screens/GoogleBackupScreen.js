// "Google backup" sub-screen (from Settings). Optional backup of the local
// data to the user's OWN Google Drive (private appDataFolder space).
// Not connected: short explanation + a white "Sign in with Google" button.
// Connected: account card (photo, name, email), last backup dates (local +
// Drive file found via findBackup), "Backup now" / "Restore from Drive"
// (confirmation: replaces local data), automatic frequency selector and a
// discreet "sign out" link. Every error maps to a clean translated message.
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { useRefresh } from '../context/AppContext'
import { useT } from '../i18n'
import { fmtDateTime } from '../utils/format'
import { Card, Button, Segmented } from '../components/ui'
import {
  isGoogleConfigured,
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

// Clean message for a BackupError (never crashes, never shows raw values)
function errorMessage(t, e) {
  switch (e?.code) {
    case 'not_configured': return t('backup.errNotConfigured')
    case 'play_services': return t('backup.errPlayServices')
    case 'offline': return t('backup.errOffline')
    case 'signin_required': return t('backup.errSignin')
    case 'server': return t('backup.errServer', { status: e.status || '?' })
    case 'no_backup': return t('backup.errNoBackup')
    default: return e?.message || t('common.error')
  }
}

function fmtSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

export default function GoogleBackupScreen() {
  const { colors } = useTheme()
  const t = useT()
  const refresh = useRefresh()

  const [account, setAccount] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [lastBackupAt, setLastBackupAt] = useState(null)
  const [driveFile, setDriveFile] = useState(undefined) // undefined = loading
  const [frequency, setFrequency] = useState('manual')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

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
      if (e?.code !== 'cancelled') setError(errorMessage(t, e))
    } finally {
      setBusy('')
    }
  }

  const doSignIn = run('signin', async () => {
    const acc = await signIn()
    setAccount(acc)
    loadDriveFile()
  })

  const doSignOut = () => {
    Alert.alert(t('backup.signOutTitle'), t('backup.signOutMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('backup.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut()
          setAccount(null)
          setDriveFile(undefined)
          setError('')
        },
      },
    ])
  }

  const doBackup = run('backup', async () => {
    const meta = await backupNow()
    setLastBackupAt(meta.created_at)
    loadDriveFile()
    Alert.alert(t('backup.alertTitle'), t('backup.saved'))
  })

  const doRestore = () => {
    Alert.alert(t('backup.restoreTitle'), t('backup.restoreMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('backup.restoreConfirm'),
        style: 'destructive',
        onPress: run('restore', async () => {
          await restoreFromDrive()
          refresh()
          Alert.alert(t('backup.alertTitle'), t('backup.restored'))
        }),
      },
    ])
  }

  const changeFrequency = (freq) => {
    setFrequency(freq)
    setBackupFrequency(freq)
  }

  const driveSize = driveFile ? fmtSize(driveFile.size) : null

  if (!loaded) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']} />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {!account ? (
          /* -------------------------- Not connected -------------------------- */
          <Card style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.muted} />
              <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.content }}>
                {t('backup.introText')}
              </Text>
            </View>
            <Pressable
              onPress={busy ? undefined : doSignIn}
              disabled={!!busy}
              style={({ pressed }) => [
                styles.googleButton,
                {
                  backgroundColor: pressed ? colors.surface2 : colors.surface,
                  borderColor: colors.line,
                  opacity: busy && busy !== 'signin' ? 0.45 : 1,
                },
              ]}
            >
              <Ionicons name="logo-google" size={18} color={colors.ink} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>
                {busy === 'signin' ? '…' : t('backup.signIn')}
              </Text>
            </Pressable>
            {!isGoogleConfigured() ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: colors.faint }}>
                {t('backup.errNotConfigured')}
              </Text>
            ) : null}
          </Card>
        ) : (
          /* ---------------------------- Connected ---------------------------- */
          <>
            <Card style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {account.photo ? (
                  <Image source={{ uri: account.photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={20} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 1 }}>
                  {account.name ? (
                    <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink }}>
                      {account.name}
                    </Text>
                  ) : null}
                  <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
                    {account.email}
                  </Text>
                </View>
                <Ionicons name="logo-google" size={18} color={colors.faint} />
              </View>

              <View style={{ gap: 3 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.content }}>
                  {lastBackupAt
                    ? t('backup.lastBackup', { date: fmtDateTime(lastBackupAt) })
                    : t('backup.noBackupYet')}
                </Text>
                {driveFile === undefined ? (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>…</Text>
                ) : driveFile ? (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                    {t('backup.driveFile', { date: fmtDateTime(driveFile.modifiedTime) })}
                    {driveSize ? ` · ${driveSize}` : ''}
                  </Text>
                ) : (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
                    {t('backup.driveEmpty')}
                  </Text>
                )}
              </View>
            </Card>

            <Card style={{ padding: 16, gap: 12 }}>
              <Button
                title={t('backup.backupNow')}
                icon="cloud-upload-outline"
                onPress={doBackup}
                loading={busy === 'backup'}
                disabled={!!busy}
              />
              <Button
                title={t('backup.restore')}
                icon="cloud-download-outline"
                variant="secondary"
                onPress={doRestore}
                loading={busy === 'restore'}
                disabled={!!busy}
              />
            </Card>

            <Card style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.ink }}>
                {t('backup.frequency')}
              </Text>
              <Segmented
                value={frequency}
                onChange={changeFrequency}
                segments={FREQUENCIES.map((f) => ({
                  value: f,
                  label: t(`backup.freq_${f}`),
                }))}
              />
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
                {t(`backup.freqHint_${frequency}`)}
              </Text>
            </Card>

            {/* Discreet sign-out link */}
            <View style={styles.linkRow}>
              <Pressable onPress={doSignOut} disabled={!!busy} hitSlop={6}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.danger }}>
                  {t('backup.signOut')}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.danger }}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  googleButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  errorBox: {
    borderRadius: radius.md,
    padding: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
})
