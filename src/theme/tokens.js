// Goodness design tokens — mobile port of goodmarket/src/styles/tokens.css
// Two palettes (light/dark) following the system color scheme.
// The primary yellow is CONSTANT across themes (brand signature).
import { useColorScheme } from 'react-native'

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

export function useTheme() {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  return { colors: isDark ? palettes.dark : palettes.light, isDark, scheme }
}
