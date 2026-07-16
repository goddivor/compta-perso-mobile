// Settings: account management, category management and cloud sync
// (API URL/token config, push/pull with confirmation, last push status).
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listAccounts, listCategories, deleteAccount, deleteCategory } from '../db/database'
import { getSyncConfig, saveSyncConfig, syncPush, syncPull, syncStatus } from '../sync/api'
import { fmt, fmtDateTime } from '../utils/format'
import { useApp } from '../context/AppContext'
import { Card, Button, Field, Input, SectionTitle, EmptyState, Dot, Badge } from '../components/ui'

export default function SettingsScreen({ navigation }) {
  const { colors } = useTheme()
  const { tick, refresh } = useApp()
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])

  // Cloud sync state
  const [cfg, setCfg] = useState({ api_url: '', token: '', last_push: null, last_pull: null })
  const [status, setStatus] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    setAccounts(listAccounts())
    setCategories(listCategories())
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load, tick]))

  useEffect(() => {
    getSyncConfig().then(setCfg)
  }, [])

  const confirmDeleteAccount = (a) => {
    Alert.alert(
      `Supprimer « ${a.name} »`,
      'Le compte et TOUTES ses transactions seront supprimés. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => { deleteAccount(a.id); refresh() } },
      ]
    )
  }

  const confirmDeleteCategory = (c) => {
    Alert.alert(
      `Supprimer « ${c.name} »`,
      'Les transactions liées perdront leur catégorie. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => { deleteCategory(c.id); refresh() } },
      ]
    )
  }

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={{ fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink }}>Réglages</Text>
        </View>

        {/* ------------------------------ Accounts ----------------------- */}
        <View style={styles.sectionHeader}>
          <SectionTitle>Comptes</SectionTitle>
          <Pressable onPress={() => navigation.navigate('AccountForm')} hitSlop={8}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.link }}>+ Ajouter</Text>
          </Pressable>
        </View>
        <Card style={{ marginHorizontal: 20 }}>
          {accounts.length === 0 ? (
            <EmptyState icon="wallet-outline" text="Aucun compte." />
          ) : (
            accounts.map((a, i) => (
              <View key={a.id}>
                {i > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
                <Pressable
                  onPress={() => navigation.navigate('AccountForm', { id: a.id })}
                  onLongPress={() => confirmDeleteAccount(a)}
                  delayLongPress={350}
                  style={({ pressed }) => [styles.accountRow, pressed && { backgroundColor: colors.surface2 }]}
                >
                  <Dot color={a.color} size={12} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{a.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                        {a.provider || (a.type === 'ELECTRONIC' ? 'Électronique' : 'Espèces')}
                      </Text>
                      {a.fees_rate != null ? (
                        <Badge label={`Frais ${Number((a.fees_rate * 100).toFixed(2))}%`} color={colors.warning} />
                      ) : null}
                    </View>
                  </View>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: a.current_balance < 0 ? colors.danger : colors.ink }}>
                    {fmt(a.current_balance)}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.faint} />
                </Pressable>
              </View>
            ))
          )}
        </Card>
        <Text style={[styles.hint, { color: colors.faint }]}>Appui long sur un compte pour le supprimer.</Text>

        {/* ----------------------------- Categories ---------------------- */}
        <View style={styles.sectionHeader}>
          <SectionTitle>Catégories</SectionTitle>
          <Pressable onPress={() => navigation.navigate('CategoryForm')} hitSlop={8}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.link }}>+ Ajouter</Text>
          </Pressable>
        </View>
        <Card style={{ marginHorizontal: 20, padding: 14 }}>
          {categories.length === 0 ? (
            <EmptyState icon="pricetags-outline" text="Aucune catégorie." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onLongPress={() => confirmDeleteCategory(c)}
                  delayLongPress={350}
                  style={[styles.catChip, { backgroundColor: colors.surface2, borderColor: colors.line }]}
                >
                  <Dot color={c.color} size={9} />
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.ink }}>{c.name}</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.faint }}>
                    {c.flow === 'DEBIT' ? 'Débit' : c.flow === 'CREDIT' ? 'Crédit' : 'Les deux'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
        <Text style={[styles.hint, { color: colors.faint }]}>Appui long sur une catégorie pour la supprimer.</Text>

        {/* --------------------------- Cloud sync ------------------------ */}
        <View style={styles.sectionHeader}>
          <SectionTitle>Synchronisation cloud</SectionTitle>
        </View>
        <Card style={{ marginHorizontal: 20, padding: 16, gap: 14 }}>
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

          <View style={{ height: 1, backgroundColor: colors.line }} />

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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    minHeight: 34,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 10,
    marginHorizontal: 20,
    marginTop: 6,
  },
  errorBox: {
    borderRadius: radius.md,
    padding: 10,
  },
})
