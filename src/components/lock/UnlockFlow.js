// Code check, used by the lock screen (mode 'unlock': app mark, no app bar)
// and before a protected change in the lock settings (mode 'verify': app bar
// with a back arrow). A PIN is checked as soon as its last digit is typed; a
// pattern on release. Each failure shows the error with the shake; 5
// failures start a wait (30 s, 1, 2, 5, 15 min, kept across restarts) during
// which the keypad is disabled but the fingerprint and « Code oublié ? » stay
// available. A forgotten code opens the phone's own screen lock, then the
// creation of a new code of the same method (settings unchanged); without a
// phone screen lock, a dialog points to the Android settings. Never a reset.
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme, fonts } from '../../theme/tokens'
import { useT } from '../../i18n'
import { ConfirmDialog } from '../v2'
import { verifySecret, lockoutRemaining, resetAttempts, setSecret, PATTERN_MIN } from '../../lock/store'
import { hasStrongBiometrics, promptFingerprint, promptDeviceCredential, openSecuritySettings } from '../../lock/device'
import { AppMark, FlowAppbar, FlowLabel, Keypad, PatternGrid, PinDots, useShake } from './LockKit'
import { CodeSetup } from './CodeSetup'

const ERROR_MS = 1000

function waitLabel(t, ms) {
  const s = Math.ceil(ms / 1000)
  return s > 60 ? t('lock.retryInMin', { m: Math.ceil(s / 60) }) : t('lock.retryIn', { s })
}

