// Optional Google Drive backup: the user signs in with his own Google
// account and the app stores a single JSON snapshot of the 4 sync tables
// in the PRIVATE appDataFolder space of HIS Drive (invisible in "My Drive",
// removed when the app access is revoked). The app remains 100% usable
// without any account. The web client ID is inlined at build time from
// EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (.env, gitignored); when missing, every
// interactive action fails with a clean 'not_configured' error.
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import { dumpAllData, restoreAllData } from '../db/database'
import { getCurrentVersion } from '../updates/updater'

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const BACKUP_FILE_NAME = 'compta-perso-backup.json'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const FETCH_TIMEOUT_MS = 20000

// AsyncStorage keys
const ACCOUNT_KEY = 'google_account' // JSON {email, name, photo}
const LAST_BACKUP_KEY = 'google_last_backup_at' // ISO date of last upload
const FREQUENCY_KEY = 'google_backup_frequency' // manual | open | daily | weekly

export const FREQUENCIES = ['manual', 'open', 'daily', 'weekly']

// Typed error so the UI can show a clean translated message.
// code: 'not_configured' | 'play_services' | 'cancelled' | 'offline'
//     | 'signin_required' | 'server' | 'no_backup'
export class BackupError extends Error {
  constructor(code, message, status) {
    super(message || code)
    this.code = code
    this.status = status
  }
}

/* ----------------------------- Google account ---------------------------- */

export function isGoogleConfigured() {
  return !!WEB_CLIENT_ID
}

let configured = false
function ensureConfigured() {
  if (!WEB_CLIENT_ID) throw new BackupError('not_configured')
  if (!configured) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, scopes: [DRIVE_SCOPE] })
    configured = true
  }
}

// Connected account as stored locally ({email, name, photo}) or null.
// Source of truth for "is Google backup enabled" across app restarts.
export async function getStoredAccount() {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function storeAccount(user) {
  const account = {
    email: user?.email || '',
    name: user?.name || '',
    photo: user?.photo || null,
  }
  await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account)).catch(() => {})
  return account
}

// Interactive sign-in (button). Throws BackupError; 'cancelled' when the
// user closes the account picker.
export async function signIn() {
  ensureConfigured()
  const hasPlay = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    .catch(() => false)
  if (!hasPlay) throw new BackupError('play_services')

  let res
  try {
    res = await GoogleSignin.signIn()
  } catch (e) {
    // Native failure (network, misconfigured client ID...)
    throw new BackupError('server', e?.message)
  }
  if (res?.type !== 'success') throw new BackupError('cancelled')
  return storeAccount(res.data?.user)
}

export async function signOut() {
  if (WEB_CLIENT_ID) {
    ensureConfigured()
    await GoogleSignin.signOut().catch(() => {})
  }
  await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {})
}

// In-memory native user (null after an app restart until a silent sign-in)
export function getCurrentUser() {
  try {
    ensureConfigured()
    return GoogleSignin.getCurrentUser()
  } catch {
    return null
  }
}

// Access token for the Drive REST calls. After an app restart the native
// module has no user in memory: try one silent sign-in before giving up.
export async function getAccessToken() {
  ensureConfigured()
  try {
    return (await GoogleSignin.getTokens()).accessToken
  } catch {
    const res = await GoogleSignin.signInSilently().catch(() => null)
    if (res?.type !== 'success') throw new BackupError('signin_required')
    await storeAccount(res.data?.user)
    try {
      return (await GoogleSignin.getTokens()).accessToken
    } catch {
      throw new BackupError('signin_required')
    }
  }
}

/* ----------------------------- Drive REST client -------------------------- */

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch {
    // Offline, DNS failure or timeout
    throw new BackupError('offline')
  } finally {
    clearTimeout(timer)
  }
}

