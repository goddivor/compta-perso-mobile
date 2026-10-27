// Transaction create/edit form (stack screen), v2.
// Order: amount, type (Dépense / Entrée / Transfert), description, category,
// account (De / Vers for a transfer), fees, date.
// Storage is unchanged: a debit stores base + fees, a transfer is two rows
// linked by transfer_pair_id (createTransfer / updateTransfer).
// Editing covers transfer->transfer, transfer->simple (partner deleted),
// simple->transfer (pair created, then the old row deleted) and simple->simple.
// With `route.params.sessionId` the same form feeds a FORECAST session:
// creation goes through addForecastTransaction/addForecastTransfer, editing
// and deleting keep using the regular helpers (they never touch that column).
// Fees are ALWAYS typed freely: the account's fee rules are only chips that
// fill the field when tapped, nothing is applied by default.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import {
  listAccounts,
  listCategories,
  listFeeRules,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createTransfer,
  updateTransfer,
  convertTransferToSimple,
  addForecastTransaction,
  addForecastTransfer,
} from '../db/database'
import { fmt, fmtNumber, fmtParts, today, isValidDay } from '../utils/format'
import { useAmountFormat } from '../context/CurrencyContext'
import { feeSuggestions, feeRuleLabel } from '../utils/fees'
import { useRefresh } from '../context/AppContext'
import { useI18n } from '../i18n'
import { Select, Chip, LogoTile, CategoryIcon, ConfirmDialog } from '../components/v2'
import DatePickerSheet from '../components/DatePickerSheet'

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const digits = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 12)
const grouped = (v) => (v ? fmtNumber(Number(v)) : '')
const NO_CATEGORY = '__none'

// mode: 'DEBIT' (Dépense) | 'CREDIT' (Entrée) | 'TRANSFER' (Transfert)
const emptyForm = {
  account_id: '',
  linked_account_id: '',
  mode: 'DEBIT',
  amount: '',
  fees: '',
  category_id: '',
  date: today(),
  description: '',
}

// --- pure form logic (no React, kept testable) ---
// v1 stored parseFloat values, so the owner's rows may hold decimals. The
// fields show whole digits, but an amount the user does not edit is saved
// EXACTLY as stored: `exact` keeps the stored numbers, and editing a field
// drops its entry so only a value the user typed is parsed.
const noExact = { amount: null, fees: null, stored: null }

// Form + exact values of an existing row (`partner`: its transfer leg, if any)
function rowToForm(row, partner) {
  if (row.transfer_pair_id) {
    const debit = row.type === 'DEBIT' ? row : partner
    const credit = row.type === 'CREDIT' ? row : partner
    const shownCategory = debit?.category_id ?? credit?.category_id ?? ''
    const amount = credit?.amount ?? row.amount
    const fees = debit?.fees || 0
    return {
      legs: { debit, credit, shownCategory },
      exact: { amount, fees, stored: null },
      form: {
        account_id: debit?.account_id ?? row.account_id,
        linked_account_id: credit?.account_id ?? '',
        mode: 'TRANSFER',
        amount: digits(Math.round(amount)),
        fees: fees ? digits(Math.round(fees)) : '',
        category_id: shownCategory,
        date: String(row.date || today()).slice(0, 10),
        description: row.description || '',
      },
    }
  }
  const fees = row.fees || 0
  const amount = row.type === 'DEBIT' ? row.amount - fees : row.amount
  return {
    legs: null,
    // `stored`: a debit's stored total, reused as is while neither field is edited
    exact: { amount, fees, stored: row.type === 'DEBIT' ? row.amount : null },
    form: {
      account_id: row.account_id,
      linked_account_id: '',
      mode: row.type,
      amount: digits(Math.round(amount)),
      fees: fees ? digits(Math.round(fees)) : '',
      category_id: row.category_id || '',
      date: String(row.date || today()).slice(0, 10),
      description: row.description || '',
    },
  }
}

// Amounts to save: { base, fees, stored } (stored = the simple row's amount)
function formAmounts(form, exact = noExact) {
  const base = exact.amount != null ? exact.amount : parseInt(form.amount, 10) || 0
  const fees = exact.fees != null ? exact.fees : parseInt(form.fees, 10) || 0
  if (form.mode !== 'DEBIT') return { base, fees, stored: base }
  const untouched = exact.amount != null && exact.fees != null && exact.stored != null
  return { base, fees, stored: untouched ? exact.stored : base + fees }
}

