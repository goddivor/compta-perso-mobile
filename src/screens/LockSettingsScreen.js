// Lock settings (Settings › Sécurité › Verrouillage), mockup app-lock.html.
// Off by default. Turning the lock on needs a phone screen lock (else the
// « Verrouillage d'écran requis » dialog), then opens the creation of a PIN
// (default method); the lock is on only once the code is confirmed. Turning
// the lock off, changing the method or the code and turning the fingerprint
// off ask for the current code first (or the fingerprint, except for turning
// the lock off). The fingerprint needs a PIN or pattern and a fingerprint
// enrolled on the phone; turning it on asks for one. « Masquer l'aperçu »
// (FLAG_SECURE, off by default) works whether the lock is on or not. All of
// it stays on this phone (secure store), never in sync or the Drive backup.
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, Modal, Alert, AppState, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../theme/tokens'
import { useT } from '../i18n'
import { useLock } from '../context/LockContext'
import { SettingsRow, RowSeparator, SectionCard } from '../components/SettingsRow'
import { ConfirmDialog, Select } from '../components/v2'
import { LockSwitch } from '../components/lock/LockKit'
import { CodeSetup } from '../components/lock/CodeSetup'
import { UnlockFlow } from '../components/lock/UnlockFlow'
import { setSecret, clearSecret, resetAttempts, DELAYS_MS } from '../lock/store'
import { hasDeviceLock, hasStrongBiometrics, promptFingerprint, openSecuritySettings } from '../lock/device'

function SwitchRow({ icon, title, value, onPress, disabled = false }) {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: !!value, disabled }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }, disabled && styles.dis]}
    >
      <View style={[styles.tile, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={20} color={colors.content} />
      </View>
      <Text style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>
      <LockSwitch value={value} disabled={disabled} />
    </Pressable>
  )
}

