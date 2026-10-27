// Fee rule form. Route params: { accountId, ruleId? } (no ruleId = new rule).
// Three kinds: percentage (typed as a percentage, stored as a fraction),
// fixed amount, tiers (max amount → fee, with the official Mixx by Yas grid
// one tap away). A rule only SUGGESTS a fee in the transaction form.
import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listFeeRules, createFeeRule, updateFeeRule, deleteFeeRule } from '../db/database'
import { useRefresh } from '../context/AppContext'
import { useT } from '../i18n'
import { fmtNumber, fmtParts } from '../utils/format'
import { useAmountFormat } from '../context/CurrencyContext'
import { feeRuleLabel } from '../utils/fees'
import { Chip, ConfirmDialog } from '../components/v2'
import { Field, Input, Segmented, Button } from '../components/ui'
import { SuffixInput } from '../data/SuffixInput'
import { MIXX_BY_YAS_RETRAIT } from '../data/feeGrids'
import { ruleSummary } from '../data/accountLabels'

const COLLAPSED_ROWS = 7 // shown while a long grid is folded
const FOLD_ABOVE = 8

let rowKey = 0
const newRow = (max = '', fee = '') => ({ k: ++rowKey, max: String(max), fee: String(fee) })
// A typed percentage: "1,5" or "1.5" (decimal comma or point)
const pctNum = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'))
// A typed amount: whole units, digits only ("5,000" is 5000, never 5)
const digits = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 12)
const num = (s) => (s === '' ? NaN : Number(digits(s)))

