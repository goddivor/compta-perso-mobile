// Cloud sync sub-screen (from Settings): API URL/token configuration,
// push/pull (with confirmation before replacing local data) and cloud
// status (last push date + device + row counts).
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, fonts, radius } from '../theme/tokens'
import { getSyncConfig, saveSyncConfig, syncPush, syncPull, syncStatus } from '../sync/api'
import { fmtDateTime } from '../utils/format'
import { useRefresh } from '../context/AppContext'
import { Card, Button, Field, Input } from '../components/ui'

export default function SyncScreen() {
  const { colors } = useTheme()
  const refresh = useRefresh()
  const [cfg, setCfg] = useState({ api_url: '', token: '', last_push: null, last_pull: null })
  const [status, setStatus] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    getSyncConfig().then(setCfg)
  }, [])

  const saveConfig = async () => {
    setSyncError('')
    const next = await saveSyncConfig({ api_url: cfg.api_url.trim(), token: cfg.token.trim() })
    setCfg(next)
    Alert.alert('Synchronisation', 'Configuration enregistrée.')
  }

  const loadStatus = async () => {
    setSyncError('')
    setBusy('status')
    try {
      setStatus(await syncStatus())
    } catch (e) {
      setStatus(null)
      setSyncError(e.message)
    } finally {
      setBusy('')
    }
  }

  const doPush = async () => {
    setSyncError('')
    setBusy('push')
    try {
      await syncPush()
      setCfg(await getSyncConfig())
      await loadStatus()
      Alert.alert('Synchronisation', 'Données envoyées vers le cloud.')
    } catch (e) {
      setSyncError(e.message)
    } finally {
      setBusy('')
    }
  }

  const doPull = () => {
    Alert.alert(
      'Récupérer du cloud',
      'Toutes les données locales seront REMPLACÉES par la sauvegarde cloud. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Remplacer',
          style: 'destructive',
          onPress: async () => {
            setSyncError('')
            setBusy('pull')
            try {
              await syncPull()
              setCfg(await getSyncConfig())
              refresh()
              Alert.alert('Synchronisation', 'Données locales remplacées par le cloud.')
            } catch (e) {
              setSyncError(e.message)
            } finally {
              setBusy('')
            }
          },
        },
      ]
    )
  }

  const statusCounts = status?.counts
    ? Object.entries(status.counts).map(([k, v]) => `${k} : ${v}`).join(' · ')
    : null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ padding: 16, gap: 14 }}>
            <Field label="URL de l'API">
              <Input
                value={cfg.api_url}
                onChangeText={(v) => setCfg((c) => ({ ...c, api_url: v }))}
                placeholder="https://compta-perso-sync-api.vercel.app"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Field>
            <Field label="Token">
              <Input
                value={cfg.token}
                onChangeText={(v) => setCfg((c) => ({ ...c, token: v }))}
                placeholder="Token secret"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </Field>
            <Button title="Enregistrer la configuration" variant="secondary" onPress={saveConfig} />
          </Card>

          <Card style={{ padding: 16, gap: 12 }}>
            <Button
              title="Envoyer vers le cloud"
              icon="cloud-upload-outline"
              onPress={doPush}
              loading={busy === 'push'}
              disabled={!!busy}
            />
            <Button
              title="Récupérer du cloud"
              icon="cloud-download-outline"
              variant="secondary"
              onPress={doPull}
              loading={busy === 'pull'}
              disabled={!!busy}
            />
            <Button
              title="Vérifier l'état du cloud"
              icon="refresh-outline"
              variant="secondary"
              onPress={loadStatus}
              loading={busy === 'status'}
              disabled={!!busy}
            />

            {syncError ? (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft }]}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.danger }}>{syncError}</Text>
              </View>
            ) : null}

            <View style={{ gap: 3 }}>
              {status ? (
                <>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.content }}>
                    Dernier push cloud : {fmtDateTime(status.pushed_at)}
                    {status.device ? ` — ${status.device}` : ''}
                  </Text>
                  {statusCounts ? (
                    <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>{statusCounts}</Text>
                  ) : null}
                </>
              ) : null}
              {cfg.last_push ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
                  Dernier envoi depuis ce téléphone : {fmtDateTime(cfg.last_push)}
                </Text>
              ) : null}
              {cfg.last_pull ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint }}>
                  Dernière récupération : {fmtDateTime(cfg.last_pull)}
                </Text>
              ) : null}
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  errorBox: {
    borderRadius: radius.md,
    padding: 10,
  },
})
