// Minimal i18n: flat dictionaries (fr = reference, en), simple {x}
// interpolation, language persisted in AsyncStorage ('system' | 'fr' | 'en',
// default 'system'), system detection via expo-localization with a French
// fallback. The provider also keeps the date/number locale of utils/format
// in sync so every formatted date/amount follows the active language.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import { setFormatLocale } from '../utils/format'
import fr from './fr'
import en from './en'

const LANGUAGE_KEY = 'app_language' // 'system' | 'fr' | 'en'
const DICTS = { fr, en }
const LOCALES = { fr: 'fr-FR', en: 'en-US' }

// Language of the phone, restricted to the supported ones (fallback: fr)
export function systemLanguage() {
  try {
    const code = getLocales()[0]?.languageCode
    return DICTS[code] ? code : 'fr'
  } catch {
    return 'fr'
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

export function t(key, vars) {
  const str = DICTS[currentLang][key] ?? fr[key] ?? key
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
        const str = DICTS[lang][key] ?? fr[key] ?? key
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
