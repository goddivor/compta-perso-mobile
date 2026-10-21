// Category create/edit form: name, icon (suggested from the name, or picked in
// a grid, or none = the initial), flow (DEBIT/CREDIT/BOTH) and colour.
// With `route.params.id` the existing category is loaded and updated;
// without it a new one is created.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { getCategory, createCategory, updateCategory, deleteCategory } from '../db/database'
import { useRefresh } from '../context/AppContext'
import { useT } from '../i18n'
import { Field, Input, Segmented, Button } from '../components/ui'
import { ConfirmDialog } from '../components/v2'

// Category colours are user data, not theme colours
const COLORS = [
  '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#06B6D4',
  '#14B8A6', '#22C55E', '#84CC16', '#F97316', '#64748B', '#6B7280',
]

// Ionicons outline names offered in the picker
const ICONS = [
  'restaurant-outline', 'cafe-outline', 'fast-food-outline', 'pizza-outline', 'beer-outline', 'cart-outline',
  'basket-outline', 'bag-handle-outline', 'shirt-outline', 'car-outline', 'bus-outline', 'bicycle-outline',
  'airplane-outline', 'train-outline', 'speedometer-outline', 'home-outline', 'bed-outline', 'construct-outline',
  'flash-outline', 'water-outline', 'flame-outline', 'wifi-outline', 'phone-portrait-outline', 'call-outline',
  'laptop-outline', 'globe-outline', 'tv-outline', 'receipt-outline', 'document-text-outline', 'card-outline',
  'cash-outline', 'wallet-outline', 'briefcase-outline', 'trending-up-outline', 'business-outline', 'school-outline',
  'book-outline', 'medkit-outline', 'fitness-outline', 'heart-outline', 'paw-outline', 'happy-outline',
  'gift-outline', 'film-outline', 'game-controller-outline', 'musical-notes-outline', 'football-outline', 'camera-outline',
  'people-outline', 'person-outline', 'hourglass-outline', 'help-circle-outline', 'sparkles-outline', 'star-outline',
  'umbrella-outline', 'leaf-outline', 'build-outline', 'ellipsis-horizontal',
]

// Keyword (FR and EN, lowercase, no accents) → icons, best first
const SUGGESTIONS = [
  [['nourriture', 'repas', 'resto', 'restaurant', 'manger', 'food', 'meal', 'dejeuner', 'diner'], ['restaurant-outline', 'fast-food-outline']],
  [['courses', 'marche', 'grocery', 'groceries', 'supermarche'], ['cart-outline', 'basket-outline']],
  [['cafe', 'coffee', 'boisson', 'drink'], ['cafe-outline', 'beer-outline']],
  [['essence', 'carburant', 'fuel', 'gas', 'gasoil'], ['speedometer-outline', 'car-outline']],
  [['facture', 'factures', 'electricite', 'bill', 'bills', 'electricity', 'cie', 'ceet'], ['receipt-outline', 'flash-outline']],
  [['eau', 'water'], ['water-outline']],
  [['transport', 'taxi', 'moto', 'zemidjan', 'voiture', 'car', 'uber'], ['car-outline', 'bus-outline']],
  [['bus', 'train'], ['bus-outline', 'train-outline']],
  [['voyage', 'mission', 'vol', 'trip', 'travel', 'flight'], ['airplane-outline']],
  [['sante', 'medecin', 'pharmacie', 'medicament', 'health', 'doctor', 'hopital'], ['medkit-outline', 'fitness-outline']],
  [['salaire', 'paie', 'salary', 'wage', 'revenu', 'income'], ['briefcase-outline', 'cash-outline']],
  [['loyer', 'rent', 'maison', 'logement', 'home', 'house'], ['home-outline']],
  [['recharge', 'forfait', 'credit telephone', 'airtime', 'phone', 'telephone'], ['phone-portrait-outline', 'call-outline']],
  [['internet', 'wifi', 'connexion', 'data'], ['wifi-outline', 'globe-outline', 'laptop-outline']],
  [['loisir', 'loisirs', 'cinema', 'film', 'sortie', 'fun', 'movie'], ['film-outline', 'game-controller-outline']],
  [['jeu', 'jeux', 'game', 'games'], ['game-controller-outline']],
  [['musique', 'music'], ['musical-notes-outline']],
  [['sport', 'gym', 'football'], ['football-outline', 'fitness-outline']],
  [['don', 'cadeau', 'gift', 'donation', 'aumone'], ['gift-outline', 'heart-outline']],
  [['ecole', 'scolarite', 'etude', 'school', 'tuition', 'formation', 'livre', 'book'], ['school-outline', 'book-outline']],
  [['vetement', 'habit', 'clothes', 'clothing', 'mode'], ['shirt-outline']],
  [['enfant', 'bebe', 'baby', 'kid'], ['happy-outline']],
  [['animal', 'chien', 'chat', 'pet'], ['paw-outline']],
  [['epargne', 'economie', 'investissement', 'saving', 'savings', 'invest'], ['trending-up-outline', 'wallet-outline']],
  [['avance', 'dette', 'pret', 'loan', 'debt', 'advance'], ['hourglass-outline']],
  [['participation', 'famille', 'family', 'amis', 'tontine'], ['people-outline']],
  [['perdu', 'lost', 'inconnu'], ['help-circle-outline']],
  [['reparation', 'repair', 'entretien', 'maintenance'], ['construct-outline']],
  [['autre', 'autres', 'other', 'divers', 'misc'], ['ellipsis-horizontal']],
]