export default function FeeRuleFormScreen({ navigation, route }) {
  const { label: currencyLabel } = useAmountFormat()
  const symbolLeads = !!fmtParts(0).before
  const { colors } = useTheme()
  const t = useT()
  const refresh = useRefresh()
  const { accountId, ruleId = null } = route.params || {}

  const [rule, setRule] = useState(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('percent')
  const [pct, setPct] = useState('')
  const [fixed, setFixed] = useState('')
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!ruleId) return
    const r = listFeeRules(accountId).find((x) => x.id === ruleId)
    if (!r) return
    setRule(r)
    setName(r.name || '')
    setKind(r.kind)
    if (r.kind === 'percent') setPct(String(Number((Number(r.value) * 100).toPrecision(10))))
    if (r.kind === 'fixed') setFixed(String(r.value))
    if (r.kind === 'tiers') setRows((r.tiers || []).map(([m, f]) => newRow(m, f)))
  }, [accountId, ruleId])

  const setRow = (k, patch) => setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...patch } : r)))
  const sortRows = () => setRows((rs) => {
    const ok = rs.filter((r) => r.max !== '' && Number.isFinite(num(r.max)))
    const rest = rs.filter((r) => !ok.includes(r))
    return [...ok.sort((a, b) => num(a.max) - num(b.max)), ...rest]
  })

  // What can be saved, or null when the form is incomplete
  const payload = useMemo(() => {
    if (kind === 'percent') {
      const p = pctNum(pct)
      return pct !== '' && p > 0 && p <= 100 ? { kind, value: Number((p / 100).toPrecision(12)) } : null
    }
    if (kind === 'fixed') {
      const f = num(fixed)
      return fixed !== '' && f > 0 ? { kind, value: Math.round(f) } : null
    }
    const tiers = rows.map((r) => [num(r.max), num(r.fee)])
    const ok = tiers.length > 0
      && rows.every((r) => r.max !== '' && r.fee !== '')
      && tiers.every(([m, f]) => Number.isFinite(m) && m > 0 && Number.isFinite(f) && f >= 0)
      && new Set(tiers.map((x) => x[0])).size === tiers.length
    return ok ? { kind, tiers: tiers.map(([m, f]) => [m, Math.round(f)]) } : null
  }, [kind, pct, fixed, rows])

  const save = () => {
    if (!payload) return
    try {
      if (rule) updateFeeRule({ id: rule.id, name: name.trim(), ...payload })
      else createFeeRule({ account_id: accountId, name: name.trim(), ...payload })
    } catch (e) {
      Alert.alert(t('common.error'), String(e?.message || e))
      return
    }
    refresh()
    navigation.goBack()
  }

  const doDelete = () => {
    deleteFeeRule(rule.id)
    setConfirmDelete(false)
    refresh()
    navigation.goBack()
  }

  const folded = rows.length > FOLD_ABOVE && !open
  const shown = folded ? rows.slice(0, COLLAPSED_ROWS) : rows

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label={t('feeRule.name')}>
          <Input value={name} onChangeText={setName} placeholder={t('common.feeRuleDefault')} />
        </Field>

        <Segmented
          value={kind}
          onChange={setKind}
          segments={[
            { label: t('feeRule.percent'), value: 'percent' },
            { label: t('feeRule.fixed'), value: 'fixed' },
            { label: t('feeRule.tiers'), value: 'tiers' },
          ]}
        />

        {kind === 'percent' ? (
          <Field label={t('feeRule.rate')}>
            <SuffixInput keyboardType="numeric" value={pct} onChangeText={(v) => setPct(v.replace(',', '.'))} suffix={t('feeRule.percentUnit')} placeholder="0" />
          </Field>
        ) : null}

        {kind === 'fixed' ? (
          <Field label={t('feeRule.amount')}>
            <SuffixInput keyboardType="number-pad" value={fixed} onChangeText={(v) => setFixed(digits(v))} prefix={symbolLeads ? currencyLabel : undefined} suffix={symbolLeads ? undefined : currencyLabel} placeholder="0" />
          </Field>
        ) : null}

        {kind === 'tiers' ? (
          <View style={{ gap: 12 }}>
            <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.surface }]}>
              <View style={[styles.tr, { borderBottomColor: colors.line }]}>
                <Text style={[styles.th, { color: colors.muted, flex: 1 }]}>{t('feeRule.amount')}</Text>
                <Text style={[styles.th, { color: colors.muted, width: 110 }]}>{t('feeRule.fee')}</Text>
                <View style={{ width: 28 }} />
              </View>
              {shown.map((r, i) => {
                const prev = i > 0 ? num(rows[i - 1].max) : 0
                const start = Number.isFinite(prev) && rows[i - 1]?.max !== '' ? prev + 1 : i === 0 ? 1 : null
                return (
                  <View key={r.k} style={[styles.tr, { borderBottomColor: colors.line }]}>
                    <View style={[styles.cell, { flex: 1 }]}>
                      <Text style={[styles.range, { color: colors.muted }]}>{start != null ? `${fmtNumber(start)} –` : '–'}</Text>
                      <TextInput
                        value={r.max}
                        onChangeText={(v) => setRow(r.k, { max: digits(v) })}
                        onEndEditing={sortRows}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        style={[styles.cellInput, { color: colors.ink }]}
                      />
                    </View>
                    <View style={[styles.cell, { width: 110 }]}>
                      <TextInput
                        value={r.fee}
                        onChangeText={(v) => setRow(r.k, { fee: digits(v) })}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        style={[styles.cellInput, { color: colors.ink, fontFamily: fonts.bold }]}
                      />
                    </View>
                    <Pressable
                      onPress={() => setRows((rs) => rs.filter((x) => x.k !== r.k))}
                      hitSlop={8}
                      accessibilityLabel={t('feeRule.removeTier')}
                      style={styles.rm}
                    >
                      <Ionicons name="close" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                )
              })}
              {rows.length > FOLD_ABOVE ? (
                <Pressable onPress={() => setOpen((o) => !o)} style={styles.foldRow}>
                  <Text style={[styles.range, { color: colors.muted, flex: 1 }]}>
                    {folded ? t('feeRule.moreTiers', { n: rows.length - COLLAPSED_ROWS }) : t('feeRule.lessTiers')}
                  </Text>
                  <Ionicons name={folded ? 'chevron-down' : 'chevron-up'} size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.chips}>
              <Chip
                label={t('feeRule.addTier')}
                leading={<Ionicons name="add" size={16} color={colors.content} />}
                onPress={() => { sortRows(); setOpen(true); setRows((rs) => [...rs, newRow()]) }}
              />
              <Chip
                label={t('feeRule.gridYas')}
                leading={<Ionicons name="download-outline" size={16} color={colors.content} />}
                onPress={() => { setRows(MIXX_BY_YAS_RETRAIT.tiers.map(([m, f]) => newRow(m, f))); setOpen(false) }}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.foot}>
        <Button title={t('common.save')} onPress={save} disabled={!payload} />
        {rule ? (
          <Pressable onPress={() => setConfirmDelete(true)} style={styles.delete} accessibilityRole="button">
            <Text style={[styles.deleteText, { color: colors.danger }]}>{t('feeRule.delete')}</Text>
          </Pressable>
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title={t('feeRule.deleteTitle', { name: rule ? feeRuleLabel(rule) : '' })}
        body={rule ? ruleSummary(t, rule) : undefined}
        confirmLabel={t('common.delete')}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16, paddingBottom: 24 },
  table: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingLeft: 14, paddingRight: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { fontFamily: fonts.medium, fontSize: 12 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  range: { fontFamily: fonts.regular, fontSize: 13 },
  cellInput: { flex: 1, fontFamily: fonts.medium, fontSize: 14, paddingVertical: 0, minHeight: 44 },
  rm: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  foldRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foot: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 4 },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: fonts.semibold, fontSize: 14 },
})
