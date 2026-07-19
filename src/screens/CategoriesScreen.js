// Categories management sub-screen (from Settings): list rows with color,
// flow and a delete action. The "+" in the navigation header opens the
// category creation form.
import { useCallback, useState } from 'react'
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../theme/tokens'
import { listCategories, deleteCategory } from '../db/database'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { EmptyState, Dot } from '../components/ui'

const FLOW_KEYS = { DEBIT: 'flow.debit', CREDIT: 'flow.credit', BOTH: 'flow.both' }

export default function CategoriesScreen() {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const [categories, setCategories] = useState([])

  useFocusData(() => setCategories(listCategories()), [tick])

  const confirmDelete = useCallback(
    (c) => {
      Alert.alert(
        t('categories.deleteTitle', { name: c.name }),
        t('categories.deleteMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.delete'), style: 'destructive', onPress: () => { deleteCategory(c.id); refresh() } },
        ]
      )
    },
    [refresh, t]
  )

  const keyExtractor = useCallback((c) => String(c.id), [])
  const renderItem = useCallback(
    ({ item: c, index }) => (
      <View
        style={[
          styles.rowWrap,
          { backgroundColor: colors.surface, borderColor: colors.line },
          index === 0 && styles.first,
          index === categories.length - 1 && styles.last,
        ]}
      >
        {index > 0 ? <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 16 }} /> : null}
        <View style={styles.row}>
          <Dot color={c.color} size={12} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{c.name}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
              {FLOW_KEYS[c.flow] ? t(FLOW_KEYS[c.flow]) : c.flow}
            </Text>
          </View>
          <Pressable
            onPress={() => confirmDelete(c)}
            hitSlop={8}
            style={({ pressed }) => [styles.trashBtn, { backgroundColor: pressed ? colors.dangerSoft : 'transparent' }]}
          >
            <Ionicons name="trash-outline" size={17} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    ),
    [categories.length, colors, confirmDelete, t]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <FlatList
        data={categories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 16 }}
        ListEmptyComponent={<EmptyState icon="pricetags-outline" text={t('categories.empty')} />}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  rowWrap: {
    marginHorizontal: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1 },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderBottomWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 54,
  },
  trashBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