export function UnlockFlow({
  config,
  mode = 'unlock',
  title,
  allowFingerprint = true,
  autoFingerprint = false,
  onSuccess,
  onCancel,
  backRef,
}) {
  const { colors } = useTheme()
  const t = useT()
  const isPin = config.method === 'pin'
  const total = config.pinLength || 4

  const [phase, setPhase] = useState('enter') // 'enter' | 'setup'
  const [entry, setEntry] = useState('')
  const [path, setPath] = useState(null)
  const [error, setError] = useState('') // label key
  const [checking, setChecking] = useState(false)
  const [waitMs, setWaitMs] = useState(() => lockoutRemaining())
  const [fpReady, setFpReady] = useState(false)
  const [noLock, setNoLock] = useState(false)
  const [shakeStyle, shake] = useShake()
  const timer = useRef(null)
  const setupBack = useRef(null)
  const done = useRef(false)

  useEffect(() => () => clearTimeout(timer.current), [])

  // Countdown of a running wait
  useEffect(() => {
    if (waitMs <= 0) return undefined
    const id = setInterval(() => setWaitMs(lockoutRemaining()), 1000)
    return () => clearInterval(id)
  }, [waitMs > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const succeed = useCallback((info) => {
    if (done.current) return
    done.current = true
    onSuccess?.(info)
  }, [onSuccess])

  /* ------------------------------ Fingerprint ---------------------------- */
  const cancelLabel = mode === 'verify' ? t('common.cancel') : t(isPin ? 'lock.usePin' : 'lock.usePattern')
  const fingerprint = useCallback(async () => {
    const res = await promptFingerprint({ title: t('lock.promptTitle'), cancelLabel })
    if (res === 'success') {
      try { resetAttempts() } catch { /* the unlock still applies */ }
      succeed({ via: 'fingerprint' })
    }
  }, [cancelLabel, succeed, t])

  useEffect(() => {
    if (!allowFingerprint || !config.fingerprint) return undefined
    let alive = true
    hasStrongBiometrics().then((ok) => {
      if (!alive) return
      setFpReady(ok)
      if (ok && autoFingerprint) fingerprint()
    })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* --------------------------------- Check ------------------------------- */
  const check = (value, clear) => {
    setChecking(true)
    // Let the last dot or point render before the (synchronous) hash
    setTimeout(() => {
      let res
      try {
        res = verifySecret(value)
      } catch {
        res = { ok: false, lockoutMs: 0 }
      }
      setChecking(false)
      if (res.ok) return succeed({ via: 'code' })
      setError(isPin ? 'lock.wrongPin' : 'lock.wrongPattern')
      shake()
      if (res.lockoutMs > 0) setWaitMs(res.lockoutMs)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { setError(''); clear() }, ERROR_MS)
    }, 30)
  }

  const locked = waitMs > 0
  const busy = checking || !!error || locked

  const onDigit = (d) => {
    if (busy || entry.length >= total) return
    const next = entry + d
    setEntry(next)
    if (next.length === total) check(next, () => setEntry(''))
  }
  const onDelete = () => { if (!busy) setEntry((e) => e.slice(0, -1)) }

  const onPattern = (p) => {
    if (busy) return
    setPath(p)
    if (p.length < PATTERN_MIN) {
      setError('lock.patternTooShort')
      shake()
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { setError(''); setPath(null) }, ERROR_MS)
      return
    }
    check(p.join('-'), () => setPath(null))
  }

  /* ---------------------------- Forgotten code --------------------------- */
  const forgot = async () => {
    const res = await promptDeviceCredential({ title: t('lock.promptTitle') })
    if (res === 'success') setPhase('setup')
    else if (res === 'no_lock') setNoLock(true)
  }

  const onNewCode = (value) => {
    try {
      setSecret(config.method, value)
      resetAttempts()
    } catch {
      Alert.alert(t('common.error'), t('lock.saveError'))
      return
    }
    succeed({ via: 'reset' })
  }

  const back = () => {
    if (phase === 'setup') return setupBack.current?.()
    if (mode === 'verify') onCancel?.()
  }
  if (backRef) backRef.current = back

  if (phase === 'setup') {
    return (
      <CodeSetup
        method={config.method}
        hidePatternLine={config.hidePatternLine}
        onDone={onNewCode}
        onCancel={() => setPhase('enter')}
        backRef={setupBack}
      />
    )
  }

  const label = error
    ? t(error)
    : locked
      ? waitLabel(t, waitMs)
      : t(isPin ? 'lock.enterPin' : 'lock.drawPattern')
  const tone = error ? 'error' : locked ? 'wait' : undefined
  const showFp = allowFingerprint && config.fingerprint && fpReady

  return (
    <SafeAreaView style={[styles.flow, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      {mode === 'verify' ? <FlowAppbar title={title} onBack={onCancel} /> : null}
      <View style={styles.head}>
        {mode === 'unlock' ? <AppMark /> : null}
        <FlowLabel text={label} tone={tone} />
        {isPin ? (
          <PinDots filled={entry.length} total={total} error={error === 'lock.wrongPin'} shakeStyle={shakeStyle} />
        ) : (
          <>
            <PatternGrid
              path={path}
              onDone={onPattern}
              error={!!error}
              hideLine={config.hidePatternLine}
              disabled={locked || checking}
              shakeStyle={shakeStyle}
            />
            {showFp ? (
              <Pressable onPress={fingerprint} accessibilityRole="button" accessibilityLabel={t('lock.fingerprint')} style={({ pressed }) => [styles.fpbtn, { backgroundColor: pressed ? colors.surface2 : colors.surface }]}>
                <Ionicons name="finger-print" size={28} color={colors.content} />
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      {isPin ? (
        <Keypad onDigit={onDigit} onDelete={onDelete} onFingerprint={fingerprint} fingerprint={showFp} disabled={locked} />
      ) : null}
      <View style={styles.foot}>
        <Pressable onPress={forgot} accessibilityRole="button" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.content }]}>{t(isPin ? 'lock.forgotPin' : 'lock.forgotPattern')}</Text>
        </Pressable>
      </View>

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
  flow: { flex: 1 },
  head: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 },
  foot: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, alignItems: 'center' },
  link: { height: 48, justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { fontFamily: fonts.semibold, fontSize: 15 },
  fpbtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
})
