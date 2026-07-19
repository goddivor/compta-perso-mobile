// Cloud sync client for compta-perso-sync-api (Vercel).
// The API URL and token are NEVER typed in (nor shown): they are fetched
// from GET /api/config with the X-Config-Key header. The key is inlined at
// build time from the EXPO_PUBLIC_CONFIG_KEY env variable (.env, gitignored).
// Config lives in AsyncStorage: api_url, token, config_fetched_at,
// last_push, last_pull.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import { dumpAllData, restoreAllData } from '../db/database'

const CONFIG_URL = 'https://compta-perso-sync-api.vercel.app/api/config'
const CONFIG_KEY = process.env.EXPO_PUBLIC_CONFIG_KEY
const FETCH_TIMEOUT_MS = 15000

const KEYS = ['api_url', 'token', 'config_fetched_at', 'last_push', 'last_pull']

// Typed error so the UI can show a clean translated message.
// code: 'offline' | 'unauthorized' | 'server' | 'not_configured'
export class SyncError extends Error {
  constructor(code, message, status) {
    super(message || code)
    this.code = code
    this.status = status
  }
}

export async function getSyncConfig() {
  const pairs = await AsyncStorage.multiGet(KEYS)
  const cfg = { api_url: '', token: '', config_fetched_at: null, last_push: null, last_pull: null }
  for (const [k, v] of pairs) {
    if (v != null) cfg[k] = v
  }
  return cfg
}

export async function saveSyncConfig(partial) {
  const entries = Object.entries(partial).filter(([k]) => KEYS.includes(k))
  await AsyncStorage.multiSet(entries.map(([k, v]) => [k, v == null ? '' : String(v)]))
  return getSyncConfig()
}

// Wipe the local sync configuration (URL, token and dates)
export async function resetSyncConfig() {
  await AsyncStorage.multiRemove(KEYS)
}

export function isConfigured(cfg) {
  return !!(cfg && cfg.api_url && cfg.token)
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch {
    // Offline, DNS failure or timeout
    throw new SyncError('offline')
  } finally {
    clearTimeout(timer)
  }
}

// Fetch the remote configuration (api_url + token) with the build-time key
// and store it locally. Returns the fresh config.
export async function fetchRemoteConfig() {
  if (!CONFIG_KEY) throw new SyncError('unauthorized')
  const res = await fetchWithTimeout(CONFIG_URL, {
    headers: { 'X-Config-Key': CONFIG_KEY },
  })
  if (res.status === 401 || res.status === 403) throw new SyncError('unauthorized')
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok || !body.api_url || !body.token) {
    throw new SyncError('server', body.error, res.status)
  }
  return saveSyncConfig({
    api_url: body.api_url,
    token: body.token,
    config_fetched_at: new Date().toISOString(),
  })
}

function assertConfigured(cfg) {
  if (!isConfigured(cfg)) throw new SyncError('not_configured')
}

async function api(cfg, path, options = {}) {
  const url = cfg.api_url.replace(/\/$/, '') + path
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 || res.status === 403) throw new SyncError('unauthorized')
  if (!res.ok) throw new SyncError('server', body.error, res.status)
  return body
}

function deviceName() {
  return `mobile-${Device.modelName || 'android'}`
}

// Push ALL local rows of every table to the cloud
export async function syncPush() {
  const cfg = await getSyncConfig()
  assertConfigured(cfg)
  const data = dumpAllData()
  const result = await api(cfg, '/api/push', {
    method: 'POST',
    body: JSON.stringify({ device: deviceName(), data }),
  })
  await saveSyncConfig({ last_push: new Date().toISOString() })
  return result
}

// Pull the cloud snapshot and REPLACE all local content
export async function syncPull() {
  const cfg = await getSyncConfig()
  assertConfigured(cfg)
  const result = await api(cfg, '/api/pull', { method: 'GET' })
  restoreAllData(result.data)
  await saveSyncConfig({ last_pull: new Date().toISOString() })
  return result.meta
}

export async function syncStatus() {
  const cfg = await getSyncConfig()
  assertConfigured(cfg)
  const result = await api(cfg, '/api/status', { method: 'GET' })
  return result.meta
}
