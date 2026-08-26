// Category create/edit form: name, flow (DEBIT/CREDIT/BOTH) and color.
// With `route.params.id` the existing category is loaded and updated;
// without it a new one is created (same pattern as AccountFormScreen).
import { useEffect, useLayoutEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { getCategory, createCategory, updateCategory, deleteCategory } from '../db/database'
import { useRefresh } from '../context/AppContext'
import { useT } from '../i18n'
import { Field, Input, Segmented, Button } from '../components/ui'

const COLORS = [
  '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4',
  '#84CC16', '#F97316', '#10B981', '#3B82F6', '#6B7280', '#94A3B8',
]

export default function CategoryFormScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const refresh = useRefresh()
  const categoryId = route.params?.id ?? null
  const [category, setCategory] = useState(null)
  const [form, setForm] = useState({ name: '', flow: 'DEBIT', color: COLORS[0] })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!categoryId) return
    const c = getCategory(categoryId)
    if (!c) return
    setCategory(c)
    setForm({ name: c.name, flow: c.flow, color: c.color || COLORS[0] })
  }, [categoryId])

  // Header title: creation vs edition
  useLayoutEffect(() => {
    navigation.setOptions({ title: categoryId ? t('nav.categoryEdit') : t('nav.category') })
  }, [navigation, categoryId, t])

  const save = () => {
    const data = { name: form.name.trim(), flow: form.flow, color: form.color }
    if (category) updateCategory({ id: category.id, ...data })
    else createCategory(data)
    refresh()
    navigation.goBack()
  }

  const confirmDelete = () => {
    Alert.alert(
      t('categories.deleteTitle', { name: category.name }),
      t('categories.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => { deleteCategory(category.id); refresh(); navigation.goBack() },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink, marginBottom: 4 }}>
          {category ? t('categoryForm.editTitle') : t('categoryForm.title')}
        </Text>

        <Field label={t('categoryForm.name')}>
          <Input value={form.name} onChangeText={(v) => set('name', v)} placeholder={t('categoryForm.namePlaceholder')} />
        </Field>

        <Field label={t('categoryForm.flow')}>
          <Segmented
            value={form.flow}
            onChange={(v) => set('flow', v)}
            segments={[
              { label: t('flow.debit'), value: 'DEBIT' },
              { label: t('flow.credit'), value: 'CREDIT' },
              { label: t('categoryForm.both'), value: 'BOTH' },
            ]}
          />
        </Field>

        <Field label={t('categoryForm.color')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => set('color', c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  form.color === c && { borderWidth: 3, borderColor: colors.ink },
                ]}
              >
                {form.color === c ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
              </Pressable>
            ))}
          </View>
        </Field>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button title={t('common.cancel')} variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <Button title={t('common.save')} onPress={save} disabled={!form.name.trim()} style={{ flex: 1.4 }} />
        </View>
        {category ? (
          <Button title={t('categoryForm.delete')} variant="danger" icon="trash-outline" onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
