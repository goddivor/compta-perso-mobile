// Category creation form: name, flow (DEBIT/CREDIT/BOTH) and color.
import { useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { createCategory } from '../db/database'
import { useApp } from '../context/AppContext'
import { Field, Input, Segmented, Button } from '../components/ui'

const COLORS = [
  '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4',
  '#84CC16', '#F97316', '#10B981', '#3B82F6', '#6B7280', '#94A3B8',
]

export default function CategoryFormScreen({ navigation }) {
  const { colors } = useTheme()
  const { refresh } = useApp()
  const [form, setForm] = useState({ name: '', flow: 'DEBIT', color: COLORS[0] })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = () => {
    createCategory({ name: form.name.trim(), flow: form.flow, color: form.color })
    refresh()
    navigation.goBack()
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink, marginBottom: 4 }}>
          Nouvelle catégorie
        </Text>

        <Field label="Nom">
          <Input value={form.name} onChangeText={(v) => set('name', v)} placeholder="ex : Internet" />
        </Field>

        <Field label="Flux">
          <Segmented
            value={form.flow}
            onChange={(v) => set('flow', v)}
            segments={[
              { label: 'Débit', value: 'DEBIT' },
              { label: 'Crédit', value: 'CREDIT' },
              { label: 'Les deux', value: 'BOTH' },
            ]}
          />
        </Field>

        <Field label="Couleur">
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
          <Button title="Annuler" variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
          <Button title="Enregistrer" onPress={save} disabled={!form.name.trim()} style={{ flex: 1.4 }} />
        </View>
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
