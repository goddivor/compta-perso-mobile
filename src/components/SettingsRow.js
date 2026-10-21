// Settings building blocks (v2): grouped cards of rows. A row is a neutral
// tile with a monochrome icon (or any `leading` node), a title, an optional
// data-only subtitle, and an optional chevron / trailing node. Shared by the
// hub and its sub-screens (sync, Google backup, theme, language, about).
import { memo } from 'react'
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { getFormatLocale } from '../utils/format'
import { t } from '../i18n'

const TILE = 40
const SEPARATOR_INSET = 16 + TILE + 14

// "6 oct., 05:49"
export function shortDateTime(value) {
  const d = value ? new Date(value) : null
  if (!d || isNaN(d.getTime())) return ''
  const locale = getFormatLocale()
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day}, ${time}`
}

// "19 juil. 2026, 08:36"
export function mediumDateTime(value) {
  const d = value ? new Date(value) : null
  if (!d || isNaN(d.getTime())) return ''
  const locale = getFormatLocale()
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day}, ${time}`
}

// "6 oct. 2026 à 05:49"
export function longDateTime(value) {
  const d = value ? new Date(value) : null
  if (!d || isNaN(d.getTime())) return ''
  const locale = getFormatLocale()
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return t('settings.dateAt', { date: day, time })
}

// A titled group: small heading above a rounded card (no card when empty)
export function SectionCard({ title, children, style }) {
  const { colors } = useTheme()
  return (
    <View style={[{ gap: 8 }, style]}>
      {title ? <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text> : null}
      {children ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>{children}</View>
      ) : null}
    </View>
  )
}

export function RowSeparator() {
  const { colors } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: SEPARATOR_INSET }} />
}

function Tile({ icon, tone }) {
  const { colors } = useTheme()
  const danger = tone === 'danger'
  return (
    <View style={[styles.tile, { backgroundColor: danger ? colors.dangerSoft : colors.surface2 }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.content} />
    </View>
  )
}

export const SettingsRow = memo(function SettingsRow({
  icon,
  leading,
  title,
  subtitle,
  onPress,
  right,
  chevron = true,
  tone,
  loading = false,
  disabled = false,
  wrap = false, // let the title and subtitle wrap (e.g. an e-mail address)
}) {
  const { colors } = useTheme()
  const danger = tone === 'danger'
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled || loading}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.surface2 }, disabled && { opacity: 0.45 }]}
    >
      {leading || <Tile icon={icon} tone={tone} />}
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={wrap ? undefined : 1} style={{ fontFamily: fonts.medium, fontSize: 15, color: danger ? colors.danger : colors.ink }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={wrap ? undefined : 1} style={{ fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {loading ? <ActivityIndicator size="small" color={colors.muted} /> : right}
      {chevron && onPress && !loading ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Pressable>
  )
})

// Single-choice row (theme, language, frequency): radio on the right
export function RadioRow({ icon, title, subtitle, selected, onPress }) {
  const { colors } = useTheme()
  return (
    <SettingsRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      chevron={false}
      right={
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={selected ? colors.ink : colors.faint}
        />
      }
    />
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    marginHorizontal: 24,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: radius.xxl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