// Authenticated Drive call. On a 401 (expired access token) the cached
// token is cleared and the call retried once after a silent re-sign-in.
async function driveFetch(url, options = {}, retry = true) {
  const token = await getAccessToken()
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (res.status === 401 && retry) {
    await GoogleSignin.clearCachedAccessToken(token).catch(() => {})
    await GoogleSignin.signInSilently().catch(() => {})
    return driveFetch(url, options, false)
  }
  if (res.status === 401 || res.status === 403) throw new BackupError('signin_required')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new BackupError('server', body?.error?.message, res.status)
  }
  return res
}

// Backup file in the appDataFolder ({id, name, modifiedTime, size}) or null
export async function findBackup() {
  const url =
    `${FILES_URL}?spaces=appDataFolder&fields=${encodeURIComponent('files(id,name,modifiedTime,size)')}` +
    `&q=${encodeURIComponent(`name = '${BACKUP_FILE_NAME}'`)}`
  const res = await driveFetch(url)
  const body = await res.json().catch(() => ({}))
  return (body.files || []).find((f) => f.name === BACKUP_FILE_NAME) || null
}

// Create (multipart, parented in appDataFolder) or update (media PATCH)
// the single backup file. `json` is the already-serialized payload.
export async function uploadBackup(json) {
  const existing = await findBackup()
  if (existing) {
    await driveFetch(`${UPLOAD_URL}/${existing.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })
    return existing.id
  }
  const boundary = `compta_perso_${Date.now()}`
  const metadata = { name: BACKUP_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${json}\r\n--${boundary}--`
  const res = await driveFetch(`${UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  const created = await res.json().catch(() => ({}))
  return created.id || null
}

export async function downloadBackup(id) {
  const res = await driveFetch(`${FILES_URL}/${id}?alt=media`)
  try {
    return await res.json()
  } catch {
    throw new BackupError('server')
  }
}

/* ----------------------------- Backup / restore --------------------------- */

export async function getLastBackupAt() {
  return AsyncStorage.getItem(LAST_BACKUP_KEY).catch(() => null)
}

// Full local dump (same tables as the cloud sync) + meta, uploaded to the
// user's Drive. Returns the meta of the uploaded snapshot.
export async function backupNow() {
  const meta = {
    app_version: getCurrentVersion(),
    device: `mobile-${Device.modelName || 'android'}`,
    created_at: new Date().toISOString(),
  }
  await uploadBackup(JSON.stringify({ meta, data: dumpAllData() }))
  await AsyncStorage.setItem(LAST_BACKUP_KEY, meta.created_at).catch(() => {})
  return meta
}

// Download the Drive snapshot and REPLACE all local content. Only call
// after an explicit UI confirmation.
export async function restoreFromDrive() {
  const file = await findBackup()
  if (!file) throw new BackupError('no_backup')
  const payload = await downloadBackup(file.id)
  if (!payload || typeof payload !== 'object' || !payload.data) throw new BackupError('server')
  restoreAllData(payload.data)
  return payload.meta || null
}

/* --------------------------- Automatic frequency -------------------------- */

export async function getBackupFrequency() {
  const v = await AsyncStorage.getItem(FREQUENCY_KEY).catch(() => null)
  return FREQUENCIES.includes(v) ? v : 'manual'
}

export function setBackupFrequency(freq) {
  const v = FREQUENCIES.includes(freq) ? freq : 'manual'
  return AsyncStorage.setItem(FREQUENCY_KEY, v).catch(() => {})
}

const DAY_MS = 24 * 60 * 60 * 1000

// Silent startup backup (called ~8 s after launch): runs only when a
// Google account is connected AND the chosen frequency is due. Never
// throws (offline, expired session... are swallowed).
export async function maybeAutoBackup() {
  try {
    if (!WEB_CLIENT_ID) return false
    const account = await getStoredAccount()
    if (!account) return false
    const freq = await getBackupFrequency()
    if (freq === 'manual') return false
    if (freq !== 'open') {
      const last = await getLastBackupAt()
      if (last) {
        const age = Date.now() - new Date(last).getTime()
        const limit = freq === 'daily' ? DAY_MS : 7 * DAY_MS
        if (age >= 0 && age < limit) return false
      }
    }
    await backupNow()
    return true
  } catch {
    return false
  }
}
