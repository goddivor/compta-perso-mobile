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
import { useT } from '../i18n'
import { Field, Input, Segmented, Button, Card } from '../components/ui'

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
]

export default function AccountFormScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
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
      t('accounts.deleteTitle', { name: account.name }),
      t('accounts.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
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
          {account ? t('accountForm.editTitle') : t('accountForm.newTitle')}
        </Text>

        <Field label={t('accountForm.name')}>
          <Input value={form.name} onChangeText={(v) => set('name', v)} placeholder={t('accountForm.namePlaceholder')} />
        </Field>

        {!account ? (
          <Field label={t('accountForm.type')}>
            <Segmented
              value={form.type}
              onChange={(v) => set('type', v)}
              segments={[
                { label: t('common.electronic'), value: 'ELECTRONIC' },
                { label: t('common.cash'), value: 'PHYSICAL' },
              ]}
            />
          </Field>
        ) : null}

        <Field label={t('accountForm.provider')}>
          <Input value={form.provider} onChangeText={(v) => set('provider', v)} placeholder={t('accountForm.providerPlaceholder')} />
        </Field>

        <Field label={t('accountForm.initialBalance')}>
          <Input
            keyboardType="numeric"
            value={form.initial_balance}
            onChangeText={(v) => set('initial_balance', v.replace(',', '.'))}
            placeholder="0"
          />
        </Field>

        <Field label={t('accountForm.color')}>
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

        <Field label={t('accountForm.feesRule')}>
          <Input
            keyboardType="numeric"
            value={form.fees_rate}
            onChangeText={(v) => set('fees_rate', v.replace(',', '.'))}
            placeholder={t('accountForm.noRule')}
          />
        </Field>
        {hasRate ? (
          <Card style={{ padding: 12, gap: 3, backgroundColor: colors.surface2 }}>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>
              {t('accountForm.feeExample', { base: fmt(10000) })}<Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>{fmt(Math.round(10000 * rateNum))}</Text>
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.content }}>
              {t('accountForm.feeExample', { base: fmt(50000) })}<Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>{fmt(Math.round(50000 * rateNum))}</Text>
            </Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button title={t('common.cancel')} variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <Button title={t('common.save')} onPress={save} disabled={!valid} style={{ flex: 1.4 }} />
        </View>
        {account ? (
          <Button title={t('accountForm.delete')} variant="danger" icon="trash-outline" onPress={confirmDelete} />
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
