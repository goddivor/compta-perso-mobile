// Row of account chips with the operator logo ("all" chip first), shared by
// Stats and Report. `selected` = account ids, [] = all accounts. `multi`
// toggles several accounts; otherwise a tap selects one (tap again = all).
// onChange(ids) always receives the new selection. Same box as the v2 Chip,
// but a selected account keeps its logo (only the tint changes).
import { memo, useCallback } from 'react'
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { LogoTile } from '../components/v2'
import { chipStyles } from '../components/v2/Chip'

function AccountChip({ label, selected, onPress, leading }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        chipStyles.chip,
        { paddingLeft: 8 },
        selected
          ? { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }
          : { backgroundColor: pressed ? colors.surface2 : 'transparent', borderColor: colors.line },
      ]}
    >
      <View>{leading}</View>
      <Text numberOfLines={1} style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 13, color: selected ? colors.ink : colors.content }}>
        {label}
      </Text>
    </Pressable>
  )
}

export const AccountChips = memo(function AccountChips({ accounts, selected, onChange, allLabel, multi = false }) {
  const { colors } = useTheme()
  const toggle = useCallback(
    (id) => {
      if (multi) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
      else onChange(selected.length === 1 && selected[0] === id ? [] : [id])
    },
    [multi, selected, onChange]
  )
  const all = selected.length === 0
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      <AccountChip
        label={allLabel}
        selected={all}
        onPress={() => onChange([])}
        leading={all ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : <View style={styles.noLead} />}
      />
      {accounts.map((a) => (
        <AccountChip
          key={a.id}
          label={a.name}
          selected={selected.includes(a.id)}
          onPress={() => toggle(a.id)}
          leading={
            <LogoTile size={20} operatorId={a.operator_id} name={a.name} color={a.color} icon={a.type === 'PHYSICAL' ? 'cash-outline' : undefined} />
          }
        />
      ))}
    </ScrollView>
  )
})

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  noLead: { width: 0, height: 0, marginLeft: -4 },
})
