// The phone's own security, through expo-local-authentication: is a screen
// lock set, is a strong biometric (fingerprint) enrolled, and the two system
// prompts (fingerprint only, for unlocking; the phone's screen lock, for a
// forgotten code). Every prompt runs without the app lock (guard.js).
import * as LocalAuthentication from 'expo-local-authentication'
import { startActivityAsync } from 'expo-intent-launcher'
import { withoutLock } from './guard'

const { SecurityLevel } = LocalAuthentication

/** True when the phone has a PIN, pattern or password screen lock. */
export async function hasDeviceLock() {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) >= SecurityLevel.SECRET
  } catch {
    return false
  }
}

/** True when a Class 3 biometric (a fingerprint) is enrolled. */
export async function hasStrongBiometrics() {
  try {
    const [hardware, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ])
    return hardware && level >= SecurityLevel.BIOMETRIC_STRONG
  } catch {
    return false
  }
}

/**
 * Fingerprint prompt, no device fallback (the app has its own code).
 * Returns 'success' | 'cancel' | 'error'.
 */
export async function promptFingerprint({ title, cancelLabel }) {
  try {
    const res = await withoutLock(() => LocalAuthentication.authenticateAsync({
      promptMessage: title,
      cancelLabel,
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
      requireConfirmation: false,
    }))
    if (res.success) return 'success'
    return ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(res.error) ? 'cancel' : 'error'
  } catch {
    return 'error'
  }
}

/**
 * The phone's own screen lock (forgotten code). The system may also offer an
 * enrolled biometric next to it. Returns 'success' | 'cancel' | 'no_lock'.
 */
export async function promptDeviceCredential({ title }) {
  if (!(await hasDeviceLock())) return 'no_lock'
  try {
    const res = await withoutLock(() => LocalAuthentication.authenticateAsync({
      promptMessage: title,
      disableDeviceFallback: false,
      biometricsSecurityLevel: 'weak',
      requireConfirmation: false,
    }))
    if (res.success) return 'success'
    return res.error === 'not_enrolled' || res.error === 'passcode_not_set' ? 'no_lock' : 'cancel'
  } catch {
    return 'cancel'
  }
}

/** Opens the Android security settings (to set a screen lock). */
export function openSecuritySettings() {
  return withoutLock(() => startActivityAsync('android.settings.SECURITY_SETTINGS')).catch(() => {})
}
