// Account create/edit. A new account starts with the operator search of the
// profile country's registry (grouped by type, suggestions, cash, free
// account); then the form: name, balance and the account's fee rules. No
// colour picker (first free palette colour), no type picker (the operator or
// cash decides it). Once the account exists its kind is fixed; an electronic
// account can still link, change or drop its operator.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, BackHandler, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import {
  listAccounts, createAccount, updateAccount, deleteAccount, listFeeRules, getAccountTxCounts,
} from '../db/database'
import { useApp } from '../context/AppContext'
import { useProfile } from '../hooks/useProfile'
import { useFocusData } from '../hooks/useFocusData'
import { useI18n } from '../i18n'
import { useCountry, useOperator, useOperators, searchOperators, normalizeText, operatorCountry } from '../registry'
import { LogoTile, Chip, EmptyState, ConfirmDialog } from '../components/v2'
import { Field, Input, Button } from '../components/ui'
import { nextAccountColor } from '../data/accountColors'
import { SuffixInput } from '../data/SuffixInput'
import { operatorTypeLabel, operatorGroupLabel, ruleSummary, RULE_ICON } from '../data/accountLabels'
import { kindControls, saveBeforeRule, isActiveOperator, suggestionsTitle } from '../data/accountForm'
import { feeRuleLabel } from '../utils/fees'
import { CURRENCY_LABEL } from '../utils/format'

const TYPE_ORDER = ['mobile_money', 'bank', 'microfinance', 'fintech']
const GROUP_LIMIT = 4
const SUGGESTION_COUNT = 6

/* ----------------------------- search helpers ---------------------------- */

const queryWords = (q) => normalizeText(q).split(/[^a-z0-9]+/).filter(Boolean)
const wordPrefix = (qw, text) => {
  const w = normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean)
  return qw.every((q) => w.some((x) => x.startsWith(q)))
}

// Text with the typed prefix of each matching word in bold
function Highlighted({ text, qw, style, boldStyle }) {
  const parts = String(text).match(/[A-Za-z0-9À-ɏ]+|[^A-Za-z0-9À-ɏ]+/g) || []
  return (
    <Text numberOfLines={1} style={style}>
      {parts.map((p, i) => {
        const n = normalizeText(p)
        const q = qw.filter((x) => n.startsWith(x)).sort((a, b) => b.length - a.length)[0]
        if (!q) return p
        return (
          <Text key={i}>
            <Text style={boldStyle}>{p.slice(0, q.length)}</Text>
            {p.slice(q.length)}
          </Text>
        )
      })}
    </Text>
  )
}

/* ------------------------------ search step ------------------------------ */

function GroupTitle({ children }) {
  const { colors } = useTheme()
  return <Text style={[styles.group, { color: colors.muted }]}>{children}</Text>
}

function OperatorRow({ op, qw, onPress }) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const nameHit = !qw.length || wordPrefix(qw, op.name)
  const alias = !nameHit ? (op.aliases || []).find((a) => wordPrefix(qw, a)) : null
  return (
    <Pressable onPress={() => onPress(op)} style={({ pressed }) => [styles.opRow, pressed && { backgroundColor: colors.surface2 }]}>
      <LogoTile operatorId={op.id} name={op.name} size={40} />
      <View style={{ flex: 1, gap: 1 }}>
        <Highlighted text={op.name} qw={qw} style={[styles.opName, { color: colors.ink }]} boldStyle={styles.bold} />
        {alias ? (
          <Text numberOfLines={1} style={[styles.opSub, { color: colors.muted }]}>
            {t('accountForm.alsoCalled', { alias: '' })}
            <Highlighted text={alias} qw={qw} style={[styles.opSub, { color: colors.muted }]} boldStyle={[styles.bold, { color: colors.ink }]} />
          </Text>
        ) : (
          <Text numberOfLines={1} style={[styles.opSub, { color: colors.muted }]}>{operatorTypeLabel(t, op.type)}</Text>
        )}
      </View>
    </Pressable>
  )
}

function PlainRow({ icon, color, label, onPress }) {
  const { colors } = useTheme()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.opRow, pressed && { backgroundColor: colors.surface2 }]}>
      <LogoTile name={label} color={color} icon={icon} size={40} />
      <Text numberOfLines={1} style={[styles.opName, { color: colors.ink, flex: 1 }]}>{label}</Text>
    </Pressable>
  )
}

