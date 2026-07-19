// In-app update check against GitHub Releases.
// The app is distributed as an APK attached to each release of
// goddivor/compta-perso-mobile: we compare the installed version with the
// latest release tag and offer the APK download link when a newer one exists.
import * as Application from 'expo-application'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'

const RELEASES_LATEST_URL =
  'https://api.github.com/repos/goddivor/compta-perso-mobile/releases/latest'
const DISMISSED_KEY = 'update_dismissed_version'
const RELEASE_CACHE_KEY = 'release_cache'
const FETCH_TIMEOUT_MS = 10000

// Installed version: native versionName first (real APK version), then the
// Expo config version (dev / Expo Go), then a safe default.
export function getCurrentVersion() {
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    '1.0.0'
  )
}

// Simple semver comparison ('1.2.10' > '1.2.9'). Returns -1 / 0 / 1.
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da !== db) return da > db ? 1 : -1
  }
  return 0
}

/* --------------------------- Release cache ------------------------------- */
// Last successful checkForUpdate result, persisted so the About screen and
// the update modal can show the release notes instantly without refetching.
// Shape: { version, notes, apkUrl, pageUrl, fetched_at }

export async function getCachedRelease() {
  try {
    const raw = await AsyncStorage.getItem(RELEASE_CACHE_KEY)
    const cache = raw ? JSON.parse(raw) : null
    return cache && cache.version ? cache : null
  } catch {
    return null
  }
}

function cacheRelease(info) {
  const cache = {
    version: info.latest,
    notes: info.notes || '',
    apkUrl: info.apkUrl || null,
    pageUrl: info.pageUrl || null,
    fetched_at: new Date().toISOString(),
  }
  return AsyncStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify(cache)).catch(() => {})
}

// Rebuild a checkForUpdate-shaped info object from the cache (About screen
// and update modal reuse the exact same rendering path).
export function releaseInfoFromCache(cache) {
  if (!cache) return null
  const current = getCurrentVersion()
  return {
    available: compareVersions(cache.version, current) > 0,
    current,
    latest: cache.version,
    notes: cache.notes || '',
    apkUrl: cache.apkUrl || null,
    pageUrl: cache.pageUrl || 'https://github.com/goddivor/compta-perso-mobile/releases',
    fromCache: true,
  }
}

// Queries the latest GitHub release. Never throws: returns
// { available: false } offline or on any API error.
// Every successful check refreshes the persisted release cache.
// Shape: { available, current, latest, notes, apkUrl, pageUrl }
export async function checkForUpdate() {
  const current = getCurrentVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return { available: false, current, latest: null }
    const release = await res.json()
    const latest = String(release.tag_name || '').replace(/^v/, '')
    if (!latest) return { available: false, current, latest: null }
    const apkAsset = (release.assets || []).find((a) => a.name?.endsWith('.apk'))
    const info = {
      available: compareVersions(latest, current) > 0,
      current,
      latest,
      notes: release.body || '',
      apkUrl: apkAsset?.browser_download_url || null,
      pageUrl: release.html_url || 'https://github.com/goddivor/compta-perso-mobile/releases',
    }
    await cacheRelease(info)
    return info
  } catch {
    // Offline, timeout or GitHub unavailable: fail silently
    return { available: false, current, latest: null }
  } finally {
    clearTimeout(timer)
  }
}

// Rough markdown → plain text for the release notes (headings, emphasis,
// links, list bullets).
export function markdownToText(md) {
  return String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^\s*[-*+]\s+/gm, '•  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Silent check on app startup: returns the update info only when a newer
// version exists AND it has not been dismissed before (once per version).
// The caller shows the in-app UpdateModal (download + install).
export async function getStartupUpdate() {
  const info = await checkForUpdate()
  if (!info.available) return null
  const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null)
  if (dismissed === info.latest) return null
  return info
}

// "Later" on the update modal: do not show this version again on startup
export function dismissUpdateVersion(version) {
  return AsyncStorage.setItem(DISMISSED_KEY, String(version)).catch(() => {})
}
