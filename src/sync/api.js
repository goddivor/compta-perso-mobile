// Cloud sync client for compta-perso-sync-api (Vercel).
// Config lives in AsyncStorage: api_url, token, last_push, last_pull.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import { dumpAllData, restoreAllData } from '../db/database'

const KEYS = ['api_url', 'token', 'last_push', 'last_pull']

export async function getSyncConfig() {
  const pairs = await AsyncStorage.multiGet(KEYS)
  const cfg = { api_url: '', token: '', last_push: null, last_pull: null }
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

function assertConfigured(cfg) {
  if (!cfg.api_url || !cfg.token) {
    throw new Error("Sync non configurée : renseigne l'URL de l'API et le token")
  }
}

async function api(cfg, path, options = {}) {
  const url = cfg.api_url.replace(/\/$/, '') + path
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
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