function OperatorSearch({ countryIso2, linkMode, canUnlink, onPickOperator, onPickCash, onPickFree, onUnlink }) {
  const { colors } = useTheme()
  const { t, lang } = useI18n()
  const { data: country } = useCountry(countryIso2)
  const { data: operators, error, retry } = useOperators(countryIso2)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState({})
  const q = query.trim()
  const qw = useMemo(() => queryWords(q), [q])

  const groups = useMemo(() => {
    if (!operators || !q) return []
    const hits = searchOperators(operators.filter(isActiveOperator), q, { limit: 1000 })
    return TYPE_ORDER
      .map((type) => ({ type, items: hits.filter((o) => o.type === type) }))
      .filter((g) => g.items.length)
  }, [operators, q])

  const suggestions = useMemo(() => {
    if (!operators) return []
    const rank = (o) => TYPE_ORDER.indexOf(o.type) * 2 + (o.logo?.svg ? 0 : 1)
    return operators
      .filter(isActiveOperator)
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, SUGGESTION_COUNT)
  }, [operators])

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
          placeholder={t('accountForm.searchPlaceholder')}
          placeholderTextColor={colors.faint}
          style={[styles.searchInput, { color: colors.ink }]}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('accountForm.clearSearch')}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}>
        {!q ? (
          <>
            {error && !operators ? (
              <View style={styles.offline}>
                <Text style={[styles.opSub, { color: colors.muted }]}>{t('common.offline')}</Text>
                <Chip label={t('common.retry')} onPress={retry} />
              </View>
            ) : suggestions.length ? (
              <>
                <GroupTitle>{suggestionsTitle(t, lang, country)}</GroupTitle>
                {suggestions.map((op) => <OperatorRow key={op.id} op={op} qw={qw} onPress={onPickOperator} />)}
              </>
            ) : null}
            {!linkMode ? (
              <>
                <GroupTitle>{t('accountForm.noOperator')}</GroupTitle>
                <PlainRow icon="cash-outline" color={colors.muted} label={t('common.cash')} onPress={onPickCash} />
                <PlainRow icon="create-outline" color={colors.link} label={t('accountForm.otherAccount')} onPress={() => onPickFree('')} />
              </>
            ) : canUnlink ? (
              <View style={{ marginTop: 12 }}>
                <PlainRow icon="close" color={colors.muted} label={t('accountForm.noOperator')} onPress={onUnlink} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            {groups.map((g) => {
              const open = expanded[g.type]
              const shown = open ? g.items : g.items.slice(0, GROUP_LIMIT)
              const rest = g.items.length - shown.length
              return (
                <View key={g.type}>
                  <GroupTitle>{operatorGroupLabel(t, g.type)}</GroupTitle>
                  {shown.map((op) => <OperatorRow key={op.id} op={op} qw={qw} onPress={onPickOperator} />)}
                  {rest > 0 ? (
                    <Pressable onPress={() => setExpanded((e) => ({ ...e, [g.type]: true }))} style={styles.more}>
                      <Text style={[styles.opSub, { color: colors.muted }]}>{t('accountForm.more', { n: rest })}</Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            })}
            {!linkMode ? (
              <View style={{ marginTop: 12 }}>
                <PlainRow icon="add" color={colors.link} label={t('accountForm.createFree', { name: q })} onPress={() => onPickFree(q)} />
              </View>
            ) : !groups.length ? (
              <EmptyState icon="search-outline" title={t('accountForm.noResult')} />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

/* --------------------------------- screen -------------------------------- */

export default function AccountFormScreen({ navigation, route }) {
  const { colors } = useTheme()
  const { t, lang } = useI18n()
  const { tick, refresh } = useApp()
  const profile = useProfile()
  const editId = route.params?.id ?? null
  // Prefill from onboarding: { type: 'ELECTRONIC', operatorId, name } or { type: 'PHYSICAL' }
  const pre = editId ? null : route.params?.type === 'PHYSICAL'
    ? { type: 'PHYSICAL', operatorId: null, name: t('common.cash') }
    : route.params?.operatorId
      ? { type: 'ELECTRONIC', operatorId: route.params.operatorId, name: route.params.name || '' }
      : null

  const [savedId, setSavedId] = useState(editId) // set once the account exists
  const [account, setAccount] = useState(null) // stored row (edit)
  const [step, setStep] = useState(editId || pre ? 'form' : 'search')
  const [picked, setPicked] = useState(!!editId || !!pre) // a choice was made (form available)
  const [type, setType] = useState(pre?.type || 'ELECTRONIC')
  const [operatorId, setOperatorId] = useState(pre?.operatorId || null)
  const [name, setName] = useState(pre?.name || '')
  const [balance, setBalance] = useState('')
  const [rules, setRules] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [txCount, setTxCount] = useState(0)
  const createdId = useRef(null) // set synchronously by createAccount: a second tap cannot create twice
  const leaving = useRef(false) // "Enregistrer" already ran

  useLayoutEffect(() => {
    navigation.setOptions({ title: editId ? t('accountForm.editTitle') : t('accountForm.newTitle') })
  }, [navigation, editId, t])

  useEffect(() => {
    if (!editId) return
    const a = listAccounts().find((x) => x.id === editId)
    if (!a) return
    setAccount(a)
    setType(a.type)
    setOperatorId(a.operator_id || null)
    setName(a.name)
    setBalance(String(a.initial_balance ?? 0))
  }, [editId])

  useFocusData(() => setRules(savedId ? listFeeRules(savedId) : []), [tick, savedId])

  // Back from the search step returns to the form once there is one
  useEffect(() => {
    if (step !== 'search' || !picked) return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setStep('form'); return true })
    return () => sub.remove()
  }, [step, picked])

  // The account exists: its type is fixed (updateAccount does not store it)
  const { canChange, linkMode, canUnlink } = kindControls({ savedId, type, operatorId })

  const { data: operator } = useOperator(operatorId)
  const { data: country } = useCountry(operator ? operatorCountry(operator.id) : null)

  const pickOperator = useCallback((op) => {
    // In link mode the name follows the operator only while it is still the operator's name
    if (!linkMode || (operator && name === operator.name)) setName(op.name)
    if (!linkMode) setType('ELECTRONIC')
    setOperatorId(op.id)
    setPicked(true)
    setStep('form')
  }, [linkMode, operator, name])
  const unlink = useCallback(() => { setOperatorId(null); setStep('form') }, [])
  const pickCash = useCallback(() => {
    setOperatorId(null); setType('PHYSICAL'); setName(t('common.cash')); setPicked(true); setStep('form')
  }, [t])
  const pickFree = useCallback((n) => {
    setOperatorId(null); setType('ELECTRONIC'); setName(n); setPicked(true); setStep('form')
  }, [])

  const valid = name.trim().length > 0
  const balanceNum = Math.round(parseFloat(String(balance).replace(/\s/g, '').replace(',', '.')) || 0)

  const provider = account ? account.provider : operator?.name ?? null

  // Creates the account (new mode) or updates it; returns its id
  const persist = () => {
    const id = savedId ?? createdId.current
    if (id) {
      updateAccount({ id, name: name.trim(), provider, initial_balance: balanceNum, operator_id: operatorId })
      return id
    }
    const newId = createAccount({
      name: name.trim(), type, provider, initial_balance: balanceNum, operator_id: operatorId,
      color: nextAccountColor(listAccounts()),
    })
    createdId.current = newId
    setSavedId(newId)
    return newId
  }

  const save = () => {
    if (!valid || leaving.current) return
    leaving.current = true
    try { persist() } catch (e) { leaving.current = false; throw e }
    refresh()
    navigation.goBack()
  }

  // A rule needs an existing account: an unsaved one is created first and keeps
  // being edited; an existing one is not written before "Enregistrer"
  const addRule = () => {
    if (!valid || leaving.current) return
    const existing = savedId ?? createdId.current
    let id = existing
    if (saveBeforeRule(existing)) { id = persist(); refresh() }
    navigation.navigate('FeeRuleForm', { accountId: id })
  }

  const openDelete = () => {
    setTxCount(getAccountTxCounts().find((r) => r.account_id === savedId)?.n ?? 0)
    setConfirmDelete(true)
  }
  const doDelete = () => {
    deleteAccount(savedId)
    setConfirmDelete(false)
    refresh()
    navigation.goBack()
  }
  const deleteBody = txCount === 0
    ? t('accountForm.deleteBodyNone')
    : txCount === 1 ? t('accountForm.deleteBodyOne') : t('accountForm.deleteBodyMany', { n: txCount })

  if (step === 'search') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <OperatorSearch
          countryIso2={profile.country_iso2}
          linkMode={linkMode}
          canUnlink={canUnlink}
          onPickOperator={pickOperator}
          onPickCash={pickCash}
          onPickFree={pickFree}
          onUnlink={unlink}
        />
      </SafeAreaView>
    )
  }

  const kind = operator
    ? `${operatorTypeLabel(t, operator.type)}${country ? ` · ${country.name[lang] || country.name.en}` : ''}`
    : type === 'PHYSICAL' ? t('common.cash') : t('accountForm.noOperator')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.picked}>
          <LogoTile
            operatorId={operatorId}
            name={name || t('accountForm.otherAccount')}
            color={account?.color}
            icon={type === 'PHYSICAL' ? 'cash-outline' : undefined}
            size={48}
          />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.pickedName, { color: colors.ink }]}>
              {operator ? operator.name : name || t('accountForm.otherAccount')}
            </Text>
            <Text numberOfLines={1} style={[styles.opSub, { color: colors.muted }]}>{kind}</Text>
          </View>
          {canChange ? (
            <Pressable onPress={() => setStep('search')} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.change, { color: colors.link }]}>{t('accountForm.change')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Field label={t('accountForm.name')}>
          <Input value={name} onChangeText={setName} />
        </Field>

        <Field label={editId ? t('accountForm.initialBalance') : t('accountForm.currentBalance')}>
          <SuffixInput
            keyboardType="numeric"
            value={balance}
            onChangeText={(v) => setBalance(v.replace(',', '.'))}
            placeholder="0"
            suffix={CURRENCY_LABEL}
          />
        </Field>

        <Field label={t('accountForm.feeRules')}>
          <View style={[styles.rules, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            {rules.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => navigation.navigate('FeeRuleForm', { accountId: savedId, ruleId: r.id })}
                style={({ pressed }) => [styles.ruleRow, { borderBottomColor: colors.line }, pressed && { backgroundColor: colors.surface2 }]}
              >
                <View style={[styles.ruleIcon, { backgroundColor: colors.surface2 }]}>
                  <Ionicons name={RULE_ICON[r.kind]} size={18} color={colors.content} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.opName, { color: colors.ink }]}>{feeRuleLabel(r)}</Text>
                  <Text numberOfLines={1} style={[styles.opSub, { color: colors.muted }]}>{ruleSummary(t, r)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.faint} />
              </Pressable>
            ))}
            <Pressable
              onPress={addRule}
              disabled={!valid}
              style={({ pressed }) => [styles.ruleRow, { borderBottomWidth: 0, opacity: valid ? 1 : 0.45 }, pressed && { backgroundColor: colors.surface2 }]}
            >
              <View style={[styles.ruleIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="add" size={20} color={colors.ink} />
              </View>
              <Text style={[styles.opName, { color: colors.ink, flex: 1 }]}>{t('accountForm.addRule')}</Text>
            </Pressable>
          </View>
        </Field>
      </ScrollView>

      <View style={styles.foot}>
        <Button title={t('common.save')} onPress={save} disabled={!valid} />
        {savedId ? (
          <Pressable onPress={openDelete} style={styles.delete} accessibilityRole="button">
            <Text style={[styles.deleteText, { color: colors.danger }]}>{t('accountForm.delete')}</Text>
          </Pressable>
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title={t('accountForm.deleteTitle', { name })}
        body={deleteBody}
        confirmLabel={t('common.delete')}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16, paddingBottom: 24 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, marginHorizontal: 16, marginTop: 4, marginBottom: 4, paddingHorizontal: 14, borderRadius: radius.pill },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 0 },
  group: { fontFamily: fonts.semibold, fontSize: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, minHeight: 56 },
  opName: { fontFamily: fonts.medium, fontSize: 15 },
  opSub: { fontFamily: fonts.regular, fontSize: 12 },
  bold: { fontFamily: fonts.bold },
  more: { paddingLeft: 70, paddingVertical: 10, paddingRight: 16 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pickedName: { fontFamily: fonts.semibold, fontSize: 16 },
  change: { fontFamily: fonts.semibold, fontSize: 14 },
  rules: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  ruleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  foot: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 4 },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: fonts.semibold, fontSize: 14 },
})
