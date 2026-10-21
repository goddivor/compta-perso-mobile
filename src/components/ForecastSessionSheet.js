// Bottom sheet to create or rename a forecast session: name (required)
// and a description. Shared by the forecast list screen (FAB) and the
// session detail screen (app bar pencil).
// API: <ForecastSessionSheet visible session onClose onSubmit />
//  - `session` null/undefined = creation, otherwise edition
//  - `onSubmit({ name, description })` is called on save
import { useEffect, useState } from 'react'
import { View, Text, Modal, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { useTheme, radius, fonts } from '../theme/tokens'
import { useT } from '../i18n'
import { Field, Input } from './ui'

export default function ForecastSessionSheet({ visible, session, onClose, onSubmit }) {
  const { colors } = useTheme()
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Refill the fields every time the sheet opens
  useEffect(() => {
    if (!visible) return
    setName(session?.name || '')
    setDescription(session?.description || '')
  }, [visible, session])

  const canSave = !!name.trim()

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, description: description.trim() || null })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: colors.line }]} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 20, color: colors.ink }}>
              {session ? t('forecast.editSession') : t('forecast.newSession')}
            </Text>

            <Field label={t('forecast.sessionNameLabel')}>
              <Input value={name} onChangeText={setName} autoFocus />
            </Field>

            <Field label={t('forecast.sessionDescription')}>
              <Input multiline value={description} onChangeText={setDescription} />
            </Field>

            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, pressed && { backgroundColor: colors.surface2 }]}
              >
                <Text style={[styles.btnText, { color: colors.ink }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!canSave}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: pressed ? colors.primary600 : colors.primary, opacity: canSave ? 1 : 0.45 },
                ]}
              >
                <Text style={[styles.btnText, { color: colors.primaryInk }]}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 20,
    paddingBottom: 28,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btn: { height: 44, minWidth: 64, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 14 },
})
