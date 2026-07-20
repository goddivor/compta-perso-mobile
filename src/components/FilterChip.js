// Small filter chip that opens a bottom-sheet option list (Stats screen).
import { memo, useState } from 'react'
import { Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius, shadowOverlay } from '../theme/tokens'
import { Dot } from './ui'

export const FilterChip = memo(function FilterChip({ label, active, options, value, onChange }) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.line,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: active ? fonts.semibold : fonts.medium,
            fontSize: 12,
            color: active ? colors.primaryInk : colors.content,
            maxWidth: 120,
          }}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={12} color={active ? colors.primaryInk : colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, shadowOverlay, { backgroundColor: colors.surface, borderColor: colors.line }]}
            onPress={() => {}}
          >
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => {
                const selected = String(item.value) === String(value)
                return (
                  <Pressable
                    onPress={() => { onChange(item.value); setOpen(false) }}
                    style={({ pressed }) => [
                      styles.option,
                      { backgroundColor: selected || pressed ? colors.surface2 : 'transparent' },
                    ]}
                  >
                    {item.color ? <Dot color={item.color} size={9} /> : null}
                    <Text style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.regular, fontSize: 14, color: colors.ink }}>
                      {item.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={17} color={colors.ink} /> : null}
                  </Pressable>
                )
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
})

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: 10,
    paddingBottom: 26,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    minHeight: 48,
  },
})
