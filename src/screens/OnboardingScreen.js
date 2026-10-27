// Onboarding and update path. Opened over the tabs while the profile has no
// currency. Fresh install (route param withAccountStep): country, currency,
// first account. Upgrade with existing accounts: country, currency to
// confirm. Only setProfile() is called: no amount, account or transaction is
// ever converted or changed. Going back out of the flow is blocked; it ends
// with navigation.reset to 'Tabs'.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, FlatList, ScrollView, BackHandler, Alert, StyleSheet, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getLocales } from 'expo-localization'
import { useTheme, fonts, radius } from '../theme/tokens'
import { useI18n } from '../i18n'
import { listAccounts, setProfile } from '../db/database'
import { useRefresh } from '../context/AppContext'
import { EmptyState, Flag, CurrencySign, LogoTile } from '../components/v2'
import {
  useCountries, useCurrencies, useOperators, useInternational, useRegistryCheck, searchCountries, searchOperators, normalizeText,
} from '../registry'
import { RegistryProgress } from '../components/RegistryProgress'
import { activeOperatorCount, searchPlaceholder, showSearchAll, isActiveOperator } from '../data/accountForm'
import { popularOperators } from '../data/popularOperators'
import { capitalizeFirst } from '../utils/format'

const DEFAULT_OPERATORS = 6

// Offline fallback: active ISO 4217 codes, used only when the registry's
// currency list cannot be loaded (fresh install with no network), so a new
// user can always pick a currency. Names come from Intl when available.
const ISO_CODES = (
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD ' +
  'CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD ' +
  'GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT ' +
  'LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR ' +
  'NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP ' +
  'STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF ' +
  'XPF YER ZAR ZMW ZWL'
).split(' ')

function currencyNamer(locale) {
  try {
    const dn = new Intl.DisplayNames([locale], { type: 'currency' })
    return (code) => { try { return dn.of(code) || code } catch { return code } }
  } catch {
    return (code) => code
  }
}

function isoFallback() {
  const fr = currencyNamer('fr')
  const en = currencyNamer('en')
  return ISO_CODES.map((code) => ({ code, name: { fr: fr(code), en: en(code) } }))
}

function phoneRegion() {
  try { return String(getLocales()[0]?.regionCode || '').toUpperCase() } catch { return '' }
}

