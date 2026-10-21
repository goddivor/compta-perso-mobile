// Confirmation dialog for every delete, restore, pull or reset: icon inline
// with the title, one line of body (the item concerned), Cancel + the action.
// tone 'danger' (red action, default) or 'primary' (yellow action).
import { Modal, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts, radius } from '../../theme/tokens'
import { useT } from '../../i18n'

export function ConfirmDialog({ visible, title, body, icon = 'trash-outline', tone = 'danger', confirmLabel, cancelLabel, onConfirm, onCancel, busy = false }) {
  const { colors } = useTheme()
  const t = useT()
  const danger = tone === 'danger'
  const iconBg = danger ? colors.dangerSoft : colors.primarySoft
  const iconFg = danger ? colors.danger : colors.ink
  const actBg = danger ? colors.dangerSoft : colors.primary
  const actFg = danger ? colors.danger : colors.primaryInk
  return (
    <Modal visible={!!visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={busy ? undefined : onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} accessibilityLabel={cancelLabel ?? t('common.cancel')} />
        <View accessibilityRole="alert" style={[styles.dialog, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            {icon ? (
              <View style={[styles.icon, { backgroundColor: iconBg }]}>
                <Ionicons name={icon} size={20} color={iconFg} />
              </View>
            ) : null}
            <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          </View>
          {body ? <Text style={[styles.body, { color: colors.content }]}>{body}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.btn, pressed && { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.btnText, { color: colors.ink }]}>{cancelLabel ?? t('common.cancel')}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.btn, { backgroundColor: actBg, opacity: pressed ? 0.85 : 1 }]}>
              {busy ? <ActivityIndicator size="small" color={actFg} /> : <Text style={[styles.btnText, { color: actFg }]}>{confirmLabel ?? t('common.delete')}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  dialog: { borderRadius: radius.sheet, padding: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 14, marginTop: 12, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 22 },
  btn: { height: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 14 },
})
