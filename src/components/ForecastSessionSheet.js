// Bottom sheet to create or rename a forecast session: name (required)
// and an optional description. Shared by the forecast list screen (FAB)
// and the session detail screen (header edit).
// API: <ForecastSessionSheet visible session onClose onSubmit />
//  - `session` null/undefined = creation, otherwise edition
//  - `onSubmit({ name, description })` is called on save
import { useEffect, useState } from 'react'
import { View, Text, Modal, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { useTheme, radius, fonts, shadowOverlay } from '../theme/tokens'
import { useT } from '../i18n'
import { Field, Input, Button } from './ui'

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

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ name: trimmed, description: description.trim() || null })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, shadowOverlay, { backgroundColor: colors.surface, borderColor: colors.line }]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: colors.line }]} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.ink }}>
              {session ? t('forecast.editSession') : t('forecast.newSession')}
            </Text>

            <Field label={t('forecast.sessionNameLabel')}>
              <Input
                value={name}
                onChangeText={setName}
                placeholder={t('forecast.sessionNamePlaceholder')}
                autoFocus
              />
            </Field>

            <Field label={t('forecast.sessionDescription')}>
              <Input
                multiline
                value={description}
                onChangeText={setDescription}
                placeholder={t('forecast.sessionDescriptionPlaceholder')}
              />
            </Field>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Button title={t('common.cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
              <Button title={t('common.save')} onPress={submit} disabled={!name.trim()} style={{ flex: 1.4 }} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 30,
    gap: 14,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
})