export default function OnboardingScreen({ navigation, route }) {
  const { colors } = useTheme()
  const { t, lang } = useI18n()
  const refresh = useRefresh()
  const withAccountStep = route?.params?.withAccountStep !== false
  const accountCount = useMemo(() => {
    if (withAccountStep) return 0
    try { return listAccounts().length } catch { return 0 }
  }, [withAccountStep])
  const stepCount = withAccountStep ? 3 : 2

  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const [iso2, setIso2] = useState(null) // chosen country, null = none or "not in the registry"
  const [isoMode, setIsoMode] = useState(false) // currency picked from the ISO list
  const [currency, setCurrency] = useState(null)
  const [saving, setSaving] = useState(false)

  const countries = useCountries()
  const currencies = useCurrencies()
  const country = useMemo(() => (countries.data || []).find((c) => c.iso2 === iso2) || null, [countries.data, iso2])

  // the system back button walks the steps and never leaves the flow
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) goBack()
      return true
    })
    return () => sub.remove()
  })

  const goBack = () => {
    setQuery('')
    if (step === 1) { setIsoMode(false); setCurrency(null) }
    setStep((s) => Math.max(0, s - 1))
  }

  const toTabs = useCallback((screen) => {
    refresh?.()
    const routes = [{ name: 'Tabs' }]
    if (screen) routes.push(screen)
    navigation.reset({ index: routes.length - 1, routes })
  }, [navigation, refresh])

  const save = (code) => {
    if (saving) return false
    setSaving(true)
    try {
      setProfile({ country_iso2: isoMode ? null : iso2, currency: code })
      return true
    } catch (e) {
      Alert.alert(t('common.error'), String(e?.message || e))
      return false
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------- step 1: country --------------------------- */
  const region = phoneRegion()
  const suggested = useMemo(() => (countries.data || []).find((c) => c.iso2 === region) || null, [countries.data, region])
  useEffect(() => {
    // the phone's region is preselected once the registry is loaded
    if (suggested && iso2 == null && !isoMode) setIso2(suggested.iso2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested])

  const countryRows = useMemo(() => {
    const all = countries.data || []
    if (query.trim()) return searchCountries(all, query, lang).map((c) => ({ kind: 'country', c }))
    const sorted = searchCountries(all, '', lang)
    const rows = []
    if (suggested) rows.push({ kind: 'grp', key: 'sug', label: t('onboarding.suggested') }, { kind: 'country', c: suggested, key: 's' })
    rows.push({ kind: 'grp', key: 'all', label: t('onboarding.all') }, ...sorted.map((c) => ({ kind: 'country', c })))
    return rows
  }, [countries.data, query, suggested, lang, t])

  const nameOf = (c) => c.name[lang] || c.name.en

  const continueCountry = () => {
    if (!country) return
    setQuery('')
    setIsoMode(false)
    setCurrency(country.currencies[0] || null)
    setStep(1)
  }
  const chooseIsoCurrency = () => {
    setQuery('')
    setIso2(null)
    setIsoMode(true)
    setCurrency(null)
    setStep(1)
  }

  /* ---------------------------- step 2: currency -------------------------- */
  const fallback = useMemo(() => (currencies.error && !currencies.data ? isoFallback() : null), [currencies.error, currencies.data])
  const currencyRows = useMemo(() => {
    const all = currencies.data || fallback || []
    if (!isoMode) return (country?.currencies || []).map((code) => all.find((c) => c.code === code)).filter(Boolean)
    const q = normalizeText(query).trim()
    const list = all.filter((c) => !q || normalizeText(c.code).startsWith(q) || normalizeText(c.name[lang] || c.name.en).includes(q) || normalizeText(c.name.en).includes(q))
    return list.sort((a, b) => a.code.localeCompare(b.code))
  }, [currencies.data, fallback, country, isoMode, query, lang])

  const continueCurrency = () => {
    if (!currency || !save(currency)) return
    if (withAccountStep) { setQuery(''); setStep(2) } else toTabs()
  }

  /* --------------------------- step 3: first account ---------------------- */
  const accountStep = withAccountStep && step === 2 && !isoMode
  const operators = useOperators(accountStep ? iso2 : null)
  const international = useInternational(accountStep ? iso2 : null)
  // registry update check on focus of this step (background, silent)
  useRegistryCheck(iso2, accountStep && !!iso2)
  const { width } = useWindowDimensions()
  const tileW = Math.floor((width - 32 - 20) / 3)
  const intlActive = useMemo(() => (international.data || []).filter(isActiveOperator), [international.data])
  const nationalCount = activeOperatorCount(operators.data)
  const opCount = nationalCount == null ? null : nationalCount + intlActive.length
  const opList = useMemo(() => {
    const active = (operators.data || []).filter(isActiveOperator)
    if (query.trim()) return searchOperators(active, query, { limit: 12 })
    return popularOperators(operators.data, DEFAULT_OPERATORS, { logoOnly: true })
  }, [operators.data, query])
  // International services matching the search, in their own section (the
  // popular tiles stay national)
  const intlList = useMemo(
    () => (query.trim() ? searchOperators(intlActive, query, { limit: 12 }) : []),
    [intlActive, query],
  )

  // "Not listed? Search all N" focuses the search field. Android does not
  // reopen the keyboard on focus() of an input that kept the focus after the
  // keyboard was dismissed: blur it first
  const searchRef = useRef(null)
  const focusSearch = useCallback(() => {
    const input = searchRef.current
    if (!input) return
    if (input.isFocused()) input.blur()
    requestAnimationFrame(() => input.focus())
  }, [])

  const openAccount = (params) => toTabs({ name: 'AccountForm', params })
  const opTile = (o) => (
    <Pressable
      key={o.id}
      onPress={() => openAccount({ type: 'ELECTRONIC', operatorId: o.id, name: o.name })}
      accessibilityRole="button"
      style={[styles.op, { width: tileW, backgroundColor: colors.surface }]}
    >
      <LogoTile operatorId={o.id} name={o.name} size={48} />
      <Text style={[styles.opName, { color: colors.ink }]} numberOfLines={2}>{o.name}</Text>
    </Pressable>
  )

  // The operators of the profile country are still loading (also true on the
  // first render of the step, before the hook's effect flags it as loading),
  // or a failed download is waiting for its automatic retry: the search
  // field shows, disabled, and skeleton tiles hold the grid's place
  const opsLoading = accountStep && !!iso2 && !operators.data && operators.error?.code !== 'not_found'

  /* -------------------------------- render -------------------------------- */
  const title = [t('onboarding.country'), t('onboarding.currency'), t('onboarding.account')][step]
  const offline = step === 0 && !countries.data && !countries.loading && countries.error
  const showSearch = !offline && ((step === 0) || (step === 1 && isoMode && (currencies.data || fallback)) || (step === 2 && !isoMode && iso2 && (operators.data || opsLoading)))
  const placeholder = step === 0 ? t('onboarding.search') : step === 1 ? t('onboarding.currencySearch') : searchPlaceholder(t, opCount)
  const noCountry = step === 0 && !!query.trim() && countryRows.length === 0

  let foot = null
  if (offline) {
    // no registry: the ISO currency list (country unknown) keeps the flow open
    foot = (
      <>
        {!withAccountStep ? <TextButton label={t('onboarding.later')} onPress={() => toTabs()} colors={colors} /> : null}
        <TonalButton label={t('onboarding.chooseCurrency')} onPress={chooseIsoCurrency} colors={colors} />
      </>
    )
  } else if (step === 0) {
    if (!noCountry) foot = <PrimaryButton label={t('onboarding.continue')} disabled={!country} onPress={continueCountry} colors={colors} />
  } else if (step === 1) {
    foot = <PrimaryButton label={withAccountStep ? t('onboarding.continue') : t('onboarding.confirm')} disabled={!currency || saving} onPress={continueCurrency} colors={colors} />
  } else {
    foot = <TextButton label={t('onboarding.later')} onPress={() => toTabs()} colors={colors} />
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        {step > 0 ? (
          <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={t('onboarding.back')} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
        ) : <View style={{ width: 12 }} />}
        <View style={styles.steps}>
          {Array.from({ length: stepCount }, (_, i) => (
            <View key={i} style={[styles.bar, { backgroundColor: i <= step ? colors.primary600 : colors.line }]} />
          ))}
        </View>
      </View>
      <Text style={[styles.h2, { color: colors.ink }]}>{title}</Text>

      {showSearch ? (
        <View style={[styles.search, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search" size={22} color={colors.muted} />
          <TextInput
            ref={searchRef}
            value={query}
            numberOfLines={1}
            onChangeText={setQuery}
            editable={!opsLoading}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.ink }]}
          />
          {step === 2 ? <RegistryProgress inset={26} /> : null}
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('onboarding.clear')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.body}>
        {step === 0 ? (
          offline ? (
            <EmptyState icon="cloud-offline-outline" title={t('common.offline')} action={{ label: t('common.retry'), onPress: countries.retry, icon: 'refresh' }} />
          ) : countries.loading || !countries.data ? null : noCountry ? (
            <EmptyState icon="earth-outline" title={t('onboarding.countryMissing')} action={{ label: t('onboarding.chooseCurrency'), onPress: chooseIsoCurrency, variant: 'tonal' }} />
          ) : (
            <FlatList
              data={countryRows}
              keyExtractor={(r, i) => (r.kind === 'grp' ? `g-${r.key}` : `c-${r.key || ''}${r.c.iso2}-${i}`)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 110 }}
              renderItem={({ item }) =>
                item.kind === 'grp' ? (
                  <Text style={[styles.grp, { color: colors.muted }]}>{item.label}</Text>
                ) : (
                  <Pressable
                    onPress={() => setIso2(item.c.iso2)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: iso2 === item.c.iso2 }}
                    style={[styles.crow, iso2 === item.c.iso2 && { backgroundColor: colors.primarySoft }]}
                  >
                    <Flag iso2={item.c.iso2} size={32} />
                    <Text style={[styles.cname, { color: colors.ink, fontFamily: iso2 === item.c.iso2 ? fonts.semibold : fonts.regular }]} numberOfLines={1}>{nameOf(item.c)}</Text>
                    <Text style={[styles.ccode, { color: colors.muted }]}>{item.c.currencies.join(' · ')}</Text>
                    {iso2 === item.c.iso2 ? <Ionicons name="checkmark-circle" size={22} color={colors.ink} /> : null}
                  </Pressable>
                )
              }
            />
          )
        ) : step === 1 ? (
          !currencies.data && !fallback ? null : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, paddingBottom: 110 }}>
              {currencyRows.map((cur) => {
                const sel = currency === cur.code
                const sign = cur.sign?.text && cur.sign.text !== cur.code ? ` · ${cur.sign.text}` : ''
                return (
                  <Pressable
                    key={cur.code}
                    onPress={() => setCurrency(cur.code)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    style={[styles.card, { backgroundColor: sel ? colors.primarySoft : colors.surface, borderColor: sel ? colors.primary600 : colors.line, borderWidth: sel ? 2 : 1 }]}
                  >
                    <View style={[styles.sign, { backgroundColor: colors.surface2 }]}>
                      <CurrencySign code={cur.code} size={36} colored />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.curName, { color: colors.ink }]} numberOfLines={2}>{capitalizeFirst(cur.name[lang] || cur.name.en)}</Text>
                      <Text style={[styles.curCode, { color: colors.muted }]}>{cur.code}{sign}</Text>
                    </View>
                    <View style={[styles.radio, { borderColor: sel ? colors.ink : colors.faint, borderWidth: sel ? 7 : 2 }]} />
                  </Pressable>
                )
              })}
              <View style={styles.note}>
                <Ionicons name={withAccountStep ? 'lock-closed-outline' : 'wallet-outline'} size={14} color={colors.muted} />
                <Text style={[styles.noteText, { color: colors.muted }]}>
                  {withAccountStep ? t('onboarding.lockNote') : accountCount === 1 ? t('onboarding.accountsNoteOne') : t('onboarding.accountsNote', { n: accountCount })}
                </Text>
              </View>
            </ScrollView>
          )
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingBottom: 110 }}>
            {opsLoading ? (
              <View style={styles.grid} accessible accessibilityLabel={t('onboarding.loading')} accessibilityState={{ busy: true }}>
                {Array.from({ length: DEFAULT_OPERATORS }, (_, i) => (
                  <View key={i} style={[styles.op, { width: tileW, backgroundColor: colors.surface }]}>
                    <View style={[styles.skelLogo, { backgroundColor: colors.surface2 }]} />
                    <View style={[styles.skelName, { backgroundColor: colors.surface2 }]} />
                  </View>
                ))}
              </View>
            ) : opList.length || intlList.length ? (
              <>
                {opList.length ? <View style={styles.grid}>{opList.map(opTile)}</View> : null}
                {intlList.length ? (
                  <>
                    <Text style={[styles.grp, { color: colors.muted }]}>{t('accounts.group.international')}</Text>
                    <View style={styles.grid}>{intlList.map(opTile)}</View>
                  </>
                ) : null}
              </>
            ) : query.trim() ? (
              <Text style={[styles.empty, { color: colors.muted }]}>{t('onboarding.noResult')}</Text>
            ) : null}
            {!query.trim() && showSearchAll(opCount, opList.length) ? (
              <Pressable
                onPress={focusSearch}
                accessibilityRole="button"
                style={({ pressed }) => [styles.searchAll, pressed && { backgroundColor: colors.surface2 }]}
              >
                <Ionicons name="search" size={18} color={colors.link} />
                <Text numberOfLines={1} style={[styles.searchAllText, { color: colors.link }]}>{t('accountForm.searchAll', { n: opCount })}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => openAccount({ type: 'PHYSICAL' })}
              accessibilityRole="button"
              style={[styles.cash, { backgroundColor: colors.surface }]}
            >
              <LogoTile icon="cash-outline" name={t('onboarding.cash')} color={colors.muted} size={40} />
              <Text style={[styles.cashName, { color: colors.ink }]}>{t('onboarding.cash')}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          </ScrollView>
        )}
      </View>

      {foot ? <View style={[styles.foot, { backgroundColor: colors.bg }]}>{foot}</View> : null}
    </SafeAreaView>
  )
}

