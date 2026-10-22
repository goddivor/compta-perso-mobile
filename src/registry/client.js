// Registry client: countries, currencies, operators and SVGs of the public
// compta-perso-registry, read through jsDelivr from an IMMUTABLE tag and
// cached in the document directory, so it works offline after the first
// fetch. Memory cache on top (one promise per file, deduplicated).
// Errors: a rejected promise with err.code = 'offline' (no cache and no
// network) or 'not_found' (HTTP 404); screens translate them.
import * as FileSystem from 'expo-file-system/legacy'

export const REGISTRY_TAG = 'v1.1.0'
export const REGISTRY_BASE = `https://cdn.jsdelivr.net/gh/goddivor/compta-perso-registry@${REGISTRY_TAG}/`
const CACHE_DIR = `${FileSystem.documentDirectory}registry/${REGISTRY_TAG}/`
const TIMEOUT_MS = 15000

const memory = new Map() // path → Promise<string>
const values = new Map() // path → parsed value (sync peek once loaded)

const cacheUri = (path) => CACHE_DIR + path.replace(/[^\w.-]+/g, '_')

async function fetchText(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(REGISTRY_BASE + path, { signal: controller.signal })
    if (res.status === 404) throw Object.assign(new Error(`registry: ${path} not found`), { code: 'not_found' })
    if (!res.ok) throw Object.assign(new Error(`registry: HTTP ${res.status} for ${path}`), { code: 'offline' })
    return await res.text()
  } catch (e) {
    if (e.code) throw e
    throw Object.assign(new Error(`registry: cannot reach ${path} (${e.message})`), { code: 'offline' })
  } finally {
    clearTimeout(timer)
  }
}

// Raw text of a registry file ('data/countries.json', 'svg/flags/1x1/tg.svg'…):
// file cache first, network otherwise (then cached). Tag is immutable: no expiry.
export function getText(path) {
  if (!memory.has(path)) {
    const p = (async () => {
      const uri = cacheUri(path)
      const info = await FileSystem.getInfoAsync(uri)
      if (info.exists) return FileSystem.readAsStringAsync(uri)
      const text = await fetchText(path)
      try {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })
        await FileSystem.writeAsStringAsync(uri, text)
      } catch (e) {
        console.warn('registry cache write failed', path, e)
      }
      return text
    })()
    memory.set(path, p)
    p.catch(() => memory.delete(path)) // let a later call retry
  }
  return memory.get(path)
}

// Raw text of a registry file from memory or the file cache only, never
// the network: null when it was never downloaded (fast, offline-safe boot).
export async function getCachedText(path) {
  if (memory.has(path)) return memory.get(path)
  const uri = cacheUri(path)
  const info = await FileSystem.getInfoAsync(uri)
  return info.exists ? FileSystem.readAsStringAsync(uri) : null
}

// Parsed JSON of a cached registry file, or null (see getCachedText)
export async function getCachedJson(path) {
  if (values.has(path)) return values.get(path)
  const text = await getCachedText(path)
  if (text == null) return null
  const v = JSON.parse(text)
  values.set(path, v)
  return v
}

// Parsed JSON of a registry file (cached parse)
export async function getJson(path) {
  if (values.has(path)) return values.get(path)
  const v = JSON.parse(await getText(path))
  values.set(path, v)
  return v
}

// Synchronous read of something already loaded (undefined otherwise)
export const peek = (path) => values.get(path)
export const remember = (path, value) => values.set(path, value)