const normalize = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Up to 4 icons proposed from the name; empty when no keyword matches
export function suggestIcons(name) {
  const text = normalize(name)
  if (!text) return []
  const words = text.split(/[^a-z0-9]+/).filter(Boolean)
  const out = []
  for (const [keywords, icons] of SUGGESTIONS) {
    const hit = keywords.some((k) => (k.includes(' ') ? text.includes(k) : words.some((w) => w === k || (w.length >= 4 && k.startsWith(w)))))
    if (!hit) continue
    for (const i of icons) if (!out.includes(i)) out.push(i)
    if (out.length >= 4) break
  }
  return out.slice(0, 4)
}

function IconTile({ name, selected, color, onPress, label }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? name}
      accessibilityState={{ selected }}
      style={[
        styles.tile,
        { backgroundColor: selected ? colors.primarySoft : colors.surface2, borderColor: selected ? colors.primary : 'transparent' },
      ]}
    >
      <Ionicons name={name} size={22} color={selected ? color : colors.content} />
    </Pressable>
  )
}

export default function CategoryFormScreen({ navigation, route }) {
  const { colors } = useTheme()
  const t = useT()
  const refresh = useRefresh()
  const categoryId = route.params?.id ?? null
  const [category, setCategory] = useState(null)
  const [form, setForm] = useState({ name: '', flow: 'DEBIT', color: COLORS[0], icon: null })
  const [confirming, setConfirming] = useState(false)
  const leaving = useRef(false) // "Enregistrer" already ran: a second tap cannot create twice
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!categoryId) return
    const c = getCategory(categoryId)
    if (!c) return
    setCategory(c)
    setForm({ name: c.name, flow: c.flow, color: c.color || COLORS[0], icon: c.icon || null })
  }, [categoryId])

  // Header title: creation vs edition
  useLayoutEffect(() => {
    navigation.setOptions({ title: categoryId ? t('nav.categoryEdit') : t('nav.category') })
  }, [navigation, categoryId, t])

  const suggestions = useMemo(() => suggestIcons(form.name), [form.name])
  // A category colour outside the palette (older data) stays selectable
  const palette = COLORS.includes(form.color) ? COLORS : [form.color, ...COLORS]

  const save = () => {
    if (leaving.current) return
    leaving.current = true
    const data = { name: form.name.trim(), flow: form.flow, color: form.color, icon: form.icon || null }
    try {
      if (category) updateCategory({ id: category.id, ...data })
      else createCategory(data)
    } catch (e) { leaving.current = false; throw e }
    refresh()
    navigation.goBack()
  }

  const doDelete = () => {
    deleteCategory(category.id)
    setConfirming(false)
    refresh()
    navigation.goBack()
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label={t('categoryForm.name')}>
          <Input value={form.name} onChangeText={(v) => set('name', v)} placeholder={t('categoryForm.namePlaceholder')} />
        </Field>

        <Field label={t('categoryForm.icon')}>
          {suggestions.length > 0 ? (
            <View style={styles.grid}>
              {suggestions.map((i) => (
                <IconTile key={`s-${i}`} name={i} color={form.color} selected={form.icon === i} onPress={() => set('icon', i)} />
              ))}
            </View>
          ) : null}
          <View style={styles.grid}>
            <Pressable
              onPress={() => set('icon', null)}
              accessibilityRole="button"
              accessibilityState={{ selected: !form.icon }}
              style={[
                styles.none,
                { backgroundColor: !form.icon ? colors.primarySoft : colors.surface2, borderColor: !form.icon ? colors.primary : 'transparent' },
              ]}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: !form.icon ? colors.ink : colors.content }}>
                {t('categoryForm.noIcon')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {ICONS.map((i) => (
              <IconTile key={i} name={i} color={form.color} selected={form.icon === i} onPress={() => set('icon', i)} />
            ))}
          </View>
        </Field>

        <Field label={t('categoryForm.color')}>
          <View style={styles.grid}>
            {palette.map((c) => (
              <Pressable
                key={c}
                onPress={() => set('color', c)}
                accessibilityRole="button"
                accessibilityState={{ selected: form.color === c }}
                style={[styles.swatch, { backgroundColor: c }, form.color === c && { borderWidth: 3, borderColor: colors.ink }]}
              >
                {form.color === c ? <Ionicons name="checkmark" size={16} color={colors.surface} /> : null}
              </Pressable>
            ))}
          </View>
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

        <Button title={t('common.save')} onPress={save} disabled={!form.name.trim()} style={{ marginTop: 4 }} />
        {category ? (
          <Button title={t('categoryForm.delete')} variant="danger" icon="trash-outline" onPress={() => setConfirming(true)} />
        ) : null}
      </ScrollView>
      <ConfirmDialog
        visible={confirming}
        title={t('categories.deleteTitle')}
        body={category ? t('categories.deleteMsg', { name: category.name }) : ''}
        confirmLabel={t('common.delete')}
        onConfirm={doDelete}
        onCancel={() => setConfirming(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 18, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 48, height: 48, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  none: { height: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
