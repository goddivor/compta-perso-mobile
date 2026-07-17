// Account create/edit form: name, type, provider, initial balance, color
// and per-account automatic fee rule (fraction, e.g. 0.01 = 1%).
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { listAccounts, createAccount, updateAccount, deleteAccount } from '../db/database'
import { fmt } from '../utils/format'
import { useRefresh } from '../context/AppContext'
import { Field, Input, Segmented, Button, Card } from '../components/ui'

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
]

export default function AccountFormScreen({ navigation, route }) {
  const { colors } = useTheme()
  const refresh = useRefresh()
  const accountId = route.params?.id ?? null
  const [account, setAccount] = useState(null)
  const [form, setForm] = useState({
    name: '',
    type: 'ELECTRONIC',
    provider: '',
    initial_balance: '',
    color: COLORS[0],
    fees_rate: '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!accountId) return
    const a = listAccounts().find((x) => x.id === accountId)
    if (!a) return
    setAccount(a)
    setForm({
      name: a.name,
      type: a.type,
      provider: a.provider || '',
      initial_balance: String(a.initial_balance ?? 0),
      color: a.color || COLORS[0],
      fees_rate: a.fees_rate != null ? String(a.fees_rate) : '',
    })
  }, [accountId])

  const rateNum = parseFloat(form.fees_rate)
  const hasRate = !isNaN(rateNum) && rateNum > 0
  const valid = form.name.trim().length > 0

  const save = () => {
    const data = {
      name: form.name.trim(),
      provider: form.provider.trim() || null,
      initial_balance: parseFloat(form.initial_balance) || 0,
      color: form.color,
      fees_rate: hasRate ? rateNum : null,
    }
    if (account) {
      updateAccount({ id: account.id, ...data })
    } else {
      createAccount({ ...data, type: form.type })
    }
    refresh()
    navigation.goBack()
  }

  const confirmDelete = () => {
    Alert.alert(
      `Supprimer « ${account.name} »`,
      'Le compte et TOUTES ses transactions seront supprimés. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => { deleteAccount(account.id); refresh(); navigation.goBack() },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink, marginBottom: 4 }}>
          {account ? 'Modifier le compte' : 'Nouveau compte'}
        </Text>

        <Field label="Nom du compte">
          <Input value={form.name} onChangeText={(v) => set('name', v)} placeholder="ex : Tmoney" />
        </Field>

        {!account ? (
          <Field label="Type">
            <Segmented
              value={form.type}
              onChange={(v) => set('type', v)}
              segments={[
                { label: 'Électronique', value: 'ELECTRONIC' },
                { label: 'Espèces', value: 'PHYSICAL' },
              ]}
            />
          </Field>
        ) : null}

        <Field label="Fournisseur (optionnel)">
          <Input value={form.provider} onChangeText={(v) => set('provider', v)} placeholder="ex : Togocom, Orabank…" />
        </Field>

        <Field label="Solde initial (FCFA)">
          <Input
            keyboardType="numeric"
            value={form.initial_balance}
            onChangeText={(v) => set('initial_balance', v.replace(',', '.'))}
            placeholder="0"
          />
        </Field>

        <Field label="Couleur">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => set('color', c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  form.color === c && { borderWidth: 3, borderColor: colors.ink },
                ]}
              >
                {form.color === c ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Règle de frais (ex : 0.01 pour 1%)">
          <Input
            keyboardType="numeric"
            value={form.fees_rate}
            onChangeText={(v) => set('fees_rate', v.replace(',', '.'))}
            placeholder="Aucune règle"
          />
        </Field>
        {hasRate ? (
          <Card style={{ padding: 12, gap: 3, backgroundColor: colors.surface2 }}>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>
              Pour 10 000 FCFA → frais = <Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>{fmt(Math.round(10000 * rateNum))}</Text>
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>
              Pour 50 000 FCFA → frais = <Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>{fmt(Math.round(50000 * rateNum))}</Text>
            </Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button title="Annuler" variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <Button title="Enregistrer" onPress={save} disabled={!valid} style={{ flex: 1.4 }} />
        </View>
        {account ? (
          <Button title="Supprimer le compte" variant="danger" icon="trash-outline" onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
