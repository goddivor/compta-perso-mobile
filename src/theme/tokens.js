// Goodness design tokens — mobile port of goodmarket/src/styles/tokens.css
// Two palettes (light/dark). The active scheme follows the system theme by
// default, but the user can force light or dark from the Settings screen
// (persisted in AsyncStorage, applied immediately via ThemeProvider).
// The primary yellow is CONSTANT across themes (brand signature).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const palettes = {
  light: {
    bg: '#FAF8F5',
    surface: '#FFFFFF',
    surface2: '#F3EFEA',
    ink: '#1A1714',
    content: '#4A443D',
    muted: '#807669',
    faint: '#A89E92',
    line: '#E7E1D9',

    primary: '#FFD200',
    primary600: '#E6BD00',
    primaryInk: '#1A1714',

    success: '#16A34A',
    successSoft: '#DCFCE7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    warning: '#F59E0B',
    warningSoft: '#FEF3C7',
    link: '#0B5FFF',

    // Bottom tab bar: inactive items stay PURE ink (no washed-out grey),
    // the active item is the distinct brand yellow (darkened for contrast
    // on the light surface).
    tabActive: '#E6BD00',
    tabInactive: '#1A1714',
  },
  dark: {
    bg: '#161311',
    surface: '#211C1A',
    surface2: '#2A2421',
    ink: '#F5F1EC',
    content: '#D8D2CA',
    muted: '#A89E92',
    faint: '#807669',
    line: '#352E2A',

    primary: '#FFD200',
    primary600: '#E6BD00',
    primaryInk: '#1A1714',

    success: '#16A34A',
    successSoft: '#16331F',
    danger: '#DC2626',
    dangerSoft: '#3A2020',
    warning: '#F59E0B',
    warningSoft: '#3A2E14',
    link: '#0B5FFF',

    // Bottom tab bar: inactive items in PURE white, active in brand yellow
    tabActive: '#FFD200',
    tabInactive: '#FFFFFF',
  },
}

export const radius = { sm: 6, md: 8, lg: 12, xl: 16 }

export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extrabold: 'Poppins_800ExtraBold',
}

// Soft card elevation (kept subtle, per the Goodness shadow scale)
export const shadowCard = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 3,
  elevation: 2,
}

export const shadowOverlay = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.18,
  shadowRadius: 20,
  elevation: 8,
}

/* --------------------------- Theme provider ----------------------------- */

const THEME_MODE_KEY = 'theme_mode' // 'system' | 'light' | 'dark'
const ThemeContext = createContext(null)

function buildTheme(scheme, mode, setMode) {
  const isDark = scheme === 'dark'
  return {
    mode,
    setMode,
    scheme,
    isDark,
    colors: isDark ? palettes.dark : palettes.light,
  }
}

export function ThemeProvider({ children }) {
  // useColorScheme() can briefly return null on Android — default to light
  const system = useColorScheme() || 'light'
  const [mode, setModeState] = useState('system')

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v)
    })
  }, [])

  const setMode = useCallback((m) => {
    setModeState(m)
    AsyncStorage.setItem(THEME_MODE_KEY, m).catch(() => {})
  }, [])

  const scheme = mode === 'system' ? system : mode
  const value = useMemo(() => buildTheme(scheme, mode, setMode), [scheme, mode, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

const noop = () => {}

// Every color in the app must come from here (never hard-coded).
export function useTheme() {
  const ctx = useContext(ThemeContext)
  const system = useColorScheme() || 'light'
  // Fallback (outside the provider): follow the system
  return ctx || buildTheme(system, 'system', noop)
}
