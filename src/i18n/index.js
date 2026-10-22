// Minimal i18n: flat dictionaries (fr = reference, en), one file per area
// under fr/ and en/ (merged by fr.js / en.js), simple {x}
// interpolation, language persisted in AsyncStorage ('system' | 'fr' | 'en',
// default 'system'), system detection via expo-localization with an English
// fallback (a phone language other than fr/en gets English). The provider
// also keeps the date/number locale of utils/format in sync so every
// formatted date/amount follows the active language.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import { setFormatLocale } from '../utils/format'
import fr, { areas as frAreas } from './fr'
import en, { areas as enAreas } from './en'

const LANGUAGE_KEY = 'app_language' // 'system' | 'fr' | 'en'
const DICTS = { fr, en }
const LOCALES = { fr: 'fr-FR', en: 'en-US' }

// Development guard for the per-area split: a key defined in two areas, or
// present in one language only, is reported once at startup.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  for (const [lang, areas] of [['fr', frAreas], ['en', enAreas]]) {
    const seen = {}
    for (const [area, dict] of Object.entries(areas)) {
      for (const k of Object.keys(dict)) {
        if (seen[k]) console.warn(`i18n: ${lang} key "${k}" defined in both ${seen[k]} and ${area}`)
        seen[k] = area
      }
    }
  }
  const onlyIn = (a, b) => Object.keys(a).filter((k) => !(k in b))
  const missingEn = onlyIn(fr, en)
  const missingFr = onlyIn(en, fr)
  if (missingEn.length) console.warn(`i18n: missing in en: ${missingEn.join(', ')}`)
  if (missingFr.length) console.warn(`i18n: missing in fr: ${missingFr.join(', ')}`)
}

// Language of the phone, restricted to the supported ones (fallback: en)
export const FALLBACK_LANGUAGE = 'en'
export function systemLanguage() {
  try {
    const code = getLocales()[0]?.languageCode
    return DICTS[code] ? code : FALLBACK_LANGUAGE
  } catch {
    return FALLBACK_LANGUAGE
  }
}

function resolve(language) {
  return language === 'fr' || language === 'en' ? language : systemLanguage()
}

function interpolate(str, vars) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
}

// Module-level current language so non-React code (updater, sync api) can
// translate too. The provider keeps it up to date.
let currentLang = systemLanguage()
setFormatLocale(LOCALES[currentLang])

// The resolved language ('fr' | 'en') t() currently translates into
export const currentLanguage = () => currentLang

export function t(key, vars) {
  const str = DICTS[currentLang][key] ?? DICTS[FALLBACK_LANGUAGE][key] ?? key
  return interpolate(str, vars)
}

/* ---------------------------- Provider / hooks --------------------------- */

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState('system')

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then((v) => {
      if (v === 'fr' || v === 'en' || v === 'system') setLanguageState(v)
    })
  }, [])

  const setLanguage = useCallback((l) => {
    setLanguageState(l)
    AsyncStorage.setItem(LANGUAGE_KEY, l).catch(() => {})
  }, [])

  const lang = resolve(language)
  // Keep module-level state in sync BEFORE children render, so t() and the
  // date/number formatters are correct during this very render pass.
  currentLang = lang
  setFormatLocale(LOCALES[lang])

  const value = useMemo(
    () => ({
      language, // the persisted setting ('system' | 'fr' | 'en')
      lang, // the resolved language ('fr' | 'en')
      locale: LOCALES[lang],
      setLanguage,
      t: (key, vars) => {
        const str = DICTS[lang][key] ?? DICTS[FALLBACK_LANGUAGE][key] ?? key
        return interpolate(str, vars)
      },
    }),
    [language, lang, setLanguage]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

const fallback = {
  language: 'system',
  lang: currentLang,
  locale: LOCALES[currentLang],
  setLanguage: () => {},
  t,
}

export function useI18n() {
  // Outside the provider (boot screens): system language, no persistence
  return useContext(I18nContext) || fallback
}

export function useT() {
  return useI18n().t
}