function PrimaryButton({ label, onPress, disabled, colors }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, { backgroundColor: disabled ? colors.surface2 : pressed ? colors.primary600 : colors.primary }]}
    >
      <Text style={[styles.btnText, { color: disabled ? colors.muted : colors.primaryInk }]}>{label}</Text>
    </Pressable>
  )
}

function TonalButton({ label, onPress, colors }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.surface2 }]}>
      <Text style={[styles.btnText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  )
}

function TextButton({ label, onPress, colors }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.btn}>
      <Text style={[styles.btnText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingTop: 8, paddingLeft: 4, flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  steps: { flex: 1, flexDirection: 'row', gap: 6, paddingRight: 20, paddingLeft: 8 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  h2: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  search: { height: 52, marginHorizontal: 16, marginBottom: 8, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 14 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, padding: 0 },
  body: { flex: 1 },
  grp: { fontFamily: fonts.semibold, fontSize: 13, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  crow: { height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cname: { flex: 1, fontSize: 15 },
  ccode: { fontFamily: fonts.regular, fontSize: 12 },
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  sign: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  curName: { fontFamily: fonts.semibold, fontSize: 16 },
  curCode: { fontFamily: fonts.regular, fontSize: 13 },
  radio: { width: 22, height: 22, borderRadius: radius.pill },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 4 },
  noteText: { fontFamily: fonts.regular, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  op: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 8, borderRadius: 18, alignItems: 'center', gap: 8 },
  skelLogo: { width: 48, height: 48, borderRadius: Math.round(48 * 0.28) },
  skelName: { width: '70%', height: 12, marginVertical: 2, borderRadius: radius.pill },
  opName: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  searchAll: { marginHorizontal: 16, marginTop: 4, minHeight: 48, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchAllText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
  empty: { fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  cash: { marginHorizontal: 16, marginTop: 12, minHeight: 64, paddingHorizontal: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cashName: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, flexDirection: 'row', gap: 12 },
  btn: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
})
