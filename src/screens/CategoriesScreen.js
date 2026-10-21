// Categories management sub-screen (from Settings): one row per category with
// its icon, name and flow, a yellow pencil (edit) and a red bin (delete,
// confirmed first). Adding is the floating "+" button.
import { useCallback, useLayoutEffect, useState } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { listCategories, deleteCategory } from '../db/database'
import { useApp } from '../context/AppContext'
import { useFocusData } from '../hooks/useFocusData'
import { useT } from '../i18n'
import { Fab, EmptyState, CategoryIcon, ConfirmDialog } from '../components/v2'

const FLOW_KEYS = { DEBIT: 'flow.debit', CREDIT: 'flow.credit', BOTH: 'flow.both' }

export default function CategoriesScreen({ navigation }) {
  const { colors } = useTheme()
  const t = useT()
  const { tick, refresh } = useApp()
  const [categories, setCategories] = useState([])
  const [toDelete, setToDelete] = useState(null)

  // The "+" is the floating button: drop the one of the navigation header
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => null })
  }, [navigation])

  useFocusData(() => setCategories(listCategories()), [tick])

  const openEdit = useCallback((c) => navigation.navigate('CategoryForm', { id: c.id }), [navigation])

  const doDelete = useCallback(() => {
    if (toDelete) {
      deleteCategory(toDelete.id)
      refresh()
    }
    setToDelete(null)
  }, [toDelete, refresh])

  const renderItem = useCallback(
    ({ item: c }) => (
      <View style={styles.row}>
        <CategoryIcon icon={c.icon} name={c.name} color={c.color} size={40} />
        <View style={styles.main}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{c.name}</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            {FLOW_KEYS[c.flow] ? t(FLOW_KEYS[c.flow]) : c.flow}
          </Text>
        </View>
        <Pressable
          onPress={() => openEdit(c)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('categories.edit')}
          style={({ pressed }) => [styles.act, pressed && { backgroundColor: colors.primarySoft }]}
        >
          <Ionicons name="pencil-outline" size={20} color={colors.primary600} />
        </Pressable>
        <Pressable
          onPress={() => setToDelete(c)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
          style={({ pressed }) => [styles.act, pressed && { backgroundColor: colors.dangerSoft }]}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>
    ),
    [colors, openEdit, t]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <FlatList
        data={categories}
        keyExtractor={(c) => String(c.id)}
        renderItem={renderItem}
        contentContainerStyle={{ flexGrow: 1, paddingTop: 8, paddingBottom: 96 }}
        ListEmptyComponent={<EmptyState icon="pricetags-outline" title={t('categories.empty')} />}
      />
      <Fab onPress={() => navigation.navigate('CategoryForm')} accessibilityLabel={t('common.add')} />
      <ConfirmDialog
        visible={!!toDelete}
        title={t('categories.deleteTitle')}
        body={toDelete ? t('categories.deleteMsg', { name: toDelete.name }) : ''}
        confirmLabel={t('common.delete')}
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, paddingRight: 8, paddingVertical: 10, minHeight: 64 },
  main: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 15 },
  sub: { fontFamily: fonts.regular, fontSize: 12 },
  act: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
