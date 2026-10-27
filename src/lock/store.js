// App lock storage, on this device only (expo-secure-store, Android Keystore
// backed, excluded from Android Auto Backup; never SQLite, AsyncStorage, the
// sync snapshot or the Drive backup). Three entries:
// - lock_config: the settings (enabled, method, fingerprint, delay, hide
//   preview, hide pattern line);
// - lock_secret: the PIN or pattern as a salted PBKDF2-SHA256 hash, plus the
//   PIN length (the lock screen checks a PIN at its last digit);
// - lock_attempts: failure count and the running lockout, so killing the app
//   does not reset them.
// The code itself is never stored, returned or logged.
import * as SecureStore from 'expo-secure-store'
import { getRandomBytes } from 'expo-crypto'
import { pbkdf2, utf8, toHex, fromHex, equalBytes } from './crypto'

const CONFIG_KEY = 'lock_config'
const SECRET_KEY = 'lock_secret'
const ATTEMPTS_KEY = 'lock_attempts'

// PBKDF2 rounds: pure JS on Hermes, so kept so a check stays well under a
// second on a modest phone. Stored with each hash, so it can change later.
const ITERATIONS = 5000

export const PIN_MIN = 4
export const PIN_MAX = 6
export const PATTERN_MIN = 4
export const FAILURES_PER_LOCKOUT = 5
// Wait after each series of 5 failures: 30 s, 1, 2, 5, then 15 min (ceiling)
export const LOCKOUT_STEPS_MS = [30e3, 60e3, 120e3, 300e3, 900e3]
export const DELAYS_MS = [0, 60e3, 300e3, 900e3]

export const DEFAULT_CONFIG = {
  enabled: false,
  method: 'pin', // 'pin' | 'pattern'
  fingerprint: false,
  delayMs: 0,
  hidePreview: false,
  hidePatternLine: false,
}

function readJson(key) {
  try {
    const raw = SecureStore.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  SecureStore.setItem(key, JSON.stringify(value))
}

// Attempt bookkeeping must never make a check throw
function writeAttempts(value) {
  try { writeJson(ATTEMPTS_KEY, value) } catch { /* the in-memory result still applies */ }
}

/* -------------------------------- Config -------------------------------- */

// The effective settings: the lock counts as on only with a stored secret of
// the same method (a missing or unreadable secret never locks the owner out)
export function loadConfig() {
  const stored = readJson(CONFIG_KEY) || {}
  const config = { ...DEFAULT_CONFIG, ...stored }
  if (!DELAYS_MS.includes(config.delayMs)) config.delayMs = 0
  const secret = readJson(SECRET_KEY)
  if (!secret || secret.method !== config.method) {
    config.enabled = false
    config.fingerprint = false
  }
  config.pinLength = secret?.method === 'pin' ? secret.len : 0
  return config
}

export function saveConfig(config) {
  const { pinLength, ...rest } = config
  writeJson(CONFIG_KEY, { ...DEFAULT_CONFIG, ...rest })
}

/* -------------------------------- Secret -------------------------------- */

const encode = (method, value) => utf8(`${method}:${value}`)

// value: the PIN digits, or the pattern as point indices joined by '-'
export function setSecret(method, value) {
  const salt = getRandomBytes(16)
  const hash = pbkdf2(encode(method, value), salt, ITERATIONS)
  writeJson(SECRET_KEY, {
    v: 1,
    method,
    salt: toHex(salt),
    iter: ITERATIONS,
    hash: toHex(hash),
    len: method === 'pin' ? String(value).length : 0,
  })
}

export function clearSecret() {
  return SecureStore.deleteItemAsync(SECRET_KEY)
}

function matches(value) {
  const secret = readJson(SECRET_KEY)
  if (!secret) return false
  const got = pbkdf2(encode(secret.method, value), fromHex(secret.salt), secret.iter || ITERATIONS)
  return equalBytes(got, fromHex(secret.hash))
}

/* ------------------------------- Attempts ------------------------------- */

function readAttempts() {
  const a = readJson(ATTEMPTS_KEY)
  return a && typeof a.failures === 'number' ? a : { failures: 0, start: 0, wait: 0 }
}

/**
 * Remaining lockout in ms (0 = none). A clock moved backwards (now before
 * the start of the wait) starts the full wait again.
 */
export function lockoutRemaining(now = Date.now()) {
  const a = readAttempts()
  if (!a.wait) return 0
  if (now < a.start) {
    writeAttempts({ ...a, start: now })
    return a.wait
  }
  return Math.max(0, a.start + a.wait - now)
}

export function resetAttempts() {
  writeAttempts({ failures: 0, start: 0, wait: 0 })
}

/**
 * Checks a code. Returns { ok, lockoutMs }: lockoutMs > 0 means the code was
 * not even checked (a wait is running) or this failure started a wait.
 */
export function verifySecret(value) {
  const running = lockoutRemaining()
  if (running > 0) return { ok: false, lockoutMs: running }
  if (matches(value)) {
    resetAttempts()
    return { ok: true, lockoutMs: 0 }
  }
  const a = readAttempts()
  const failures = a.failures + 1
  let wait = 0
  if (failures % FAILURES_PER_LOCKOUT === 0) {
    const series = failures / FAILURES_PER_LOCKOUT
    wait = LOCKOUT_STEPS_MS[Math.min(series, LOCKOUT_STEPS_MS.length) - 1]
  }
  writeAttempts({ failures, start: wait ? Date.now() : 0, wait })
  return { ok: false, lockoutMs: wait }
}