function MethodSeg({ value, onChange, disabled }) {
  const { colors } = useTheme()
  const t = useT()
  const opts = [
    { v: 'pin', icon: 'keypad-outline', label: t('lock.pin') },
    { v: 'pattern', icon: 'analytics-outline', label: t('lock.pattern') },
  ]
  return (
    <View accessibilityRole="radiogroup" style={[styles.seg, { borderColor: colors.line }, disabled && styles.dis]}>
      {opts.map((o) => {
        const on = !disabled && value === o.v
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            style={[styles.segItem, on && { backgroundColor: colors.primarySoft }]}
          >
            <Ionicons name={o.icon} size={18} color={on ? colors.ink : colors.content} />
            <Text style={{ fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 14, color: on ? colors.ink : colors.content }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function LockSettingsScreen() {
  const { colors } = useTheme()
  const t = useT()
  const { config, updateConfig, reloadConfig } = useLock()
  const isFocused = useIsFocused()
  const [fpAvailable, setFpAvailable] = useState(false)
  const [noLock, setNoLock] = useState(false)
  // Full-screen step: { kind: 'verify', allowFingerprint, then } | { kind: 'setup', method, then }
  const [flow, setFlow] = useState(null)
  const flowBack = useRef(null)
  const on = config.enabled

  // Fingerprint availability, re-read on focus and on return to the app
  // (the user may enrol a finger in the phone settings meanwhile)
  const checkFp = useCallback(() => { hasStrongBiometrics().then(setFpAvailable) }, [])
  useEffect(() => { if (isFocused) checkFp() }, [isFocused, checkFp])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') checkFp() })
    return () => sub.remove()
  }, [checkFp])

  const close = () => setFlow(null)
  const saveFailed = () => Alert.alert(t('common.error'), t('lock.saveError'))
  const save = (patch) => { if (!updateConfig(patch)) saveFailed() }

  const verify = (then, allowFingerprint = true) => setFlow({ kind: 'verify', allowFingerprint, then })
  const setup = (method, then) => setFlow({ kind: 'setup', method, then })

  // Stores the new code of `method`, then applies the settings patch
  const storeCode = (method, value, patch) => {
    try {
      setSecret(method, value)
      resetAttempts()
    } catch {
      close()
      return saveFailed()
    }
    save(patch)
    reloadConfig()
    close()
  }

  const toggleLock = async () => {
    if (!on) {
      if (!(await hasDeviceLock())) return setNoLock(true)
      const method = config.method || 'pin'
      return setup(method, (value) => storeCode(method, value, { enabled: true, method, fingerprint: false }))
    }
    verify(async () => {
      close()
      try {
        await clearSecret()
      } catch {
        return saveFailed()
      }
      save({ enabled: false, fingerprint: false })
    }, false)
  }

  const pickMethod = (method) => {
    if (!on || method === config.method) return
    verify(() => setup(method, (value) => storeCode(method, value, { method })))
  }

  const toggleFingerprint = async () => {
    if (!config.fingerprint) {
      const res = await promptFingerprint({ title: t('lock.promptTitle'), cancelLabel: t('common.cancel') })
      if (res === 'success') save({ fingerprint: true })
      return
    }
    verify(() => { close(); save({ fingerprint: false }) })
  }

  const changeCode = () => verify(() => setup(config.method, (value) => storeCode(config.method, value, {})))

  const delayOptions = DELAYS_MS.map((ms) => ({
    value: ms,
    label: ms === 0 ? t('lock.immediately') : t('lock.minutes', { n: ms / 60e3 }),
  }))
  const isPattern = config.method === 'pattern'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <SectionCard>
          <SwitchRow icon="lock-closed-outline" title={t('lock.enable')} value={on} onPress={toggleLock} />
        </SectionCard>

        <View style={[styles.hSection, !on && styles.dis]}>
          <Text accessibilityRole="header" style={[styles.hTitle, { color: colors.ink }]}>{t('lock.method')}</Text>
        </View>
        <MethodSeg value={config.method} onChange={pickMethod} disabled={!on} />

        <SectionCard>
          <SwitchRow
            icon="finger-print-outline"
            title={t('lock.fingerprint')}
            value={on && config.fingerprint}
            onPress={toggleFingerprint}
            disabled={!on || (!fpAvailable && !config.fingerprint)}
          />
        </SectionCard>

        <Select
          label={t('lock.after')}
          value={config.delayMs}
          options={delayOptions}
          onChange={(v) => save({ delayMs: Number(v) })}
          placeholderLeading={<Ionicons name="timer-outline" size={20} color={colors.content} />}
          disabled={!on}
          style={{ marginHorizontal: 16 }}
        />

        <SectionCard>
          <SettingsRow
            icon={isPattern ? 'analytics-outline' : 'keypad-outline'}
            title={t(isPattern ? 'lock.changePattern' : 'lock.changePin')}
            onPress={changeCode}
            disabled={!on}
          />
          {isPattern ? (
            <>
              <RowSeparator />
              <SwitchRow
                icon="eye-off-outline"
                title={t('lock.hidePatternLine')}
                value={config.hidePatternLine}
                onPress={() => save({ hidePatternLine: !config.hidePatternLine })}
                disabled={!on}
              />
            </>
          ) : null}
          <RowSeparator />
          <SwitchRow
            icon="eye-off-outline"
            title={t('lock.hidePreview')}
            value={config.hidePreview}
            onPress={() => save({ hidePreview: !config.hidePreview })}
          />
        </SectionCard>
      </ScrollView>

      <Modal
        visible={!!flow}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => flowBack.current?.()}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {flow?.kind === 'verify' ? (
            <UnlockFlow
              key="verify"
              config={config}
              mode="verify"
              title={t('settings.lock')}
              allowFingerprint={flow.allowFingerprint}
              onSuccess={() => flow.then()}
              onCancel={close}
              backRef={flowBack}
            />
          ) : flow?.kind === 'setup' ? (
            <CodeSetup
              key={`setup-${flow.method}`}
              method={flow.method}
              hidePatternLine={config.hidePatternLine}
              onDone={flow.then}
              onCancel={close}
              backRef={flowBack}
            />
          ) : null}
        </View>
      </Modal>

      <ConfirmDialog
        visible={noLock}
        icon="phone-portrait-outline"
        tone="primary"
        title={t('lock.noDeviceLock')}
        confirmLabel={t('lock.openSettings')}
        onCancel={() => setNoLock(false)}
        onConfirm={() => { setNoLock(false); openSecuritySettings() }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  rowTitle: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dis: { opacity: 0.38 },
  hSection: { paddingHorizontal: 24, height: 32, justifyContent: 'center', marginTop: 4 },
  hTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  seg: { flexDirection: 'row', gap: 3, marginHorizontal: 16, height: 48, padding: 3, borderRadius: 24, borderWidth: 1 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 21 },
})
