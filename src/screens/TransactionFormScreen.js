// Transaction create/edit form (stack screen).
// Handles simple transactions, account-to-account transfers and the four
// edit cases: transfer->transfer, transfer->simple (delete partner),
// simple->transfer (delete + recreate pair) and simple->simple.
// Fee rule: accounts.fees_rate is a fraction (0.01 = 1%); when the switch
// is on, fees = Math.round(amount * fees_rate) and the fees field is locked.
import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Switch, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import {
  listAccounts,
  listCategories,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createTransfer,
  updateTransfer,
  convertTransferToSimple,
} from '../db/database'
import { fmt, today, isValidDay } from '../utils/format'
import { useRefresh } from '../context/AppContext'
import { useI18n } from '../i18n'
import { Field, Input, Select, Segmented, Button, Card } from '../components/ui'
import DatePickerSheet from '../components/DatePickerSheet'

// Compact long-form day label, e.g. "jeu. 17 juil. 2026"
const fmtDayShort = (day, locale) =>
  isValidDay(day)
    ? new Date(day + 'T00:00:00').toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : day

const emptyForm = {
  account_id: '',
  linked_account_id: '',
  type: 'DEBIT',
  amount: '',
  fees: '',
  category_id: '',
  date: today(),
  description: '',
}

export default function TransactionFormScreen({ navigation, route }) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const refresh = useRefresh()
  const txId = route.params?.id ?? null

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [tx, setTx] = useState(null)
  const [applyFeeRule, setApplyFeeRule] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    const accs = listAccounts()
    setAccounts(accs)
    setCategories(listCategories())

    if (txId) {
      const t = getTransaction(txId)
      setTx(t)
      if (!t) return
      if (t.transfer_pair_id) {
        const partner = getTransaction(t.transfer_pair_id)
        const debitTx = t.type === 'DEBIT' ? t : partner
        const creditTx = t.type === 'CREDIT' ? t : partner
        setForm({
          account_id: t.account_id,
          linked_account_id: partner?.account_id ?? '',
          type: t.type,
          amount: String(creditTx?.amount ?? t.amount),
          fees: debitTx?.fees ? String(debitTx.fees) : '',
          category_id: t.category_id || '',
          date: String(t.date || today()).slice(0, 10),
          description: t.description || '',
        })
      } else {
        setForm({
          account_id: t.account_id,
          linked_account_id: '',
          type: t.type,
          amount: String(t.type === 'DEBIT' ? t.amount - (t.fees || 0) : t.amount),
          fees: t.fees ? String(t.fees) : '',
          category_id: t.category_id || '',
          date: String(t.date || today()).slice(0, 10),
          description: t.description || '',
        })
      }
    } else {
      setForm({
        ...emptyForm,
        account_id: route.params?.defaultAccountId || accs[0]?.id || '',
      })
    }
  }, [txId])

  const wasTransfer = !!tx?.transfer_pair_id
  const isTransfer = !!form.linked_account_id
  const baseAmount = parseFloat(form.amount) || 0

  const currentAccount = accounts.find((a) => String(a.id) === String(form.account_id))
  const otherAccounts = accounts.filter((a) => String(a.id) !== String(form.account_id))
  const linkedAccount = otherAccounts.find((a) => String(a.id) === String(form.linked_account_id))

  const feeRate = currentAccount?.fees_rate ?? null
  const autoFees = feeRate != null && baseAmount > 0 ? Math.round(baseAmount * feeRate) : 0
  const feesAmt = applyFeeRule && feeRate != null ? autoFees : parseFloat(form.fees) || 0
  const totalDebit = baseAmount + feesAmt
  const feeRatePct = feeRate != null ? Number((feeRate * 100).toFixed(2)) : null

  // Transfer direction: DEBIT = current account is the source,
  // CREDIT = current account is the destination.
  const fromAccount = form.type === 'DEBIT' ? currentAccount : linkedAccount
  const toAccount = form.type === 'DEBIT' ? linkedAccount : currentAccount

  const valid = form.account_id && baseAmount > 0 && isValidDay(form.date)

  useEffect(() => {
    // Reset the fee rule switch when switching account
    setApplyFeeRule(false)
  }, [form.account_id])

  const categoryOptions = useMemo(
    () => [
      { label: t('form.noCategory'), value: '' },
      ...categories.map((c) => ({ label: c.name, value: c.id, color: c.color })),
    ],
    [categories, t]
  )

  const save = () => {
    try {
      const catId = form.category_id ? Number(form.category_id) : null
      const description = form.description.trim() || null
      const storedAmount = form.type === 'DEBIT' ? totalDebit : baseAmount

      if (!tx) {
        if (isTransfer) {
          createTransfer({
            from_account_id: Number(fromAccount.id),
            to_account_id: Number(toAccount.id),
            amount: baseAmount,
            fees: feesAmt,
            date: form.date,
            description,
          })
        } else {
          createTransaction({
            account_id: Number(form.account_id),
            type: form.type,
            amount: storedAmount,
            fees: feesAmt,
            category_id: catId,
            date: form.date,
            description,
          })
        }
      } else if (wasTransfer && isTransfer) {
        // Transfer -> transfer: update both sides
        const debitTxId = tx.type === 'DEBIT' ? tx.id : tx.transfer_pair_id
        const creditTxId = tx.type === 'CREDIT' ? tx.id : tx.transfer_pair_id
        updateTransfer({
          debit_tx_id: debitTxId,
          credit_tx_id: creditTxId,
          from_account_id: Number(fromAccount.id),
          to_account_id: Number(toAccount.id),
          amount: baseAmount,
          fees: feesAmt,
          date: form.date,
          description,
          category_id_debit: tx.type === 'DEBIT' ? catId : null,
          category_id_credit: tx.type === 'CREDIT' ? catId : null,
        })
      } else if (wasTransfer && !isTransfer) {
        // Transfer -> simple: delete the partner, keep this side
        convertTransferToSimple({
          keep_tx_id: tx.id,
          delete_tx_id: tx.transfer_pair_id,
          account_id: Number(form.account_id),
          type: form.type,
          amount: storedAmount,
          fees: feesAmt,
          category_id: catId,
          date: form.date,
          description,
        })
      } else if (!wasTransfer && isTransfer) {
        // Simple -> transfer: delete the old row, recreate the pair
        deleteTransaction(tx.id)
        createTransfer({
          from_account_id: Number(fromAccount.id),
          to_account_id: Number(toAccount.id),
          amount: baseAmount,
          fees: feesAmt,
          date: form.date,
          description,
        })
      } else {
        // Simple -> simple
        updateTransaction({
          id: tx.id,
          account_id: Number(form.account_id),
          type: form.type,
          amount: storedAmount,
          fees: feesAmt,
          category_id: catId,
          date: form.date,
          description,
        })
      }

      refresh()
      navigation.goBack()
    } catch (e) {
      Alert.alert(t('common.error'), e.message)
    }
  }

  const title = wasTransfer
    ? t('form.editTransfer')
    : tx
      ? t('form.editTx')
      : t('form.newTx')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink, marginBottom: 4 }}>{title}</Text>

          <Field label={t('form.account')}>
            <Select
              value={form.account_id}
              onChange={(v) => set('account_id', v)}
              options={accounts.map((a) => ({
                label: a.name + (a.provider ? ` (${a.provider})` : ''),
                value: a.id,
                color: a.color,
              }))}
            />
          </Field>

          {form.account_id ? (
            <Field label={form.type === 'CREDIT' ? t('form.sourceAccount') : t('form.destAccount')}>
              <Select
                value={form.linked_account_id}
                onChange={(v) => set('linked_account_id', v)}
                placeholder={t('form.externalNone')}
                options={[
                  { label: t('form.externalNone'), value: '' },
                  ...otherAccounts.map((a) => ({
                    label: a.name + (a.provider ? ` (${a.provider})` : ''),
                    value: a.id,
                    color: a.color,
                  })),
                ]}
              />
            </Field>
          ) : null}

          <Field label={t('form.type')}>
            <Segmented
              value={form.type}
              onChange={(v) => set('type', v)}
              segments={[
                { label: t('form.debitExpense'), value: 'DEBIT' },
                { label: t('form.creditIncome'), value: 'CREDIT' },
              ]}
            />
          </Field>

          <Field label={t('form.amount')}>
            <Input
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(v) => set('amount', v.replace(',', '.'))}
              placeholder="0"
            />
          </Field>

          <Field label={isTransfer ? t('form.transferFees') : t('form.fees')}>
            <Input
              keyboardType="numeric"
              value={applyFeeRule && feeRate != null ? String(autoFees) : form.fees}
              onChangeText={(v) => { setApplyFeeRule(false); set('fees', v.replace(',', '.')) }}
              placeholder="0"
              editable={!(applyFeeRule && feeRate != null)}
            />
          </Field>

          {feeRate != null ? (
            <View style={styles.feeRuleRow}>
              <Switch
                value={applyFeeRule}
                onValueChange={setApplyFeeRule}
                trackColor={{ false: colors.line, true: colors.primary }}
                thumbColor={applyFeeRule ? colors.primaryInk : colors.surface}
              />
              <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
                {t('form.applyFeeRule')}
                <Text style={{ fontFamily: fonts.semibold, color: colors.warning }}>{feeRatePct}%</Text>
                {baseAmount > 0 ? (
                  <Text style={{ color: colors.faint }}>  → {fmt(autoFees)}</Text>
                ) : null}
              </Text>
            </View>
          ) : null}

          {feesAmt > 0 && baseAmount > 0 && form.type === 'DEBIT' && !isTransfer ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>
              {t('form.totalDebited')}<Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>{fmt(totalDebit)}</Text>
              <Text style={{ color: colors.faint }}>{t('form.inclFeesDetail', { amount: fmt(feesAmt) })}</Text>
            </Text>
          ) : null}

          {/* Transfer preview */}
          {isTransfer && baseAmount > 0 && fromAccount && toAccount ? (
            <Card style={{ padding: 14, gap: 6, backgroundColor: colors.surface2 }}>
              <View style={styles.previewRow}>
                <Ionicons name="arrow-up-circle-outline" size={16} color={colors.danger} />
                <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.content }}>
                  {t('form.debit')}<Text style={{ fontFamily: fonts.semibold, color: fromAccount.color }}>{fromAccount.name}</Text>
                </Text>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.danger }}>-{fmt(totalDebit)}</Text>
              </View>
              {feesAmt > 0 ? (
                <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.faint, marginLeft: 24 }}>
                  {t('form.inclFeesShort', { amount: fmt(feesAmt) })}
                </Text>
              ) : null}
              <View style={styles.previewRow}>
                <Ionicons name="arrow-down-circle-outline" size={16} color={colors.success} />
                <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.content }}>
                  {t('form.credit')}<Text style={{ fontFamily: fonts.semibold, color: toAccount.color }}>{toAccount.name}</Text>
                </Text>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.success }}>+{fmt(baseAmount)}</Text>
              </View>
            </Card>
          ) : null}

          <Field label={t('form.date')}>
            <Pressable
              onPress={() => setDateOpen(true)}
              style={[styles.dateTrigger, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <Ionicons name="calendar-outline" size={17} color={colors.muted} />
              <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.ink }}>
                {fmtDayShort(form.date, locale)}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </Pressable>
          </Field>

          <DatePickerSheet
            visible={dateOpen}
            date={form.date}
            onClose={() => setDateOpen(false)}
            onSelect={(d) => { set('date', d); setDateOpen(false) }}
          />

          <Field label={t('form.category')}>
            <Select value={form.category_id} onChange={(v) => set('category_id', v)} options={categoryOptions} placeholder={t('form.noCategory')} />
          </Field>

          <Field label={t('form.description')}>
            <Input multiline value={form.description} onChangeText={(v) => set('description', v)} placeholder={t('form.optional')} />
          </Field>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button title={t('common.cancel')} variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
            <Button
              title={isTransfer ? (tx ? t('form.editTransfer') : t('form.createTransfer')) : t('common.save')}
              onPress={save}
              disabled={!valid}
              style={{ flex: 1.4 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  feeRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -6,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
})