// Type switch; a NEW row switched to Entrée drops the fee picked as Dépense
function switchMode(f, mode, accounts, isNew) {
  const next = { ...f, mode }
  if (mode === 'TRANSFER') {
    const others = accounts.filter((a) => String(a.id) !== String(f.account_id))
    if (!f.linked_account_id || String(f.linked_account_id) === String(f.account_id)) next.linked_account_id = others[0]?.id ?? ''
  } else {
    next.linked_account_id = ''
  }
  if (isNew && mode === 'CREDIT') next.fees = ''
  return next
}

// Fee chip text: "Retrait · 300", "Transfert 1 % · 100", "1 % · 15"
function feeChipLabel(rule, fee, pct, fallback) {
  const name = rule.kind === 'percent' ? [rule.name, pct].filter(Boolean).join(' ') : rule.name || fallback
  return `${name} · ${fee}`
}
// --- end pure form logic ---

export default function TransactionFormScreen({ navigation, route }) {
  const { label: currencyLabel } = useAmountFormat()
  const symbolLeads = !!fmtParts(0).before
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const refresh = useRefresh()
  const txId = route.params?.id ?? null
  const sessionId = route.params?.sessionId ?? null

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(emptyForm)
  // Stored amounts of the edited row, dropped field by field once edited
  const [exact, setExact] = useState(noExact)
  const [tx, setTx] = useState(null)
  // Edited transfer: both legs, to keep the credit leg's own category
  const [legs, setLegs] = useState(null) // { debit, credit, shownCategory }
  const [dateOpen, setDateOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [focus, setFocus] = useState(null)
  const [busy, setBusy] = useState(false)
  // Synchronous guard: a double tap fires twice before `busy` re-renders
  const saving = useRef(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    const accs = listAccounts()
    setAccounts(accs)
    setCategories(listCategories())

    if (txId) {
      const row = getTransaction(txId)
      setTx(row)
      if (!row) return
      const loaded = rowToForm(row, row.transfer_pair_id ? getTransaction(row.transfer_pair_id) : null)
      setLegs(loaded.legs)
      setExact(loaded.exact)
      setForm(loaded.form)
    } else {
      setForm({ ...emptyForm, account_id: route.params?.defaultAccountId || accs[0]?.id || '' })
    }
  }, [txId])

  const wasTransfer = !!tx?.transfer_pair_id
  const isTransfer = form.mode === 'TRANSFER'
  const isCredit = form.mode === 'CREDIT'

  useLayoutEffect(() => {
    const title = tx
      ? isTransfer ? t('form.editTransfer') : t('form.editTx')
      : sessionId
        ? isTransfer ? t('form.newForecastTransfer') : t('form.newForecastTx')
        : isTransfer ? t('form.newTransfer') : t('form.newTx')
    navigation.setOptions({ title })
  }, [navigation, tx, isTransfer, sessionId, t])

  const amounts = formAmounts(form, exact)
  const baseAmount = amounts.base
  const feesAmt = amounts.fees
  const totalDebit = baseAmount + feesAmt
  // Editing a field: its typed value is parsed from now on
  const editAmount = (v) => { setExact((e) => ({ ...e, amount: null, stored: null })); set('amount', digits(v)) }
  const editFees = (v) => { setExact((e) => ({ ...e, fees: null, stored: null })); set('fees', digits(v)) }

  const sameId = (a, b) => String(a) === String(b)
  const currentAccount = accounts.find((a) => sameId(a.id, form.account_id))
  const otherAccounts = accounts.filter((a) => !sameId(a.id, form.account_id))

  // Fee rules of the account that is debited (the source, for a transfer)
  const feeAccountId = !isCredit && form.account_id ? Number(form.account_id) : null
  const rules = useMemo(() => (feeAccountId ? listFeeRules(feeAccountId) : []), [feeAccountId])
  const suggestions = useMemo(() => (isCredit ? [] : feeSuggestions(rules, baseAmount)), [rules, baseAmount, isCredit])
  // Entrée has no fees field, unless the edited row already carries some
  const showFees = !isCredit || form.fees !== ''

  const valid =
    !!form.account_id && baseAmount > 0 && isValidDay(form.date) &&
    (!isTransfer || (!!form.linked_account_id && !sameId(form.linked_account_id, form.account_id)))

  const chooseMode = (mode) => setForm((f) => switchMode(f, mode, accounts, !txId))

  const chooseAccount = (id) =>
    setForm((f) => {
      const next = { ...f, account_id: id }
      if (sameId(f.linked_account_id, id)) next.linked_account_id = accounts.find((a) => !sameId(a.id, id))?.id ?? ''
      return next
    })

  const pctLabel = (value) =>
    t('form.pct', { n: (value * 100).toLocaleString(locale, { maximumFractionDigits: 2 }) })
  const chipLabel = (s) =>
    feeChipLabel(s.rule, fmtNumber(s.fee), s.rule.kind === 'percent' ? pctLabel(s.rule.value) : '', feeRuleLabel(s.rule))

  const accountLeading = (a) => (
    <LogoTile operatorId={a.operator_id} name={a.name} color={a.color} icon={a.type === 'PHYSICAL' ? 'cash-outline' : undefined} size={32} />
  )
  const accountOptions = (list) => list.map((a) => ({ value: a.id, label: a.name, leading: accountLeading(a) }))

  const categoryOptions = useMemo(
    () => [
      { value: NO_CATEGORY, label: t('form.noCategory'), leading: <CategoryIcon icon="remove-outline" size={32} color={colors.faint} /> },
      ...categories.map((c) => ({
        value: c.id,
        label: c.name,
        leading: <CategoryIcon icon={c.icon} name={c.name} color={c.color} size={32} />,
      })),
    ],
    [categories, colors.faint, t]
  )

  const save = () => {
    if (!valid || busy || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const catId = form.category_id ? Number(form.category_id) : null
      const description = form.description.trim() || null
      const storedAmount = amounts.stored
      const transfer = {
        from_account_id: Number(form.account_id),
        to_account_id: Number(form.linked_account_id),
        amount: baseAmount,
        fees: feesAmt,
        date: form.date,
        description,
      }
      // createTransfer / addForecastTransfer take no category: set it right after
      const createPair = () => {
        const ids = sessionId ? addForecastTransfer({ session_id: sessionId, ...transfer }) : createTransfer(transfer)
        if (catId && ids) {
          updateTransfer({
            debit_tx_id: ids.from_tx_id,
            credit_tx_id: ids.to_tx_id,
            ...transfer,
            category_id_debit: catId,
            category_id_credit: null,
          })
        }
      }
      const simple = {
        account_id: Number(form.account_id),
        type: form.mode,
        amount: storedAmount,
        fees: feesAmt,
        category_id: catId,
        date: form.date,
        description,
      }

      if (!tx) {
        if (isTransfer) createPair()
        else if (sessionId) addForecastTransaction({ session_id: sessionId, ...simple })
        else createTransaction(simple)
      } else if (wasTransfer && isTransfer) {
        // The category lives on the debit leg; the credit leg keeps its own,
        // unless it was the one shown (then it moves to the debit leg)
        const creditCat = legs?.credit?.category_id ?? null
        const moved = legs?.debit?.category_id == null && creditCat != null && String(creditCat) === String(legs.shownCategory)
        updateTransfer({
          debit_tx_id: legs?.debit?.id ?? (tx.type === 'DEBIT' ? tx.id : tx.transfer_pair_id),
          credit_tx_id: legs?.credit?.id ?? (tx.type === 'CREDIT' ? tx.id : tx.transfer_pair_id),
          ...transfer,
          category_id_debit: catId,
          category_id_credit: moved ? null : creditCat,
        })
      } else if (wasTransfer && !isTransfer) {
        // Transfer -> simple: delete the partner, keep the opened side
        convertTransferToSimple({
          keep_tx_id: tx.id,
          delete_tx_id: tx.transfer_pair_id,
          account_id: simple.account_id,
          type: simple.type,
          amount: simple.amount,
          fees: simple.fees,
          category_id: catId,
          date: form.date,
          description,
        })
      } else if (!wasTransfer && isTransfer) {
        // Simple -> transfer: create the pair FIRST, then drop the old row
        createPair()
        deleteTransaction(tx.id)
      } else {
        updateTransaction({ id: tx.id, ...simple })
      }

      refresh()
      navigation.goBack()
    } catch (e) {
      saving.current = false
      setBusy(false)
      Alert.alert(t('common.error'), e.message)
    }
  }

  const remove = () => {
    try {
      deleteTransaction(tx.id)
      refresh()
      setConfirmDelete(false)
      navigation.goBack()
    } catch (e) {
      setConfirmDelete(false)
      Alert.alert(t('common.error'), e.message)
    }
  }

  const dateLabel = isValidDay(form.date)
    ? cap(
        new Date(form.date + 'T00:00:00').toLocaleDateString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      )
    : form.date

  const box = (key, extra) => [
    styles.box,
    { backgroundColor: colors.surface, borderColor: focus === key ? colors.primary600 : colors.line, borderWidth: focus === key ? 2 : 1 },
    extra,
  ]
  const label = (text) => <Text style={[styles.label, { color: colors.muted }]}>{text}</Text>

  const segments = [
    { value: 'DEBIT', label: t('common.expense') },
    { value: 'CREDIT', label: t('common.income') },
    { value: 'TRANSFER', label: t('common.transfer'), disabled: accounts.length < 2 },
  ]

  const deleteBody = tx
    ? [(tx.description || '').trim(), fmt(baseAmount)].filter(Boolean).join(' · ')
    : ''

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Amount */}
          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: focus === 'amount' ? colors.primary600 : colors.line, borderWidth: focus === 'amount' ? 2 : 1 }]}>
            <Text style={[styles.heroLabel, { color: colors.muted }]}>{t('form.amount')}</Text>
            <View style={styles.heroRow}>
              {symbolLeads ? <Text style={[styles.heroCur, { color: colors.muted }]}>{currencyLabel}</Text> : null}
              <TextInput
                value={grouped(form.amount)}
                onChangeText={editAmount}
                onFocus={() => setFocus('amount')}
                onBlur={() => setFocus(null)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.faint}
                autoFocus={!txId}
                selectionColor={colors.primary600}
                accessibilityLabel={t('form.amount')}
                style={[styles.heroInput, { color: colors.ink }]}
              />
              {symbolLeads ? null : <Text style={[styles.heroCur, { color: colors.muted }]}>{currencyLabel}</Text>}
            </View>
          </View>

          {/* Type */}
          <View style={styles.segs}>
            {segments.map((s, i) => {
              const on = form.mode === s.value
              return (
                <Pressable
                  key={s.value}
                  onPress={() => chooseMode(s.value)}
                  disabled={s.disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !!s.disabled }}
                  style={[
                    styles.seg,
                    {
                      backgroundColor: on ? colors.primarySoft : 'transparent',
                      borderColor: colors.line,
                      borderLeftWidth: i === 0 ? 1 : 0,
                      borderTopLeftRadius: i === 0 ? radius.pill : 0,
                      borderBottomLeftRadius: i === 0 ? radius.pill : 0,
                      borderTopRightRadius: i === 2 ? radius.pill : 0,
                      borderBottomRightRadius: i === 2 ? radius.pill : 0,
                      opacity: s.disabled ? 0.45 : 1,
                    },
                  ]}
                >
                  {on ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
                  <Text style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14, color: on ? colors.ink : colors.content }}>
                    {s.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Description */}
          <View>
            {label(t('form.description'))}
            <TextInput
              value={form.description}
              onChangeText={(v) => set('description', v)}
              onFocus={() => setFocus('description')}
              onBlur={() => setFocus(null)}
              multiline
              placeholder={t('form.descriptionPh')}
              placeholderTextColor={colors.faint}
              selectionColor={colors.primary600}
              style={[box('description'), styles.desc, { color: colors.ink }]}
            />
          </View>

          {/* Category */}
          <Select
            label={t('form.category')}
            value={form.category_id ? form.category_id : undefined}
            options={categoryOptions}
            onChange={(v) => set('category_id', v === NO_CATEGORY ? '' : v)}
            placeholderLeading={<CategoryIcon icon="pricetag-outline" size={32} color={colors.faint} />}
          />

          {/* Account(s) */}
          {isTransfer ? (
            <>
              <Select
                label={t('form.from')}
                value={form.account_id}
                options={accountOptions(accounts)}
                onChange={chooseAccount}
              />
              <Select
                label={t('form.to')}
                value={form.linked_account_id}
                options={accountOptions(otherAccounts)}
                onChange={(v) => set('linked_account_id', v)}
              />
            </>
          ) : (
            <Select
              label={t('form.account')}
              value={form.account_id}
              options={accountOptions(accounts)}
              onChange={chooseAccount}
              placeholderLeading={currentAccount ? accountLeading(currentAccount) : undefined}
            />
          )}

          {/* Fees: always free; the rules only suggest */}
          {showFees ? (
            <View>
              {label(t('form.fees'))}
              <View style={box('fees', styles.feesBox)}>
                {symbolLeads ? <Text style={[styles.cur, { color: colors.muted }]}>{currencyLabel}</Text> : null}
                <TextInput
                  value={grouped(form.fees)}
                  onChangeText={editFees}
                  onFocus={() => setFocus('fees')}
                  onBlur={() => setFocus(null)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.faint}
                  selectionColor={colors.primary600}
                  accessibilityLabel={t('form.fees')}
                  style={[styles.feesInput, { color: colors.ink }]}
                />
                {feesAmt > 0 && baseAmount > 0 && !isCredit ? (
                  <Text numberOfLines={1} style={[styles.debited, { color: colors.muted }]}>
                    {t('form.debited', { amount: fmtNumber(totalDebit) })}
                  </Text>
                ) : null}
                {symbolLeads ? null : <Text style={[styles.cur, { color: colors.muted }]}>{currencyLabel}</Text>}
              </View>
              {suggestions.length ? (
                <View style={styles.chips}>
                  {suggestions.map((s) => {
                    const on = form.fees !== '' && feesAmt === s.fee
                    return (
                      <Chip
                        key={s.rule.id}
                        label={chipLabel(s)}
                        selected={on}
                        onPress={() => editFees(on ? '' : String(s.fee))}
                      />
                    )
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Date (not shown behind the keyboard: it opens a sheet) */}
          <View>
            {label(t('form.date'))}
            <Pressable
              onPress={() => setDateOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('form.date')}
              style={[styles.box, styles.dateBox, { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 }]}
            >
              <Ionicons name="calendar-outline" size={22} color={colors.muted} />
              <Text numberOfLines={1} style={[styles.dateText, { color: colors.ink }]}>{dateLabel}</Text>
              <Ionicons name="chevron-down" size={22} color={colors.muted} />
            </Pressable>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.foot, { backgroundColor: colors.bg, borderTopColor: colors.line }]}>
          {tx ? (
            <Pressable
              onPress={() => setConfirmDelete(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footBtn, styles.footDanger, { backgroundColor: colors.dangerSoft, opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.footText, { color: colors.danger }]}>{t('common.delete')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footBtn, { backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
            >
              <Text style={[styles.footText, { color: colors.ink }]}>{t('common.cancel')}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={save}
            disabled={!valid || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid }}
            style={({ pressed }) => [
              styles.footBtn,
              styles.footPrimary,
              { backgroundColor: valid ? (pressed ? colors.primary600 : colors.primary) : colors.surface2 },
            ]}
          >
            <Text style={[styles.footText, { color: valid ? colors.primaryInk : colors.faint }]}>{t('common.save')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={dateOpen}
        date={form.date}
        onClose={() => setDateOpen(false)}
        onSelect={(d) => { set('date', d); setDateOpen(false) }}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={isTransfer && wasTransfer ? t('form.deleteTransfer') : t('form.deleteTx')}
        body={deleteBody}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16, paddingBottom: 24 },
  label: { fontFamily: fonts.medium, fontSize: 13, marginLeft: 4, marginBottom: 6 },
  hero: { borderRadius: radius.xxl, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  heroLabel: { fontFamily: fonts.medium, fontSize: 13 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroInput: { flex: 1, fontFamily: fonts.bold, fontSize: 40, paddingVertical: 4, paddingHorizontal: 0 },
  heroCur: { fontFamily: fonts.medium, fontSize: 16 },
  segs: { flexDirection: 'row' },
  seg: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderBottomWidth: 1, borderRightWidth: 1 },
  box: { minHeight: 56, borderRadius: 14, paddingHorizontal: 15 },
  desc: { height: 104, paddingTop: 14, paddingBottom: 14, fontFamily: fonts.regular, fontSize: 16, textAlignVertical: 'top' },
  feesBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feesInput: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 0 },
  debited: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 13 },
  cur: { fontFamily: fonts.medium, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  dateText: { flex: 1, fontFamily: fonts.medium, fontSize: 16 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { height: 48, paddingHorizontal: 20, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  footDanger: { paddingHorizontal: 18 },
  footPrimary: { flex: 1, maxWidth: 220 },
  footText: { fontFamily: fonts.semibold, fontSize: 15 },
})
